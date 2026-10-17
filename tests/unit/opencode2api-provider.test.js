import { describe, it, expect } from "vitest";
import { PROVIDERS, PROVIDER_MODELS } from "open-sse/providers/index.js";
import { getExecutor } from "open-sse/executors/index.js";
import { resolveOpencode2ApiBaseUrl } from "open-sse/executors/opencode2api.js";
import { getDefaultModel } from "open-sse/config/providerModels.js";

describe("opencode2api provider", () => {
  it("is registered with an OpenAI-compatible transport", () => {
    expect(PROVIDERS.opencode2api).toBeDefined();
    expect(PROVIDERS.opencode2api.format).toBe("openai");
  });

  it("exposes the curated free model list", () => {
    const models = PROVIDER_MODELS.o2a.map((m) => m.id);
    expect(models).toContain("space-bunny-free");
    expect(getDefaultModel("o2a")).toBe("space-bunny-free");
    // Models the gateway filters out must not be advertised.
    expect(models).not.toContain("cat-jam-free");
    expect(models).not.toContain("step-5-preview-free");
  });

  it("resolves the gateway host per connection, defaulting to localhost", () => {
    expect(resolveOpencode2ApiBaseUrl({})).toBe("http://127.0.0.1:5678");
    expect(resolveOpencode2ApiBaseUrl({ providerSpecificData: { baseUrl: "http://gw.local:9000/" } }))
      .toBe("http://gw.local:9000");
    // The gateway README prints the base URL with /v1; do not double it.
    expect(resolveOpencode2ApiBaseUrl({ providerSpecificData: { baseUrl: "http://gw.local:9000/v1" } }))
      .toBe("http://gw.local:9000");
  });

  it("builds the chat URL from the connection base URL", () => {
    const ex = getExecutor("opencode2api");
    expect(ex.buildUrl("space-bunny-free", true, 0, {}))
      .toBe("http://127.0.0.1:5678/v1/chat/completions");
    expect(ex.buildUrl("space-bunny-free", true, 0, { providerSpecificData: { baseUrl: "https://gw.example.com/v1" } }))
      .toBe("https://gw.example.com/v1/chat/completions");
  });

  it("sends the server key as a plain bearer token and does not cloak", () => {
    const ex = getExecutor("opencode2api");
    const creds = { apiKey: "server-key", accessToken: "server-key" };
    const headers = ex.buildHeaders(creds, true, "http://x/v1/chat/completions", "space-bunny-free");
    expect(headers.Authorization).toBe("Bearer server-key");
    expect(headers["x-opencode-session"]).toBeUndefined();
    // No OpenCode client impersonation: the gateway does that handshake itself.
    expect(headers["User-Agent"] || "").not.toMatch(/^opencode\//);

    const body = { model: "space-bunny-free", messages: [{ role: "user", content: "hi" }] };
    const out = ex.transformRequest("space-bunny-free", body, false, creds);
    expect(out.stream).not.toBe(true);
    expect((out.tools || []).map((t) => t.function?.name || t.name)).not.toContain("read");
  });
});
