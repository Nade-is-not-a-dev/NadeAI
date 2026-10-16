// Provider icon paths under /public/providers.
// Alias related brands; session-cache 404s so one miss never spams again.
//
// Optional CDN base: when NEXT_PUBLIC_ICON_BASE is set at build time (e.g.
// "https://cdn.jsdelivr.net/gh/<user>/<repo>@master/public"), icons are served
// from that edge instead of this server's /providers/*. Baked into the bundle
// at build time; empty/unset keeps same-origin serving.

const ICON_BASE = (() => {
  const raw = typeof process !== "undefined" && process.env ? process.env.NEXT_PUBLIC_ICON_BASE : "";
  return typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : "";
})();

const ICON_ALIASES = {
  "perplexity-agent": "perplexity",
  "gitlab-duo": "gitlab",
  "vercel-ai-gateway": "vercel",
  "ollama-search": "ollama",
  // MiniMax Code rides the existing MiniMax brand mark
  "minimax-code": "minimax",
  "minimax-code-global": "minimax",
};

// Runtime only — first 404 remembers id for the whole session
const failedIds = new Set();

function normalizeId(providerId) {
  if (!providerId || typeof providerId !== "string") return "";
  return providerId.trim().toLowerCase();
}

/** Resolve icon file id (after alias). Empty if previously failed this session. */
export function resolveProviderIconId(providerId) {
  const id = normalizeId(providerId);
  if (!id) return "";
  if (failedIds.has(id)) return "";
  const aliased = ICON_ALIASES[id] || id;
  if (failedIds.has(aliased)) return "";
  return aliased;
}

/** CDN base in use for icon files, or "" for same-origin serving. */
export function getIconCdnBase() {
  return ICON_BASE;
}

/** `/providers/{id}.png` (or the CDN equivalent) or null when previously failed. */
export function getProviderIconSrc(providerId) {
  const id = resolveProviderIconId(providerId);
  if (!id) return null;
  const local = `/providers/${id}.png`;
  return ICON_BASE ? `${ICON_BASE}${local}` : local;
}

/** Call from img onError so later mounts skip the request. */
export function markProviderIconMissing(providerId) {
  const id = normalizeId(providerId);
  if (id) failedIds.add(id);
  const aliased = ICON_ALIASES[id];
  if (aliased) failedIds.add(aliased);
}
