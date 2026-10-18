// Server-side upstream retry (relay resilience): 403/429/5xx are retried by
// the executor before an error reaches the client. Defaults: 10 total tries
// per request, 500ms between tries, 3-minute overall budget.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// Keep the file-level tests instant: no delay between tries.
vi.stubEnv("NADEAI_RETRY_DELAY_MS", "0");

const fetchMock = vi.fn();
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => fetchMock(...args),
}));

const { BaseExecutor } = await import("../../open-sse/executors/base.js");
const { UPSTREAM_RETRY_CONFIG } = await import("../../open-sse/config/runtimeConfig.js");

function res(status) {
  return { status, headers: { get: () => "" } };
}

const creds = { apiKey: "k" };

beforeEach(() => fetchMock.mockReset());

describe("UPSTREAM_RETRY_CONFIG defaults", () => {
  it("covers relay-transient statuses with 10 total attempts", () => {
    for (const status of [403, 408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 529]) {
      // attempts = retries after the first try: 9 retries + first try = 10 total
      expect(UPSTREAM_RETRY_CONFIG[status]?.attempts).toBe(9);
    }
  });

  it("leaves request-scoped client errors untried", () => {
    for (const status of [400, 401, 404, 406, 422]) {
      expect(UPSTREAM_RETRY_CONFIG[status]).toBeUndefined();
    }
  });
});

describe("BaseExecutor default retries (no per-provider retry config)", () => {
  it("retries a 403 and succeeds when a later attempt passes", async () => {
    const ex = new BaseExecutor("test", { baseUrl: "https://relay/api" });
    let n = 0;
    fetchMock.mockImplementation(async () => (++n < 3 ? res(403) : res(200)));
    const out = await ex.execute({ model: "m", body: {}, stream: false, credentials: creds });
    expect(out.response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after 10 total tries on a persistent 403", async () => {
    const ex = new BaseExecutor("test", { baseUrl: "https://relay/api" });
    fetchMock.mockResolvedValue(res(403));
    const out = await ex.execute({ model: "m", body: {}, stream: false, credentials: creds });
    expect(out.response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("does not retry a 400", async () => {
    const ex = new BaseExecutor("test", { baseUrl: "https://relay/api" });
    fetchMock.mockResolvedValue(res(400));
    const out = await ex.execute({ model: "m", body: {}, stream: false, credentials: creds });
    expect(out.response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries network errors (mapped to the 502 config)", async () => {
    const ex = new BaseExecutor("test", { baseUrl: "https://relay/api" });
    fetchMock
      .mockImplementationOnce(async () => { throw new Error("ECONNRESET"); })
      .mockResolvedValue(res(200));
    const out = await ex.execute({ model: "m", body: {}, stream: false, credentials: creds });
    expect(out.response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a provider retry entry still overrides the defaults", async () => {
    const ex = new BaseExecutor("test", { baseUrl: "https://relay/api", retry: { 403: { attempts: 0 } } });
    fetchMock.mockResolvedValue(res(403));
    const out = await ex.execute({ model: "m", body: {}, stream: false, credentials: creds });
    expect(out.response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("env overrides (fresh module import)", () => {
  afterAll(() => vi.unstubAllEnvs());

  it("NADEAI_RETRY_STATUSES replaces the default status set", async () => {
    vi.resetModules();
    vi.stubEnv("NADEAI_RETRY_STATUSES", "418");
    const { UPSTREAM_RETRY_CONFIG: cfg } = await import("../../open-sse/config/runtimeConfig.js");
    expect(cfg[418]?.attempts).toBe(9);
    expect(cfg[403]).toBeUndefined();
    expect(cfg[429]).toBeUndefined();
  });

  it("NADEAI_RETRY_MAX_ATTEMPTS and NADEAI_RETRY_DELAY_MS drive attempts and delay", async () => {
    vi.resetModules();
    vi.stubEnv("NADEAI_RETRY_STATUSES", "");
    vi.stubEnv("NADEAI_RETRY_MAX_ATTEMPTS", "4");
    vi.stubEnv("NADEAI_RETRY_DELAY_MS", "0");
    const { UPSTREAM_RETRY_CONFIG: cfg } = await import("../../open-sse/config/runtimeConfig.js");
    expect(cfg[403]?.attempts).toBe(3); // 4 total tries
    expect(cfg[403]?.delayMs).toBe(0);
  });

  it("NADEAI_RETRY_BUDGET_MS caps the retry window", async () => {
    vi.resetModules();
    vi.stubEnv("NADEAI_RETRY_STATUSES", "");
    vi.stubEnv("NADEAI_RETRY_MAX_ATTEMPTS", "10");
    vi.stubEnv("NADEAI_RETRY_DELAY_MS", "5");
    vi.stubEnv("NADEAI_RETRY_BUDGET_MS", "12");
    const { BaseExecutor: FreshExecutor } = await import("../../open-sse/executors/base.js");
    const ex = new FreshExecutor("test", { baseUrl: "https://relay/api" });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(res(403));
    const out = await ex.execute({ model: "m", body: {}, stream: false, credentials: creds });
    expect(out.response.status).toBe(403);
    expect(fetchMock.mock.calls.length).toBeLessThan(10); // budget cut the loop short
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
