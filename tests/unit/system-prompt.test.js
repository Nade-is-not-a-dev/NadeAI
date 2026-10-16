import { describe, it, expect } from "vitest";
import { resolveSystemPrompt, applySystemPrompt } from "../../open-sse/services/systemPrompt.js";
import { PROVIDER_ALIASES_BY_ID, resolveProviderAlias } from "../../open-sse/services/model.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const cfg = (over = {}) => ({
  enabled: true,
  universal: "",
  providers: {},
  models: {},
  ...over,
});

const target = { provider: "opencode", alias: "oc", model: "grok-code-fast-1" };

describe("resolveSystemPrompt", () => {
  it("returns nothing when the feature is disabled", () => {
    const config = cfg({ enabled: false, universal: "U", providers: { opencode: "P" } });
    expect(resolveSystemPrompt(config, target)).toEqual({ text: "", scopes: [] });
  });

  it("stacks universal + provider + model layers in order", () => {
    const config = cfg({
      universal: "U",
      providers: { opencode: "P" },
      models: { "oc/grok-code-fast-1": "M" },
    });
    const { text, scopes } = resolveSystemPrompt(config, target);
    expect(text).toBe("U\n\nP\n\nM");
    expect(scopes).toEqual(["universal", "provider:opencode", "model:oc/grok-code-fast-1"]);
  });

  it("matches provider keys by id or alias", () => {
    expect(resolveSystemPrompt(cfg({ providers: { opencode: "P" } }), target).text).toBe("P");
    expect(resolveSystemPrompt(cfg({ providers: { oc: "P" } }), target).text).toBe("P");
  });

  it("matches model keys by provider/model or alias/model", () => {
    expect(resolveSystemPrompt(cfg({ models: { "opencode/grok-code-fast-1": "M" } }), target).text).toBe("M");
    expect(resolveSystemPrompt(cfg({ models: { "oc/grok-code-fast-1": "M" } }), target).text).toBe("M");
    expect(resolveSystemPrompt(cfg({ models: { "oc/other": "M" } }), target).text).toBe("");
  });

  it("matches registry alias spellings that route to the provider", () => {
    const dsTarget = { provider: "deepseek", alias: "deepseek", aliases: ["ds"], model: "chat-v9" };
    expect(resolveSystemPrompt(cfg({ providers: { ds: "P" } }), dsTarget).text).toBe("P");
    expect(resolveSystemPrompt(cfg({ models: { "ds/chat-v9": "M" } }), dsTarget).text).toBe("M");
    // a spelling that routes elsewhere is not accepted
    expect(resolveSystemPrompt(cfg({ models: { "zq/chat-v9": "M" } }), dsTarget).text).toBe("");
  });

  it("prefers the provider id when both id and alias keys are configured", () => {
    const config = cfg({
      providers: { opencode: "ID", oc: "ALIAS" },
      models: { "opencode/grok-code-fast-1": "MID", "oc/grok-code-fast-1": "MALIAS" },
    });
    expect(resolveSystemPrompt(config, target).text).toBe("ID\n\nMID");
  });

  it("ignores blank and non-string values", () => {
    const config = cfg({ universal: "   ", providers: { opencode: 42 }, models: { "oc/grok-code-fast-1": null } });
    expect(resolveSystemPrompt(config, target).text).toBe("");
  });

  it("survives malformed configs", () => {
    expect(resolveSystemPrompt(null, target).text).toBe("");
    expect(resolveSystemPrompt(cfg(), {}).text).toBe("");
    expect(resolveSystemPrompt(cfg({ providers: "nope", models: 7 }), target).text).toBe("");
  });
});

describe("PROVIDER_ALIASES_BY_ID", () => {
  it("lists the router's spellings for known providers", () => {
    expect(PROVIDER_ALIASES_BY_ID.opencode).toContain("oc");
    expect(PROVIDER_ALIASES_BY_ID.deepseek).toContain("ds");
    expect(PROVIDER_ALIASES_BY_ID["cloudflare-ai"]).toContain("cf");
  });

  it("every listed spelling routes back to its provider", () => {
    for (const [id, spellings] of Object.entries(PROVIDER_ALIASES_BY_ID)) {
      for (const spelling of spellings) {
        expect(resolveProviderAlias(spelling)).toBe(id);
      }
    }
  });

  it("does not claim spellings that route to another provider", () => {
    // mimo-free's UI alias `mmf` collides with the `mmf` provider id, so it
    // must not be listed as a mimo-free spelling.
    expect(PROVIDER_ALIASES_BY_ID["mimo-free"] || []).not.toContain("mmf");
  });
});

