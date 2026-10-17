// NadeAI Assistant — helpers for talking to this instance's own HTTP API
// (loopback). Same auth pattern as src/app/api/models/test/ping.js: an active
// API key when one exists plus the machine CLI token, so the calls keep working
// when settings.requireApiKey / requireLogin are enabled.

import { getApiKeys } from "@/lib/localDb";
import { UPDATER_CONFIG } from "@/shared/constants/config.js";
import { getConsistentMachineId } from "@/shared/utils/machineId.js";

const CLI_TOKEN_SALT = "9r-cli-auth";

export function internalBaseUrl() {
  return `http://127.0.0.1:${process.env.PORT || UPDATER_CONFIG.appPort}`;
}

export async function internalHeaders(extra = {}) {
  let apiKey = null;
  try {
    const keys = await getApiKeys();
    const activeKeys = (keys || []).filter((k) => k.isActive !== false);
    apiKey = (activeKeys.find((k) => !k.access?.restricted) || activeKeys[0])?.key || null;
  } catch {
    // No keys yet — loopback requests still pass via the CLI token.
  }

  const headers = { "Content-Type": "application/json", ...extra };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  headers["x-9r-cli-token"] = await getConsistentMachineId(CLI_TOKEN_SALT);
  return headers;
}

/** GET/POST a JSON endpoint on this instance and return the parsed body. */
export async function internalJson(path, { method = "GET", body, timeoutMs = 30000 } = {}) {
  const res = await fetch(`${internalBaseUrl()}${path}`, {
    method,
    headers: await internalHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const detail = data?.error?.message || data?.error || data?.message || text;
    const error = new Error(`HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 300)}` : ""}`);
    error.status = res.status;
    throw error;
  }
  return data;
}
