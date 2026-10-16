import { describe, it, expect, vi } from "vitest";
import { createLatestCommitChecker, getCommitStatus } from "@/lib/latestCommit.js";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const okResponse = (sha) => ({ ok: true, json: async () => ([{ sha }]) });

describe("createLatestCommitChecker", () => {
  it("fetches the latest commit sha for the repo with GitHub headers", async () => {
    const fetchImpl = vi.fn(async () => okResponse(SHA_A));
    const check = createLatestCommitChecker({ fetchImpl });

    const res = await check("owner/repo");
    expect(res).toEqual({ sha: SHA_A, short: "a".repeat(7) });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/owner/repo/commits?per_page=1");
    expect(opts.headers.Accept).toBe("application/vnd.github+json");
    expect(opts.headers["User-Agent"]).toBeTruthy();
  });

  it("caches successes within the ttl and refetches after it", async () => {
    let t = 0;
    const fetchImpl = vi.fn(async () => okResponse(SHA_A));
    const check = createLatestCommitChecker({ fetchImpl, ttlMs: 1000, now: () => t });

    await check("o/r");
    t = 500;
    expect(await check("o/r")).toEqual({ sha: SHA_A, short: "a".repeat(7) });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    t = 1001;
    await check("o/r");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns null on failure and short-caches failures", async () => {
    let t = 0;
    const fetchImpl = vi.fn(async () => { throw new Error("offline"); });
    const check = createLatestCommitChecker({ fetchImpl, failTtlMs: 5000, now: () => t });

    expect(await check("o/r")).toBe(null);
    expect(await check("o/r")).toBe(null);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    t = 5001;
    await check("o/r");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed and non-ok responses", async () => {
    const responses = [
      { ok: false, json: async () => ({}) },
      { ok: true, json: async () => [] },
      { ok: true, json: async () => [{ sha: "not-a-sha" }] },
      { ok: true, json: async () => ({ message: "Not Found" }) },
      { ok: true, json: async () => { throw new Error("bad json"); } },
    ];
    for (const res of responses) {
      const check = createLatestCommitChecker({ fetchImpl: async () => res });
      expect(await check("o/r")).toBe(null);
    }
  });

  it("refetches when the repo slug changes", async () => {
    const fetchImpl = vi.fn(async (url) => okResponse(url.includes("a/b") ? SHA_A : SHA_B));
    const check = createLatestCommitChecker({ fetchImpl });

    await check("a/b");
    const second = await check("e/f");
    expect(second.sha).toBe(SHA_B);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns null for an empty slug without fetching", async () => {
    const fetchImpl = vi.fn();
    const check = createLatestCommitChecker({ fetchImpl });
    expect(await check("")).toBe(null);
    expect(await check(null)).toBe(null);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("getCommitStatus", () => {
  const check = async () => ({ sha: SHA_B, short: "b".repeat(7) });

  it("reports latest when the build sha matches (case-insensitive)", async () => {
    expect(await getCommitStatus({ commit: SHA_B.toUpperCase(), repoSlug: "o/r", check })).toEqual({
      commitLatest: "b".repeat(7),
      commitIsLatest: true,
    });
  });

  it("reports a newer commit when the shas differ", async () => {
    expect(await getCommitStatus({ commit: SHA_A, repoSlug: "o/r", check })).toEqual({
      commitLatest: "b".repeat(7),
      commitIsLatest: false,
    });
  });

  it("returns unknown without a build sha, slug, or lookup result", async () => {
    const unknown = { commitLatest: null, commitIsLatest: null };
    expect(await getCommitStatus({ commit: "", repoSlug: "o/r", check })).toEqual(unknown);
    expect(await getCommitStatus({ commit: SHA_B, repoSlug: "", check })).toEqual(unknown);
    expect(await getCommitStatus({ commit: SHA_B, repoSlug: "o/r", check: async () => null })).toEqual(unknown);
  });

  it("wires into the /api/version route (import graph resolves)", async () => {
    const route = await import("@/app/api/version/route.js");
    expect(typeof route.GET).toBe("function");
  });
});
