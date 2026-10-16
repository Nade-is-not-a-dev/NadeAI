import { describe, it, expect, afterEach, vi } from "vitest";

// APP_CONFIG.commit powers the "v0.5.x · <sha>" label in the sidebar.
// Sources: start.sh passes NEXT_PUBLIC_BUILD_SHA at build; next.config.mjs
// bakes BUILD_GIT_SHA. Precedence: NEXT_PUBLIC_ first, then config value,
// then "" (hidden).

async function loadConfig(patch) {
  vi.resetModules();
  delete process.env.NEXT_PUBLIC_BUILD_SHA;
  delete process.env.BUILD_GIT_SHA;
  Object.assign(process.env, patch);
  return (await import("@/shared/constants/config.js")).APP_CONFIG;
}

describe("APP_CONFIG.commit", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_BUILD_SHA;
    delete process.env.BUILD_GIT_SHA;
  });

  it("is empty when no source is set", async () => {
    expect((await loadConfig({})).commit).toBe("");
  });

  it("uses BUILD_GIT_SHA (next.config bake)", async () => {
    expect((await loadConfig({ BUILD_GIT_SHA: "aaa1111" })).commit).toBe("aaa1111");
  });

  it("uses NEXT_PUBLIC_BUILD_SHA (start.sh) and prefers it when both are set", async () => {
    expect((await loadConfig({ NEXT_PUBLIC_BUILD_SHA: "bbb2222" })).commit).toBe("bbb2222");
    expect((await loadConfig({ NEXT_PUBLIC_BUILD_SHA: "bbb2222", BUILD_GIT_SHA: "aaa1111" })).commit).toBe("bbb2222");
  });
});
