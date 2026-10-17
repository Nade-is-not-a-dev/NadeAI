// NadeAI Assistant — pure helpers for parsing the OpenAI-style SSE stream of
// the internal /v1/chat/completions call. Pure module (no imports) so unit
// tests can exercise it directly.

/**
 * Accumulate streamed `tool_calls` deltas. OpenAI-compatible providers send
 * the id/name once and the arguments as string fragments keyed by `index`.
 * Providers occasionally resend the full name; only true fragments append.
 */
export function mergeToolCallDeltas(toolCalls, deltas) {
  for (const delta of deltas || []) {
    if (!delta || typeof delta !== "object") continue;
    const index = Number.isInteger(delta.index) ? delta.index : 0;
    let slot = toolCalls[index];
    if (!slot) slot = toolCalls[index] = { id: "", name: "", arguments: "" };

    if (typeof delta.id === "string" && delta.id) slot.id = delta.id;

    const fn = delta.function || {};
    if (typeof fn.name === "string" && fn.name) {
      if (!slot.name || fn.name.startsWith(slot.name)) slot.name = fn.name;
      else if (!slot.name.endsWith(fn.name)) slot.name += fn.name;
    }
    if (typeof fn.arguments === "string" && fn.arguments) slot.arguments += fn.arguments;
  }
  return toolCalls;
}

/** Drop empty slots, fill missing ids, keep only named calls in index order. */
export function finalizeToolCalls(toolCalls) {
  return (toolCalls || [])
    .map((slot, index) => (slot ? { id: slot.id || `call_${index}`, name: slot.name || "", arguments: slot.arguments || "" } : null))
    .filter((slot) => slot && slot.name);
}

/** True when the SSE payload line carries assistant-visible content. */
export function extractDelta(chunk) {
  const choice = chunk?.choices?.[0] || null;
  if (!choice) return { content: "", toolCalls: null, finishReason: null };
  const delta = choice.delta || {};
  return {
    content: typeof delta.content === "string" ? delta.content : "",
    toolCalls: Array.isArray(delta.tool_calls) ? delta.tool_calls : null,
    finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : null,
  };
}
