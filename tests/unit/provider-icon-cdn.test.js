import { describe, it, expect, afterEach, vi } from "vitest";

const ENV_KEY = "NEXT_PUBLIC_ICON_BASE";

async function loadModule() {
  vi.resetModules();
  return import("@/shared/utils/providerIcon.js");
}

describe("providerIcon CDN base", () => {
  const original = process.env[ENV_KEY];
  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it("serves icons from the local path by default", async () => {
    delete process.env[ENV_KEY];
    const mod = await loadModule();
    expect(mod.getIconCdnBase()).toBe("");
    expect(mod.getProviderIconSrc("claude")).toBe("/providers/claude.png");
  });

  it("uses the CDN base when NEXT_PUBLIC_ICON_BASE is set, trimming trailing slashes", async () => {
    process.env[ENV_KEY] = "https://cdn.example.com/gh/user/repo@master///";
    const mod = await loadModule();
    expect(mod.getIconCdnBase()).toBe("https://cdn.example.com/gh/user/repo@master");
    expect(mod.getProviderIconSrc("claude")).toBe(
      "https://cdn.example.com/gh/user/repo@master/providers/claude.png"
    );
  });

  it("keeps brand aliases in CDN mode", async () => {
    process.env[ENV_KEY] = "https://cdn.example.com";
    const mod = await loadModule();
    expect(mod.getProviderIconSrc("perplexity-agent")).toBe(
      "https://cdn.example.com/providers/perplexity.png"
    );
  });

  it("still session-caches missing icons", async () => {
    delete process.env[ENV_KEY];
    const mod = await loadModule();
    expect(mod.getProviderIconSrc("claude")).toBe("/providers/claude.png");
    mod.markProviderIconMissing("claude");
    expect(mod.getProviderIconSrc("claude")).toBe(null);
  });

  it("treats a blank value as disabled", async () => {
    process.env[ENV_KEY] = "   ";
    const mod = await loadModule();
    expect(mod.getIconCdnBase()).toBe("");
    expect(mod.getProviderIconSrc("cursor")).toBe("/providers/cursor.png");
  });
});
