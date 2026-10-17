import { DefaultExecutor } from "./default.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:5678";

/**
 * Connection-level base URL for the gateway, falling back to the registry
 * transport default. Same shape as ollama-local: the host is chosen when the
 * connection is created, not baked into the registry entry, so one registry id
 * serves a gateway on localhost, on the LAN, or on a remote box.
 *
 * A trailing `/v1` is tolerated because that is the base URL printed in the
 * gateway's own README, and the endpoint path below re-adds it.
 */
export function resolveOpencode2ApiBaseUrl(credentials) {
  const raw = credentials?.providerSpecificData?.baseUrl?.trim();
  const normalized = (raw || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return normalized.replace(/\/v1$/i, "");
}

export class Opencode2ApiExecutor extends DefaultExecutor {
  constructor() {
    super("opencode2api");
  }

  // The gateway speaks plain OpenAI Chat Completions in both directions and
  // already collapses its own upstream SSE, so nothing here needs forcing:
  // no fingerprint, no forceStream, no auth rewrite beyond the server_key.
  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    return `${resolveOpencode2ApiBaseUrl(credentials)}/v1/chat/completions`;
  }
}

export default Opencode2ApiExecutor;
