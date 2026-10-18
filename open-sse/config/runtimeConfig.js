// HTTP status codes
export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  NOT_ACCEPTABLE: 406,
  REQUEST_TIMEOUT: 408,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

// Re-export error config (backward compat)
export { ERROR_TYPES, DEFAULT_ERROR_MESSAGES, BACKOFF_CONFIG, COOLDOWN_MS } from "./errorConfig.js";

// Cache TTLs (seconds)
export const CACHE_TTL = {
  userInfo: 300,    // 5 minutes
  modelAlias: 3600  // 1 hour
};

// Memory management config
export const MEMORY_CONFIG = {
  sessionTtlMs: 2 * 60 * 60 * 1000,
  sessionCleanupIntervalMs: 30 * 60 * 1000,
  dnsCacheTtlMs: 5 * 60 * 1000,
  proxyDispatchersMaxSize: 20,
};

// Parse a positive integer env override, falling back to a default.
export function envMs(name, def) {
  const raw = process.env[name];
  if (raw == null || raw === "") return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function envUrl(name, def) {
  const raw = process.env[name]?.trim();
  return raw || def;
}

// SearXNG endpoint used by the unauthenticated web-search provider.
// Configure this for a separate Docker service or remote SearXNG instance.
export const SEARXNG_URL = envUrl("SEARXNG_URL", "http://localhost:8888/search");

// Inter-chunk stall timeout (once tokens are flowing). Generous headroom so
// slow reasoning models aren't aborted mid-stream. Env: STREAM_STALL_TIMEOUT_MS.
export const STREAM_STALL_TIMEOUT_MS = envMs("STREAM_STALL_TIMEOUT_MS", 360 * 1000);

// Time-to-first-token timeout (prompt prefill). Env: STREAM_FIRST_CHUNK_TIMEOUT_MS.
export const STREAM_FIRST_CHUNK_TIMEOUT_MS = envMs("STREAM_FIRST_CHUNK_TIMEOUT_MS", 200 * 1000);

// Fetch connect timeout: abort if upstream doesn't return response headers within this duration
export const FETCH_CONNECT_TIMEOUT_MS = envMs("FETCH_CONNECT_TIMEOUT_MS", 60 * 1000);

// Gemini native TTS fetch timeout: abort if Google does not return response headers in time.
export const GEMINI_NATIVE_TTS_FETCH_TIMEOUT_MS = envMs("GEMINI_NATIVE_TTS_FETCH_TIMEOUT_MS", 45 * 1000);

// Default token limits
export const DEFAULT_MAX_TOKENS = 64000;
export const DEFAULT_MIN_TOKENS = 32000;

export const TOKEN_SAVER_HEADER = "x-9router-token-saver";

// Retry config for 429 responses (legacy - kept for backward compatibility)
export const RETRY_CONFIG = {
  maxAttempts: 2,
  delayMs: 2000
};

// Default retry config by status code: { attempts, delayMs }
// Backward compat: if value is a number, treated as attempts with RETRY_CONFIG.delayMs
export const DEFAULT_RETRY_CONFIG = {
  429: { attempts: 0, delayMs: 0 },
  502: { attempts: 3, delayMs: 3000 },
  503: { attempts: 3, delayMs: 2000 },
  504: { attempts: 2, delayMs: 3000 }
};

// Normalize a retry entry to { attempts, delayMs }
export function resolveRetryEntry(entry) {
  if (entry == null) return { attempts: 0, delayMs: RETRY_CONFIG.delayMs };
  if (typeof entry === "number") return { attempts: entry, delayMs: RETRY_CONFIG.delayMs };
  return {
    attempts: entry.attempts || 0,
    delayMs: entry.delayMs != null ? entry.delayMs : RETRY_CONFIG.delayMs
  };
}

// === Server-side upstream retry (relay resilience) ===
// A relayed upstream can fail transiently per request — e.g. a Cloudflare
// Worker relaying through an egress region the target blocks (403 "region not
// allowed"), IP-scoped 429s, or edge 5xx (520-524). The executor retries the
// same request server-side before any error reaches the client; every attempt
// is a fresh connection, so a flaky relay gets several chances to egress
// cleanly. BaseExecutor merges this between DEFAULT_RETRY_CONFIG and the
// provider's own transport.retry entry — provider config still has the final
// say for any status it defines.
//   NADEAI_RETRY_MAX_ATTEMPTS  total tries per request incl. the first (default 10; <=1 disables)
//   NADEAI_RETRY_DELAY_MS      pause between tries in ms (default 500)
//   NADEAI_RETRY_STATUSES      comma list replacing the default set
//                              (default 403,408,425,429,500,502,503,504,520,521,522,523,524,529)
//   NADEAI_RETRY_BUDGET_MS     overall retry window cap, 0 = unbounded (default 180000)
function envNonNegInt(name, def) {
  const raw = process.env[name];
  if (raw == null || raw === "") return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

const UPSTREAM_RETRY_DEFAULT_STATUSES = [403, 408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 529];

const upstreamRetryStatuses = (() => {
  const raw = process.env.NADEAI_RETRY_STATUSES;
  if (raw == null || raw.trim() === "") return UPSTREAM_RETRY_DEFAULT_STATUSES;
  const list = raw.split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 400 && n <= 599);
  return list.length ? [...new Set(list)] : UPSTREAM_RETRY_DEFAULT_STATUSES;
})();

// attempts = retries after the first try, hence MAX_ATTEMPTS - 1 (10 -> 9 retries, 10 total)
const UPSTREAM_RETRY_RETRIES = Math.max(0, envNonNegInt("NADEAI_RETRY_MAX_ATTEMPTS", 10) - 1);
const UPSTREAM_RETRY_DELAY_MS = envNonNegInt("NADEAI_RETRY_DELAY_MS", 500);

export const UPSTREAM_RETRY_BUDGET_MS = envNonNegInt("NADEAI_RETRY_BUDGET_MS", 180000);

export const UPSTREAM_RETRY_CONFIG = Object.fromEntries(
  upstreamRetryStatuses.map((status) => [status, { attempts: UPSTREAM_RETRY_RETRIES, delayMs: UPSTREAM_RETRY_DELAY_MS }])
);

// Requests containing these texts will bypass provider
export const SKIP_PATTERNS = [
  "Please write a 5-10 word title for the following conversation:"
];

// === Request logging (ENABLE_REQUEST_LOGS) ===
// Header keys whose values must never reach disk in clear text. Substring match on the
// lowercase key (fail-closed): a false positive only hides one debug field, a false
// negative writes a live credential into logs/.
export const REQUEST_LOG_SENSITIVE_HEADER_KEYS = [
  "authorization",
  "api-key",
  "apikey",
  "cookie",
  "token",
  "secret",
  "password"
];
// Values longer than prefix+suffix keep a recognizable stub (sk-proj-…abcde) so a log
// reader can still tell credentials apart; shorter ones are fully replaced — a short
// secret IS the whole secret.
export const REQUEST_LOG_MASK_PREFIX = 10;
export const REQUEST_LOG_MASK_SUFFIX = 5;
export const REQUEST_LOG_MASK_REDACTED = "[redacted]";
