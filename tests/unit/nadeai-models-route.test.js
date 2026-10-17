// NadeAI masked-model API end to end on a temp DB: the route writes the
// slashed alias + per-model prompt together, renames move both, deletes clean
// both, and the router resolves the public ids the route created.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;

async function setup() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-nadeai-"));
  process.env.DATA_DIR = tempDir;
  // The DB adapter is cached on `global` to survive Next.js HMR, so
  // vi.resetModules() alone keeps the first test's database. Clear it so this
  // test binds to its own DATA_DIR (repo idiom - see db-driver-chain.test.js).
  try { global._dbAdapter?.instance?.close?.(); } catch { /* already closed */ }
  delete global._dbAdapter;
  vi.resetModules();

  const route = await import("@/app/api/nadeai/models/route.js");
  const { getModelInfo } = await import("@/sse/services/model.js");
  const { getSettings } = await import("@/lib/localDb");

  const put = (payload) =>
    route.PUT(
      new Request("http://local/api/nadeai/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
  const list = async () => (await (await route.GET()).json()).models;
  const del = (fakeId) =>
    route.DELETE(
      new Request(
        `http://local/api/nadeai/models?fakeId=${encodeURIComponent(fakeId)}`,
        { method: "DELETE" },
      ),
    );

  return {
    route,
    getModelInfo,
    getSettings,
    put,
    list,
    del,
    cleanup() {
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

describe("NadeAI masked-model API", () => {
  let cleanup = () => {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    try { global._dbAdapter?.instance?.close?.(); } catch { /* already closed */ }
    delete global._dbAdapter;
    vi.resetModules();
    vi.clearAllMocks();
    cleanup();
    cleanup = () => {};
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
  });

  it("creates an entry: alias + prompt stored, router resolves the public id", async () => {
    const ctx = await setup();
    cleanup = ctx.cleanup;

    const res = await ctx.put({
      fakeId: "nadeai/claude-fable-5.1",
      realId: "oc/deepseek-v4.1-flash-free",
      systemPrompt: "You are Claude Fable 5.1.",
    });
    expect(res.status).toBe(200);

    expect(await ctx.list()).toEqual([
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

    await expect(ctx.getModelInfo("nadeai/claude-fable-5.1")).resolves.toEqual({
      provider: "opencode",
      model: "deepseek-v4.1-flash-free",
      viaAlias: "nadeai/claude-fable-5.1",
    });

    const settings = await ctx.getSettings();
    expect(settings.systemPrompts.models["nadeai/claude-fable-5.1"]).toBe(
      "You are Claude Fable 5.1.",
    );
  });

  it("renames the public id and moves the prompt with it", async () => {
    const ctx = await setup();
    cleanup = ctx.cleanup;

    await ctx.put({
      fakeId: "nadeai/claude-fable-5.1",
      realId: "oc/deepseek-v4.1-flash-free",
      systemPrompt: "mask",
    });
    const res = await ctx.put({
      previousFakeId: "nadeai/claude-fable-5.1",
      fakeId: "anthropic/claude-fable-5.1",
      realId: "oc/deepseek-v4.1-flash-free",
      systemPrompt: "mask",
    });
    expect(res.status).toBe(200);

    expect((await ctx.list()).map((m) => m.id)).toEqual(["anthropic/claude-fable-5.1"]);
    await expect(ctx.getModelInfo("nadeai/claude-fable-5.1")).resolves.toEqual({
      provider: "nadeai",
      model: "claude-fable-5.1",
    });

    const settings = await ctx.getSettings();
    expect(settings.systemPrompts.models["anthropic/claude-fable-5.1"]).toBe("mask");
    expect(settings.systemPrompts.models["nadeai/claude-fable-5.1"]).toBeUndefined();
  });

  it("clearing the prompt on edit removes the scope key", async () => {
    const ctx = await setup();
    cleanup = ctx.cleanup;

    await ctx.put({ fakeId: "nadeai/x", realId: "oc/y", systemPrompt: "mask" });
    await ctx.put({
      previousFakeId: "nadeai/x",
      fakeId: "nadeai/x",
      realId: "oc/y",
      systemPrompt: "",
    });

    const settings = await ctx.getSettings();
    expect(settings.systemPrompts.models["nadeai/x"]).toBeUndefined();
  });

  it("deletes alias and prompt together", async () => {
    const ctx = await setup();
    cleanup = ctx.cleanup;

    await ctx.put({ fakeId: "nadeai/x", realId: "oc/y", systemPrompt: "mask" });
    const res = await ctx.del("nadeai/x");
    expect(res.status).toBe(200);

    expect(await ctx.list()).toEqual([]);
    const settings = await ctx.getSettings();
    expect(settings.systemPrompts.models["nadeai/x"]).toBeUndefined();
  });

  it("validates payloads and refuses to overwrite another entry", async () => {
    const ctx = await setup();
    cleanup = ctx.cleanup;

    expect((await ctx.put({ fakeId: "nadeai", realId: "oc/x" })).status).toBe(400);
    expect((await ctx.put({ fakeId: "nadeai/x", realId: "nope" })).status).toBe(400);
    expect((await ctx.put({ fakeId: "nadeai/x", realId: "nadeai/x" })).status).toBe(400);

    await ctx.put({ fakeId: "nadeai/a", realId: "oc/x" });
    const clash = await ctx.put({
      fakeId: "nadeai/a",
      realId: "oc/y",
      previousFakeId: "nadeai/b",
    });
    expect(clash.status).toBe(409);
  });
});
