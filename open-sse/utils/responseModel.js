// Client-visible response rewriting for masked model aliases.
//
// When a client asks for a slashed alias id ("anthropic/claude-fable-5.1" →
// the real "oc/deepseek-v4.1-flash-free"), every reply shape that echoes a
// model id must echo the id the client used — otherwise the alias is pointless.
// JSON bodies and SSE chunks carry the id at the top level (OpenAI, Claude) or
// under `message` (Claude streaming message_start). Everything else is passed
// through untouched: malformed or foreign payloads stay byte-identical.
// Fail-open: any parse problem keeps the original bytes.

function applyModelToObject(obj, model) {
  if (!obj || typeof obj !== "object") return false;
  let hit = false;
  if (typeof obj.model === "string") {
    obj.model = model;
    hit = true;
  }
  const message = obj.message;
  if (message && typeof message === "object" && typeof message.model === "string") {
    message.model = model;
    hit = true;
  }
  return hit;
}

/** Rewrite the model id inside one SSE block ("event: ...\ndata: {...}"). */
export function rewriteSSEBlock(block, model) {
  return String(block)
    .split("\n")
    .map((line) => {
      const match = /^data:\s?(.+)$/.exec(line);
      if (!match) return line;
      const payload = match[1];
      if (!payload || payload.trim() === "[DONE]") return line;
      let obj;
      try {
        obj = JSON.parse(payload);
      } catch {
        return line;
      }
      if (!applyModelToObject(obj, model)) return line;
      return `data: ${JSON.stringify(obj)}`;
    })
    .join("\n");
}

/** Rewrite the model id of a JSON body (a single object, not SSE). */
export function rewriteJSONText(text, model) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return text;
  }
  if (!applyModelToObject(obj, model)) return text;
  return JSON.stringify(obj);
}

/**
 * Return a copy of an OpenAI/Claude-shaped Response whose model id reads as
 * `model`. SSE bodies are streamed through a rewrite transform; JSON bodies
 * are parsed and re-serialised. Other content types are returned as-is.
 */
export async function rewriteResponseModelField(response, model) {
  if (!response || !model) return response;
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const headers = new Headers(response.headers);
  headers.delete("content-length");

  if (contentType.includes("text/event-stream")) {
    if (!response.body) return response;
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";
    const stream = new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          controller.enqueue(encoder.encode(`${rewriteSSEBlock(block, model)}\n\n`));
        }
      },
      flush(controller) {
        if (buffer) controller.enqueue(encoder.encode(rewriteSSEBlock(buffer, model)));
      },
    });
    return new Response(response.body.pipeThrough(stream), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  if (contentType.includes("application/json")) {
    const text = await response.text();
    return new Response(rewriteJSONText(text, model), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return response;
}
