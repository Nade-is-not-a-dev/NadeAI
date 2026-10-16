// Latest-commit lookup for the dashboard version badge ("Latest" / "Update").
//
// The running build carries the commit it was built from (BUILD_GIT_SHA) and
// the "owner/repo" of the origin remote it syncs from (BUILD_REPO_SLUG, both
// baked by next.config.mjs). /api/version asks GitHub for the newest commit on
// the repo's default branch and compares — the sidebar shows a green "Latest"
// when they match.
//
// Results are cached in-process: successes for 10 minutes, failures for 1
// minute (so an offline GitHub never turns into a lookup per page load). The
// whole thing is fail-soft — any error, malformed payload or missing config
// resolves to "unknown" (null) and the UI simply shows no badge.

const COMMITS_URL = (repoSlug) => `https://api.github.com/repos/${repoSlug}/commits?per_page=1`;

const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * Create a cached latest-commit checker. Dependencies are injectable so tests
 * can drive time and fetch deterministically.
 */
export function createLatestCommitChecker({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  ttlMs = 10 * 60 * 1000,
  failTtlMs = 60 * 1000,
  timeoutMs = 5000,
} = {}) {
  let cache = null; // { repoSlug, sha (string|null), fetchedAt }

  async function fetchLatestSha(repoSlug) {
    try {
      const res = await fetchImpl(COMMITS_URL(repoSlug), {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "9router-version-check",
        },
        signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout
          ? AbortSignal.timeout(timeoutMs)
          : undefined,
      });
      if (!res || !res.ok) return null;
      const data = await res.json();
      const sha = Array.isArray(data) && data[0] && typeof data[0].sha === "string" ? data[0].sha : "";
      return FULL_SHA.test(sha) ? sha.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  /** @returns {{ sha: string, short: string } | null} */
  return async function getLatestCommit(repoSlug) {
    const key = typeof repoSlug === "string" ? repoSlug.trim() : "";
    if (!key) return null;

    if (cache && cache.repoSlug === key) {
      const age = now() - cache.fetchedAt;
      if (cache.sha && age < ttlMs) return { sha: cache.sha, short: cache.sha.slice(0, 7) };
      if (!cache.sha && age < failTtlMs) return null;
    }

    const sha = await fetchLatestSha(key);
    cache = { repoSlug: key, sha, fetchedAt: now() };
    return sha ? { sha, short: sha.slice(0, 7) } : null;
  };
}

/** Process-wide cache used by the API route. */
export const getLatestCommit = createLatestCommitChecker();

/**
 * Compare a build commit against the repo's latest commit.
 * @returns {{ commitLatest: string|null, commitIsLatest: boolean|null }}
 *   nulls mean "unknown" (missing config or the lookup failed) — hide the badge.
 */
export async function getCommitStatus({ commit, repoSlug, check = getLatestCommit } = {}) {
  const build = typeof commit === "string" ? commit.trim().toLowerCase() : "";
  if (!build || !repoSlug) return { commitLatest: null, commitIsLatest: null };
  const latest = await check(repoSlug);
  if (!latest?.sha) return { commitLatest: null, commitIsLatest: null };
  return {
    commitLatest: latest.short,
    commitIsLatest: latest.sha.toLowerCase() === build,
  };
}
