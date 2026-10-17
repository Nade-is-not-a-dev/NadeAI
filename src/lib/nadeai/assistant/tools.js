// NadeAI Assistant — server-side tool executors.
//
// Every executor returns { ok, result, note, preview?, action? }:
//  - result   → JSON-serialised back to the model as the tool message
//  - note     → one line shown on the tool chip in the chat UI
//  - preview  → optional extra line for the chip (latency, counts)
//  - action   → client-side UI action ({ name: "navigate" | "spotlight", args })

import { getApiKeys, getModelAliases, getProviderConnections } from "@/lib/localDb";
import { getUsageStats } from "@/lib/usageDb";
import { getConsoleLogs, initConsoleLogCapture } from "@/lib/consoleLogBuffer.js";
import { pingModelByKind } from "@/app/api/models/test/ping.js";
import { testSingleConnection } from "@/app/api/providers/[id]/test/testUtils.js";
import { resolveProviderId } from "@/shared/constants/providers.js";
import { findAssistantTarget } from "@/shared/constants/assistantMap.js";
import { APP_CONFIG } from "@/shared/constants/config.js";
import { internalJson } from "./internal.js";

const MAX_TEST_CONNECTIONS = 6;
const MODEL_KINDS = new Set(["llm", "embedding", "image", "stt", "systemone"]);
const USAGE_PERIODS = new Set(["today", "24h", "7d", "30d", "all"]);

initConsoleLogCapture();

function fail(error, note) {
  return { ok: false, result: { error }, note: note || String(error) };
}

