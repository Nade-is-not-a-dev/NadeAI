// NadeAI Assistant — the turn runner.
//
// One turn = a small tool loop against this instance's own OpenAI-compatible
// endpoint: call the model (streaming), execute any requested tools, feed the
// results back, repeat (max MAX_TOOL_ROUNDS tool rounds, then one final
// answer round with tools disabled). Yields UI events; the API route encodes
// them as SSE.

import { ASSISTANT_TOOLS } from "./defs.js";
import { executeAssistantTool } from "./tools.js";
import { internalBaseUrl, internalHeaders } from "./internal.js";
import { buildSystemPrompt, sanitizeHistory } from "./prompt.js";
import { mergeToolCallDeltas, finalizeToolCalls, extractDelta } from "./stream.js";

const MAX_TOOL_ROUNDS = 5;
const MAX_TOOL_RESULT_CHARS = 8000;
const DEFAULT_MAX_TOKENS = 4096;

function trim(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Call the model once. Yields { type: "delta", text } for visible content and
 * returns { content, toolCalls, finishReason } when the stream ends.
 */
async function* callModel({ model, messages, tools, signal }) {
  const payload = {
    model,
    messages,
    stream: true,
    max_tokens: DEFAULT_MAX_TOKENS,
  };
  if (tools?.length) {
    payload.tools = tools;
    payload.tool_choice = "auto";
  }

  let res;
  try {
    res = await fetch(`${internalBaseUrl()}/api/v1/chat/completions`, {
      method: "POST",
      headers: await internalHeaders(),
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    throw new Error(`Router call failed: ${error?.message || error}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Router HTTP ${res.status}: ${trim(text, 400) || "no body"}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    // Some providers downgrade the response to a single JSON body.
    const text = await res.text().catch(() => "");
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    const message = data?.choices?.[0]?.message || {};
    const content = typeof message.content === "string" ? message.content : "";
    if (content) yield { type: "delta", text: content };
    const toolCalls = finalizeToolCalls(
      (message.tool_calls || []).map((call) => ({ id: call?.id, name: call?.function?.name, arguments: call?.function?.arguments })),
    );
    return { content, toolCalls, finishReason: data?.choices?.[0]?.finish_reason || "stop" };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finished = false;
  const rawToolCalls = [];

  while (!finished) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex;
    while (!finished && (newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line.startsWith("data:")) continue;

      const data = line.slice(5).trim();
      if (!data) continue;
      if (data === "[DONE]") {
        finished = true;
        continue;
      }

      let chunk = null;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }

      const { content: piece, toolCalls } = extractDelta(chunk);
      if (piece) {
        content += piece;
        yield { type: "delta", text: piece };
      }
      if (toolCalls) mergeToolCallDeltas(rawToolCalls, toolCalls);
    }
  }

  return { content, toolCalls: finalizeToolCalls(rawToolCalls), finishReason: null };
}

/**
 * Run one assistant turn. `messages` = prior visible chat turns (user/assistant).
 * Yields events: start handled by the route; here: delta / tool_start /
 * tool_result / action / error / done.
 */
export async function* runAssistantTurn({ messages, model, page, systemPromptExtra = "", signal }) {
  const history = sanitizeHistory(messages);
  const systemPrompt =
    buildSystemPrompt({ pagePath: page?.path }) + (systemPromptExtra ? `\n\n# Operator instructions\n${systemPromptExtra}` : "");
  const turn = [{ role: "system", content: systemPrompt }, ...history];

  let rounds = 0;
  while (true) {
    const useTools = rounds < MAX_TOOL_ROUNDS;

    let result;
    try {
      result = yield* callModel({ model, messages: turn, tools: useTools ? ASSISTANT_TOOLS : null, signal });
    } catch (error) {
      yield { type: "error", message: String(error?.message || error) };
      return;
    }

    const toolCalls = result.toolCalls || [];
    if (!toolCalls.length) {
      yield { type: "done", stopReason: "answer", rounds };
      return;
    }
    if (!useTools) {
      // Should not happen (no tools were offered), but never loop forever.
      yield { type: "done", stopReason: "max_rounds", rounds };
      return;
    }

    turn.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments || "{}" },
      })),
    });

    for (const call of toolCalls) {
      let args = {};
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {
        args = {};
      }

      yield { type: "tool_start", id: call.id, name: call.name, args };
      const outcome = await executeAssistantTool(call.name, args, { page });
      if (outcome.action) yield { type: "action", id: call.id, name: outcome.action.name, args: outcome.action.args };
      yield {
        type: "tool_result",
        id: call.id,
        name: call.name,
        ok: !!outcome.ok,
        note: outcome.note || null,
        preview: outcome.preview || null,
      };

      turn.push({
        role: "tool",
        tool_call_id: call.id,
        content: trim(JSON.stringify(outcome.result ?? {}), MAX_TOOL_RESULT_CHARS),
      });
    }

    rounds += 1;
  }
}