describe("applySystemPrompt", () => {
  const openaiBody = () => ({
    model: "opencode/grok-code-fast-1",
    messages: [
      { role: "system", content: "base" },
      { role: "user", content: "hi" },
    ],
  });

  it("prepends ahead of the existing OpenAI system message", () => {
    const body = openaiBody();
    const applied = applySystemPrompt(body, FORMATS.OPENAI, cfg({ universal: "U" }), target);
    expect(applied).toEqual({ scopes: ["universal"], chars: 1 });
    expect(body.messages[0].content).toBe("U\n\nbase");
  });

  it("keeps the router layers above the client's system text", () => {
    const body = {
      model: "opencode/grok-code-fast-1",
      messages: [
        { role: "system", content: "client-base" },
        { role: "user", content: "hi" },
      ],
    };
    const config = cfg({ universal: "U", providers: { opencode: "P" }, models: { "oc/grok-code-fast-1": "M" } });
    applySystemPrompt(body, FORMATS.OPENAI, config, target);
    expect(body.messages[0].content).toBe("U\n\nP\n\nM\n\nclient-base");
    expect(body.messages[1]).toEqual({ role: "user", content: "hi" });
  });

  it("creates a system message when the OpenAI request has none", () => {
    const body = { messages: [{ role: "user", content: "hi" }] };
    applySystemPrompt(body, FORMATS.OPENAI, cfg({ universal: "U" }), target);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toEqual({ role: "system", content: "U" });
  });

  it("handles Claude system strings and block arrays", () => {
    const asString = { system: "base", messages: [] };
    applySystemPrompt(asString, FORMATS.CLAUDE, cfg({ universal: "U" }), target);
    expect(asString.system).toBe("U\n\nbase");

    const asBlocks = { system: [{ type: "text", text: "base" }], messages: [] };
    applySystemPrompt(asBlocks, FORMATS.CLAUDE, cfg({ universal: "U" }), target);
    expect(asBlocks.system).toHaveLength(2);
    expect(asBlocks.system[0]).toEqual({ type: "text", text: "U" });
    expect(asBlocks.system[1]).toEqual({ type: "text", text: "base" });
  });

  it("handles Gemini systemInstruction parts", () => {
    const body = { contents: [], systemInstruction: { parts: [{ text: "base" }] } };
    applySystemPrompt(body, FORMATS.GEMINI, cfg({ universal: "U" }), target);
    expect(body.systemInstruction.parts).toHaveLength(2);
    expect(body.systemInstruction.parts[0]).toEqual({ text: "U" });
    expect(body.systemInstruction.parts[1]).toEqual({ text: "base" });
  });

  it("handles OpenAI Responses instructions strings", () => {
    const body = { instructions: "base", input: [] };
    applySystemPrompt(body, FORMATS.OPENAI_RESPONSES, cfg({ universal: "U" }), target);
    expect(body.instructions).toBe("U\n\nbase");
  });

  it("is idempotent when applied twice", () => {
    const body = openaiBody();
    applySystemPrompt(body, FORMATS.OPENAI, cfg({ universal: "U" }), target);
    applySystemPrompt(body, FORMATS.OPENAI, cfg({ universal: "U" }), target);
    expect(body.messages[0].content).toBe("U\n\nbase");
  });

  it("returns null and leaves the body alone when nothing applies", () => {
    const body = openaiBody();
    expect(applySystemPrompt(body, FORMATS.OPENAI, cfg({ enabled: false, universal: "U" }), target)).toBeNull();
    expect(applySystemPrompt(body, FORMATS.OPENAI, cfg({ providers: { other: "P" } }), target)).toBeNull();
    expect(body.messages[0].content).toBe("base");
  });

  it("fails open on a frozen body", () => {
    const body = Object.freeze({ messages: Object.freeze([{ role: "user", content: "hi" }]) });
    expect(() => applySystemPrompt(body, FORMATS.OPENAI, cfg({ universal: "U" }), target)).not.toThrow();
  });
});
