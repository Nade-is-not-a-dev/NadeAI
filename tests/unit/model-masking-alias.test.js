// Slashed alias keys ("anthropic/claude-fable-5.1" → "oc/deepseek-v4.1-flash-free")
// are the model-masking primitive: the requested id must route to the alias
// target before its head is treated as a provider prefix, and must report
// viaAlias so replies and system-prompt scopes can echo the requested spelling.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;

async function setupDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-mask-alias-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();

  const { setModelAlias } = await import("@/models/index.js");
  const { getModelInfo } = await import("@/sse/services/model.js");

  return {
    setModelAlias,
    getModelInfo,
    cleanup() {
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

describe("model masking aliases", () => {
  let cleanup = () => {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    cleanup();
    cleanup = () => {};
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
  });

  it("resolves a slashed alias key to its target provider/model", async () => {
    const ctx = await setupDb();
    cleanup = ctx.cleanup;

    await ctx.setModelAlias("anthropic/claude-fable-5.1", "oc/deepseek-v4.1-flash-free");

    await expect(ctx.getModelInfo("anthropic/claude-fable-5.1")).resolves.toEqual({
      provider: "opencode",
      model: "deepseek-v4.1-flash-free",
      viaAlias: "anthropic/claude-fable-5.1",
    });
  });

  it("lets a slashed alias win over a built-in provider prefix", async () => {
    const ctx = await setupDb();
    cleanup = ctx.cleanup;

    await ctx.setModelAlias("openai/gpt-6-x", "oc/glm-5.3-flash-free");

    await expect(ctx.getModelInfo("openai/gpt-6-x")).resolves.toEqual({
      provider: "opencode",
      model: "glm-5.3-flash-free",
      viaAlias: "openai/gpt-6-x",
    });
  });

  it("keeps normal provider/model routing when no alias matches", async () => {
    const ctx = await setupDb();
    cleanup = ctx.cleanup;

    await expect(ctx.getModelInfo("oc/deepseek-v4.1-flash-free")).resolves.toEqual({
      provider: "opencode",
      model: "deepseek-v4.1-flash-free",
    });
  });
});
