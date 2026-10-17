import { describe, it, expect } from "vitest";

import {
  ASSISTANT_PAGES,
  ASSISTANT_SIDEBAR_LINKS,
  findAssistantPage,
  findAssistantTarget,
  assistantTargetIds,
} from "@/shared/constants/assistantMap.js";
import { ASSISTANT_TOOLS, UI_TOOL_NAMES } from "@/lib/nadeai/assistant/defs.js";
import { buildSystemPrompt, sanitizeHistory } from "@/lib/nadeai/assistant/prompt.js";
import { mergeToolCallDeltas, finalizeToolCalls, extractDelta } from "@/lib/nadeai/assistant/stream.js";

describe("assistant page map", () => {
  it("keeps target ids unique across pages and sidebar", () => {
    const total =
      ASSISTANT_PAGES.reduce((count, page) => count + (page.targets || []).length, 0) + ASSISTANT_SIDEBAR_LINKS.length;
    const ids = assistantTargetIds();
    expect(ids.length).toBe(total);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps page paths unique and dashboard-scoped", () => {
    const paths = ASSISTANT_PAGES.map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const page of ASSISTANT_PAGES) expect(page.path.startsWith("/dashboard")).toBe(true);
  });

  it("resolves pages and targets, ignoring query strings", () => {
    expect(findAssistantPage("/dashboard/providers?tab=x").path).toBe("/dashboard/providers");
    const target = findAssistantTarget("providers-add-openai");
    expect(target.pagePath).toBe("/dashboard/providers");
    expect(findAssistantTarget("nav-assistant").sidebar).toBe(true);
    expect(findAssistantTarget("does-not-exist")).toBeNull();
  });
});

describe("assistant tool definitions", () => {
  it("keeps tool names unique with object schemas", () => {
    const names = ASSISTANT_TOOLS.map((tool) => tool.function.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of ASSISTANT_TOOLS) {
      expect(tool.type).toBe("function");
      expect(typeof tool.function.description).toBe("string");
      expect(tool.function.description.length).toBeGreaterThan(10);
      expect(tool.function.parameters.type).toBe("object");
    }
  });

  it("marks UI tools", () => {
    expect(UI_TOOL_NAMES.has("open_page")).toBe(true);
    expect(UI_TOOL_NAMES.has("spotlight")).toBe(true);
    expect(UI_TOOL_NAMES.has("get_providers")).toBe(false);
  });
});

describe("assistant system prompt", () => {
  it("lists pages, target ids and the current page", () => {
    const prompt = buildSystemPrompt({ pagePath: "/dashboard/nadeai?tab=1" });
    expect(prompt).toContain("/dashboard/nadeai");
    expect(prompt).toContain("nadeai-add");
    expect(prompt).toContain("nav-providers");
    expect(prompt).toContain("The user is looking at: /dashboard/nadeai");
  });

  it("marks an unknown page as unknown", () => {
    expect(buildSystemPrompt({ pagePath: "/landing" })).toContain("The user is looking at: unknown page");
  });

  it("sanitises history: roles, empties and caps", () => {
    const history = sanitizeHistory([
      { role: "system", content: "dropped" },
      { role: "user", content: "halo" },
      { role: "assistant", content: "   " },
      { role: "user", content: "x".repeat(5000) },
    ]);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: "user", content: "halo" });
    expect(history[1].content.length).toBe(4000);
  });

  it("keeps only the last N messages", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ role: "user", content: `m${i}` }));
    const history = sanitizeHistory(many);
    expect(history).toHaveLength(16);
    expect(history[0].content).toBe("m14");
  });
});

describe("assistant stream helpers", () => {
  it("merges tool_call deltas by index", () => {
    const calls = [];
    mergeToolCallDeltas(calls, [{ index: 0, id: "call_1", function: { name: "test_model", arguments: '{"mo' } }]);
    mergeToolCallDeltas(calls, [{ index: 0, function: { arguments: 'del":"x"}' } }]);
    expect(finalizeToolCalls(calls)).toEqual([{ id: "call_1", name: "test_model", arguments: '{"model":"x"}' }]);
  });

  it("does not append a resent full name twice", () => {
    const calls = [];
    mergeToolCallDeltas(calls, [{ index: 0, function: { name: "get_providers" } }]);
    mergeToolCallDeltas(calls, [{ index: 0, function: { name: "get_providers" } }]);
    expect(finalizeToolCalls(calls)[0].name).toBe("get_providers");
  });

  it("drops unnamed slots and fills missing ids", () => {
    const calls = [];
    mergeToolCallDeltas(calls, [{ index: 1, function: { arguments: "{}" } }]);
    mergeToolCallDeltas(calls, [{ index: 0, function: { name: "get_usage", arguments: "{}" } }]);
    expect(finalizeToolCalls(calls)).toEqual([{ id: "call_0", name: "get_usage", arguments: "{}" }]);
  });

  it("extracts visible deltas", () => {
    expect(extractDelta({ choices: [{ delta: { content: "hi" } }] }).content).toBe("hi");
    expect(extractDelta({ choices: [{ delta: { tool_calls: [{ index: 0 }] } }] }).toolCalls).toHaveLength(1);
    expect(extractDelta({}).content).toBe("");
  });
});