function trim(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export async function executeAssistantTool(name, args, ctx = {}) {
  try {
    switch (name) {
      case "get_providers":
        return await toolGetProviders();
      case "test_provider":
        return await toolTestProvider(args);
      case "test_model":
        return await toolTestModel(args);
      case "list_models":
        return await toolListModels(args);
      case "get_usage":
        return await toolGetUsage(args);
      case "get_console_logs":
        return toolGetConsoleLogs(args);
      case "get_app_status":
        return await toolGetAppStatus();
      case "open_page":
        return toolOpenPage(args);
      case "spotlight":
        return toolSpotlight(args, ctx);
      default:
        return fail(`Unknown tool: ${name}`, "unknown tool");
    }
  } catch (error) {
    return fail(String(error?.message || error), "tool error");
  }
}

async function toolGetProviders() {
  const connections = await getProviderConnections();
  const byProvider = {};
  for (const conn of connections) {
    const key = conn.provider || "unknown";
    if (!byProvider[key]) byProvider[key] = { provider: key, connections: 0, active: 0, failing: 0 };
    byProvider[key].connections += 1;
    if (conn.isActive !== false) byProvider[key].active += 1;
    if (conn.testStatus === "error") byProvider[key].failing += 1;
  }

  const rows = connections.slice(0, 80).map((conn) => ({
    id: conn.id,
    provider: conn.provider,
    label: conn.name || conn.email || null,
    active: conn.isActive !== false,
    authType: conn.authType || null,
    testStatus: conn.testStatus || null,
    lastError: conn.lastError ? trim(conn.lastError, 140) : null,
  }));

  return {
    ok: true,
    result: { count: connections.length, byProvider: Object.values(byProvider), connections: rows },
    note: `${connections.length} connections`,
    preview: `${Object.keys(byProvider).length} providers`,
  };
}

async function toolTestProvider(args) {
  const providerArg = String(args?.provider || "").trim();
  if (!providerArg) return fail("provider is required, e.g. 'anthropic'", "provider required");

  const resolved = resolveProviderId(providerArg) || providerArg;
  const all = await getProviderConnections();
  const matches = all.filter((conn) => conn.provider === providerArg || conn.provider === resolved);

  if (!matches.length) {
    const known = [...new Set(all.map((conn) => conn.provider))].slice(0, 40);
    return fail(`No connections found for provider '${providerArg}'. Known providers: ${known.join(", ") || "(none)"}`, "provider not found");
  }

  const tested = matches.slice(0, MAX_TEST_CONNECTIONS);
  const results = [];
  for (const conn of tested) {
    const outcome = await testSingleConnection(conn.id);
    results.push({
      label: conn.name || conn.email || conn.id,
      valid: !!outcome.valid,
      latencyMs: outcome.latencyMs || 0,
      error: outcome.error ? trim(outcome.error, 200) : null,
    });
  }

  const passed = results.filter((r) => r.valid).length;
  const avg = results.length ? Math.round(results.reduce((sum, r) => sum + (r.latencyMs || 0), 0) / results.length) : 0;

  return {
    ok: true,
    result: { provider: providerArg, resolved: resolved !== providerArg ? resolved : undefined, tested: results.length, skipped: matches.length - tested.length, results },
    note: `${passed}/${results.length} ok`,
    preview: avg ? `avg ${avg}ms` : null,
  };
}

async function toolTestModel(args) {
  const model = String(args?.model || "").trim();
  if (!model) return fail("model is required, e.g. 'oc/deepseek-v4.1-flash-free'", "model required");
  const kind = MODEL_KINDS.has(args?.kind) ? args.kind : "llm";

  const outcome = await pingModelByKind(model, kind);
  return {
    ok: !!outcome.ok,
    result: { model, kind, ok: !!outcome.ok, latencyMs: outcome.latencyMs || 0, status: outcome.status ?? null, error: outcome.error ? trim(outcome.error, 300) : null },
    note: outcome.ok ? "ok" : "failed",
    preview: outcome.ok ? `${outcome.latencyMs || 0}ms` : trim(outcome.error || "no detail", 120),
  };
}

async function toolListModels(args) {
  const query = String(args?.query || "").trim().toLowerCase();
  const providerFilter = String(args?.provider || "").trim().toLowerCase();
  const limit = clampInt(args?.limit, 1, 40, 15);

  let routed = [];
  let routedError = null;
  try {
    const data = await internalJson("/api/models");
    routed = Array.isArray(data?.models) ? data.models : [];
  } catch (error) {
    routedError = String(error?.message || error);
  }

  const entries = [];
  for (const model of routed) {
    const id = model?.routedModel || model?.fullModel || (model?.provider && model?.model ? `${model.provider}/${model.model}` : "");
    if (!id) continue;
    const caps = model?.caps || {};
    entries.push({
      id,
      name: model?.name || null,
      provider: model?.provider || null,
      masked: false,
      vision: caps.vision === true ? true : undefined,
      reasoning: caps.reasoning === true ? true : undefined,
      contextWindow: caps.contextWindow || null,
    });
  }

  let aliases = {};
  try {
    aliases = await getModelAliases();
  } catch {
    aliases = {};
  }
  for (const [publicId, realId] of Object.entries(aliases || {})) {
    entries.push({ id: publicId, target: String(realId || ""), masked: true });
  }

  let filtered = entries;
  if (providerFilter) {
    filtered = filtered.filter(
      (entry) => String(entry.provider || "").toLowerCase() === providerFilter || entry.id.toLowerCase().startsWith(`${providerFilter}/`),
    );
  }
  if (query) {
    filtered = filtered.filter(
      (entry) => entry.id.toLowerCase().includes(query) || String(entry.name || "").toLowerCase().includes(query),
    );
  }

  const rows = filtered.slice(0, limit).map((entry) => {
    const row = { id: entry.id };
    if (entry.masked) {
      row.masked = true;
      row.target = entry.target;
    } else {
      if (entry.name) row.name = entry.name;
      if (entry.vision) row.vision = true;
      if (entry.reasoning) row.reasoning = true;
      if (entry.contextWindow) row.contextWindow = entry.contextWindow;
    }
    return row;
  });

  const result = { total: filtered.length, shown: rows.length, models: rows };
  if (routedError) result.routedModelsError = routedError;

  return {
    ok: true,
    result,
    note: `${filtered.length} match${filtered.length === 1 ? "" : "es"}`,
    preview: routedError ? "masked only (routed list failed)" : null,
  };
}

async function toolGetUsage(args) {
  const period = USAGE_PERIODS.has(args?.period) ? args.period : "7d";
  const stats = await getUsageStats(period);

  const top = (bucket, count = 5) =>
    Object.entries(bucket || {})
      .map(([key, value]) => ({
        name: key,
        requests: value?.requests || 0,
        tokens: (value?.promptTokens || 0) + (value?.completionTokens || 0),
        cost: Number((value?.cost || 0).toFixed(4)),
      }))
      .sort((a, b) => b.requests - a.requests || b.tokens - a.tokens)
      .slice(0, count);

  return {
    ok: true,
    result: {
      period,
      totalRequests: stats.totalRequests || 0,
      promptTokens: stats.totalPromptTokens || 0,
      completionTokens: stats.totalCompletionTokens || 0,
      cachedTokens: stats.totalCachedTokens || 0,
      cost: Number((stats.totalCost || 0).toFixed(4)),
      activeRequests: (stats.activeRequests || []).slice(0, 5),
      topProviders: top(stats.byProvider),
      topModels: top(stats.byModel),
      recentRequests: (stats.recentRequests || []).slice(0, 8).map((r) => ({
        at: r.timestamp,
        model: r.model,
        provider: r.provider,
        in: r.promptTokens,
        out: r.completionTokens,
        status: r.status,
      })),
    },
    note: `${stats.totalRequests || 0} reqs / ${period}`,
    preview: `${((stats.totalPromptTokens || 0) + (stats.totalCompletionTokens || 0)).toLocaleString("en-US")} tokens`,
  };
}

function toolGetConsoleLogs(args) {
  const query = trim(args?.query || "", 120).toLowerCase();
  const limit = clampInt(args?.limit, 1, 50, 25);

  let lines = getConsoleLogs() || [];
  if (query) lines = lines.filter((line) => String(line).toLowerCase().includes(query));
  const shown = lines.slice(-limit).map((line) => trim(line, 300));

  return {
    ok: true,
    result: { total: lines.length, shown: shown.length, lines: shown },
    note: `${shown.length}/${lines.length} lines`,
  };
}

async function toolGetAppStatus() {
  let connections = [];
  let keys = [];
  let aliases = {};
  try {
    connections = await getProviderConnections();
  } catch {}
  try {
    keys = await getApiKeys();
  } catch {}
  try {
    aliases = await getModelAliases();
  } catch {}

  return {
    ok: true,
    result: {
      version: APP_CONFIG.version || null,
      commit: APP_CONFIG.commit || null,
      node: process.version,
      port: process.env.PORT || null,
      uptimeSeconds: Math.round(process.uptime()),
      connections: connections.length,
      apiKeys: keys.length,
      maskedModels: Object.keys(aliases || {}).length,
    },
    note: `v${APP_CONFIG.version || "?"}`,
  };
}

function toolOpenPage(args) {
  const path = String(args?.path || "").trim();
  if (!/^\/dashboard($|\/)/.test(path)) {
    return fail("path must be a dashboard path like /dashboard/providers", "invalid path");
  }
  return {
    ok: true,
    result: { queued: true, path },
    note: `open ${path}`,
    action: { name: "navigate", args: { path } },
  };
}

function toolSpotlight(args, ctx = {}) {
  const target = String(args?.target || "").trim();
  if (!target) return fail("target id is required", "target required");

  const entry = findAssistantTarget(target);
  const note = trim(args?.note || "", 240) || entry?.label || "";
  const requestedPath = typeof args?.path === "string" && /^\/dashboard($|\/)/.test(args.path) ? args.path.split("?")[0] : null;
  const currentPath = ctx?.page?.path ? String(ctx.page.path).split("?")[0] : null;
  const path = requestedPath && requestedPath !== currentPath ? requestedPath : entry?.pagePath && entry.pagePath !== currentPath ? entry.pagePath : null;

  const result = { queued: true, target, note: note || null, path: requestedPath || null };
  if (entry) {
    result.known = true;
    result.label = entry.label;
    if (entry.text) result.textHint = entry.text;
  } else {
    result.known = false;
    result.hint = "Unknown target id; the UI will try an attribute match. Prefer ids from the dashboard map.";
  }

  return {
    ok: true,
    result,
    note: `spotlight ${target}`,
    action: { name: "spotlight", args: { target, note: note || null, path } },
  };
}
