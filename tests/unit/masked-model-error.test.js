import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getModelInfo: vi.fn(),
  getProviderCredentials: vi.fn(),
  markAccountUnavailable: vi.fn(),
  handleEmbeddingsCore: vi.fn(),
}));

vi.mock("../../src/sse/services/auth.js", () => ({
  getProviderCredentials: mocks.getProviderCredentials,
  markAccountUnavailable: mocks.markAccountUnavailable,
  clearAccountError: vi.fn(),
  extractApiKey: () => "client-key",
  isValidApiKey: vi.fn(),
}));
vi.mock("@/lib/localDb", () => ({ getSettings: async () => ({ requireApiKey: false }) }));
vi.mock("../../src/sse/services/model.js", () => ({ getModelInfo: mocks.getModelInfo }));
vi.mock("../../src/sse/services/keyAccess.js", () => ({
  getKeyAccessContext: async () => ({}),
  enforceKeyAccessResolved: () => null,
}));
vi.mock("../../open-sse/handlers/embeddingsCore.js", () => ({
  handleEmbeddingsCore: mocks.handleEmbeddingsCore,
}));
vi.mock("../../src/sse/utils/logger.js", () => ({
  request: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), maskKey: vi.fn(),
}));
vi.mock("../../src/sse/services/tokenRefresh.js", () => ({
  updateProviderCredentials: vi.fn(),
  checkAndRefreshToken: async (_provider, credentials) => credentials,
}));
vi.mock("@/lib/usageDb.js", () => ({ saveRequestUsage: vi.fn() }));

// Real error.js on purpose: the friendly message and retry-after header are
// part of what these tests assert, so the actual Response builders must run.
import { handleEmbeddings } from "../../src/sse/handlers/embeddings.js";
import { MASKED_MODEL_ERROR_MESSAGE } from "@/shared/utils/nadeaiModels.js";

function embeddingsRequest(model) {
  return new Request("http://localhost/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, input: "hello" }),
  });
}

describe("masked-model error message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markAccountUnavailable.mockResolvedValue({ shouldFallback: false });
    mocks.getProviderCredentials.mockResolvedValue({
      apiKey: "provider-secret",
      connectionId: "conn-1",
      connectionName: "Account A",
    });
  });

  it("replaces upstream errors with the friendly message for any registered masked alias", async () => {
    // Public head "stealth" — not "nadeai" — proves detection rides on alias
    // resolution (viaAlias), not on the head spelling.
    mocks.getModelInfo.mockResolvedValue({
      provider: "oc",
      model: "space-bunny-free",
      viaAlias: "stealth/space-bunny-jailbreak",
    });
    mocks.handleEmbeddingsCore.mockResolvedValue({
      success: false,
      status: 429,
      error: "FreeTierError: upstream quota exceeded",
      response: Response.json(
        { error: { message: "FreeTierError: upstream quota exceeded" } },
        { status: 429 },
      ),
    });

    const res = await handleEmbeddings(embeddingsRequest("stealth/space-bunny-jailbreak"));
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error.message).toBe(MASKED_MODEL_ERROR_MESSAGE);
    expect(JSON.stringify(body)).not.toContain("FreeTierError");
    expect(JSON.stringify(body)).not.toContain("space-bunny-free");
  });

  it("masks missing-credential errors for an unregistered nadeai head", async () => {
    // Broken/missing alias: getModelInfo falls back to the raw parse, so the
    // nadeai head check must prevent a "No credentials for provider" leak.
    mocks.getModelInfo.mockResolvedValue({ provider: "nadeai", model: "ghost-model" });
    mocks.getProviderCredentials.mockResolvedValue(null);

    const res = await handleEmbeddings(embeddingsRequest("nadeai/ghost-model"));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error.message).toBe(MASKED_MODEL_ERROR_MESSAGE);
    expect(JSON.stringify(body)).not.toContain("No credentials");
  });

  it("keeps retry-after on masked rate-limit errors", async () => {
    mocks.getModelInfo.mockResolvedValue({
      provider: "oc",
      model: "space-bunny-free",
      viaAlias: "nadeai/space-bunny",
    });
    mocks.getProviderCredentials.mockResolvedValue({
      allRateLimited: true,
      retryAfter: new Date(Date.now() + 30_000).toISOString(),
      retryAfterHuman: "reset after 30s",
      lastError: "429 rate limited",
      lastErrorCode: 429,
    });

    const res = await handleEmbeddings(embeddingsRequest("nadeai/space-bunny"));
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(body.error.message).toContain(MASKED_MODEL_ERROR_MESSAGE);
    expect(body.error.message).not.toContain("oc/space-bunny-free");
  });

  it("leaves non-masked model errors untouched", async () => {
    mocks.getModelInfo.mockResolvedValue({ provider: "openai", model: "text-embedding-3-small" });
    mocks.handleEmbeddingsCore.mockResolvedValue({
      success: false,
      status: 500,
      error: "upstream boom",
      response: Response.json({ error: { message: "upstream boom" } }, { status: 500 }),
    });

    const res = await handleEmbeddings(embeddingsRequest("openai/text-embedding-3-small"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.message).toBe("upstream boom");
  });
});
