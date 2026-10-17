// Client-visible reply rewriting for masked alias requests: whatever the
// upstream calls itself, the response must carry the id the client asked for.
import { describe, it, expect } from "vitest";
import {
  rewriteSSEBlock,
  rewriteJSONText,
  rewriteResponseModelField,
} from "../../open-sse/utils/responseModel.js";

const MASKED = "anthropic/claude-fable-5.1";

describe("rewriteJSONText", () => {
  it("rewrites the top-level model field", () => {
    const body = JSON.stringify({ id: "x", object: "chat.completion", model: "deepseek-v4.1-flash-free", choices: [] });
    expect(JSON.parse(rewriteJSONText(body, MASKED)).model).toBe(MASKED);
  });

  it("leaves non-JSON text untouched", () => {
    expect(rewriteJSONText("not json", MASKED)).toBe("not json");
  });
});

describe("rewriteSSEBlock", () => {
  it("rewrites OpenAI-style chunk model fields", () => {
    const block = `data: ${JSON.stringify({ id: "x", model: "deepseek-v4.1-flash-free", choices: [] })}`;
    expect(rewriteSSEBlock(block, MASKED)).toContain(`"model":"${MASKED}"`);
  });

  it("rewrites the Claude message_start nested model", () => {
    const block = `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { model: "deepseek-v4.1-flash-free" } })}`;
    expect(rewriteSSEBlock(block, MASKED)).toContain(`"model":"${MASKED}"`);
  });

  it("keeps [DONE] and model-less frames byte-identical", () => {
    expect(rewriteSSEBlock("data: [DONE]", MASKED)).toBe("data: [DONE]");
    const plain = `data: ${JSON.stringify({ choices: [{ delta: { content: "hi" } }] })}`;
    expect(rewriteSSEBlock(plain, MASKED)).toBe(plain);
  });
});

describe("rewriteResponseModelField", () => {
  it("streams SSE responses through the rewrite", async () => {
    const sse = `data: ${JSON.stringify({ model: "deepseek-v4.1-flash-free", choices: [{ delta: {} }] })}\n\ndata: [DONE]\n\n`;
    const res = new Response(sse, { headers: { "content-type": "text/event-stream" } });
    const out = await rewriteResponseModelField(res, MASKED);
    const text = await out.text();
    expect(text).toContain(`"model":"${MASKED}"`);
    expect(text).toContain("data: [DONE]");
    expect(text).not.toContain("deepseek-v4.1-flash-free");
  });

  it("re-serialises JSON responses", async () => {
    const res = new Response(JSON.stringify({ model: "deepseek-v4.1-flash-free" }), { headers: { "content-type": "application/json" } });
    const out = await rewriteResponseModelField(res, MASKED);
    expect((await out.json()).model).toBe(MASKED);
  });

  it("passes non-JSON/non-SSE responses through", async () => {
    const res = new Response("plain", { headers: { "content-type": "text/plain" } });
    const out = await rewriteResponseModelField(res, MASKED);
    expect(await out.text()).toBe("plain");
  });
});
