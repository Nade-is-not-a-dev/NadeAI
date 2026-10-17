// NadeAI masked-model helpers: id parsing and the alias+prompt merge the
// /api/nadeai/models route and the dashboard page share.
import { describe, it, expect } from "vitest";
import {
  composeModelId,
  mergeMaskedModels,
  splitModelId,
} from "@/shared/utils/nadeaiModels.js";

describe("splitModelId", () => {
  it("splits at the first slash", () => {
    expect(splitModelId("nadeai/claude-fable-5.1")).toEqual({
      provider: "nadeai",
      model: "claude-fable-5.1",
    });
    expect(splitModelId("oc/@cf/model")).toEqual({ provider: "oc", model: "@cf/model" });
  });

  it("rejects ids without both parts", () => {
    expect(splitModelId("nadeai")).toBeNull();
    expect(splitModelId("/model")).toBeNull();
    expect(splitModelId("provider/")).toBeNull();
    expect(splitModelId("")).toBeNull();
    expect(splitModelId(null)).toBeNull();
  });
});

describe("composeModelId", () => {
  it("trims and joins both parts", () => {
    expect(composeModelId(" nadeai ", " x ")).toBe("nadeai/x");
    expect(composeModelId("nadeai", "")).toBe("");
    expect(composeModelId(null, "x")).toBe("");
  });
});

describe("mergeMaskedModels", () => {
  it("merges slashed aliases with prompts and skips the rest", () => {
    const entries = mergeMaskedModels(
      {
        "nadeai/claude-fable-5.1": "oc/deepseek-v4.1-flash-free",
        "display-name": "oc/glm-5.3-flash-free",
        "bad/": "oc/x",
        "x/y": "not-slashless",
      },
      { "nadeai/claude-fable-5.1": "You are Claude Fable 5.1." },
    );
    expect(entries).toEqual([
      {
        id: "nadeai/claude-fable-5.1",
        provider: "nadeai",
        model: "claude-fable-5.1",
        realProvider: "oc",
        realModel: "deepseek-v4.1-flash-free",
        realId: "oc/deepseek-v4.1-flash-free",
        systemPrompt: "You are Claude Fable 5.1.",
      },
    ]);
  });

  it("sorts entries by public id", () => {
    const entries = mergeMaskedModels({ "b/x": "oc/x", "a/y": "oc/y" }, {});
    expect(entries.map((e) => e.id)).toEqual(["a/y", "b/x"]);
  });
});
