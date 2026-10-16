import { describe, it, expect } from "vitest";
import { buildNodeIndex, toStoredModelKey, toPickerModelValue } from "@/shared/utils/scopeKeys.js";

const NODES = [
  { id: "openai-compatible-chat-abc123", prefix: "oc-prod", name: "Relay Prod" },
  { id: "anthropic-compatible-ac-77", prefix: "ac-relay" },
  { id: "openai-compatible-chat-noprefix" },
];

describe("scope key conversion for compatible nodes", () => {
  const index = buildNodeIndex(NODES);

  it("maps picker prefix values to runtime-matching scope keys", () => {
    expect(toStoredModelKey("oc-prod/glm-4.7", index)).toBe("openai-compatible-chat-abc123/glm-4.7");
    expect(toStoredModelKey("ac-relay/opus-mini", index)).toBe("anthropic-compatible-ac-77/opus-mini");
  });

  it("keeps standard provider values untouched", () => {
    expect(toStoredModelKey("oc/grok-code-fast-1", index)).toBe("oc/grok-code-fast-1");
    expect(toStoredModelKey("opencode/some-model", index)).toBe("opencode/some-model");
    expect(toStoredModelKey("combo-name", index)).toBe("combo-name");
  });

  it("keeps a node-id key unchanged (only models with / split at first slash)", () => {
    expect(toStoredModelKey("openai-compatible-chat-abc123/glm-4.7", index))
      .toBe("openai-compatible-chat-abc123/glm-4.7");
    // model ids with extra slashes stay intact after the first segment
    expect(toStoredModelKey("oc-prod/meta/llama-3", index)).toBe("openai-compatible-chat-abc123/meta/llama-3");
  });

  it("maps scope keys back to picker display values", () => {
    expect(toPickerModelValue("openai-compatible-chat-abc123/glm-4.7", index)).toBe("oc-prod/glm-4.7");
    expect(toPickerModelValue("anthropic-compatible-ac-77/x", index)).toBe("ac-relay/x");
  });

  it("leaves keys without a node prefix mapping alone, including prefix-less nodes", () => {
    expect(toPickerModelValue("oc/grok-code-fast-1", index)).toBe("oc/grok-code-fast-1");
    expect(toPickerModelValue("openai-compatible-chat-noprefix/x", index)).toBe("openai-compatible-chat-noprefix/x");
    expect(toPickerModelValue("plain", index)).toBe("plain");
  });

  it("returns the trimmed input when no index is available", () => {
    expect(toStoredModelKey(" oc-prod/x ", null)).toBe("oc-prod/x");
    expect(toPickerModelValue(" oc-prod/x ", undefined)).toBe("oc-prod/x");
  });

  it("ignores malformed entries", () => {
    expect(toStoredModelKey("/leading-slash", index)).toBe("/leading-slash");
    expect(toStoredModelKey("", index)).toBe("");
    expect(toStoredModelKey(null, index)).toBe("");
  });
});
