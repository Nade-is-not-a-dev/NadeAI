// Configurable system-prompt injection for routed chat requests.
//
// Settings shape (`systemPrompts` in the settings DB row):
//   {
//     enabled: boolean,
//     universal: string,
//     providers: { [providerIdOrAlias]: string },
//     models:    { ["providerId/model" | "alias/model"]: string }
//   }
//
// Scope keys match every spelling the router accepts for the provider -- the
// provider id, the runtime alias, and registry aliases such as `ds` / `cf` --
// so any key that routes also selects its scope.
//
// Matching layers are concatenated in order (universal -> provider -> model) and
// appended to the request's system message on the final translated body, just
// before dispatch -- the same stage as the token-saver injectors and through the
// same format-aware injector (rtk/systemInject.js), so OpenAI / Claude / Gemini /
// Responses / Kiro shapes work for translated and passthrough flows alike.
// Fail-open: a malformed config or body never affects the request.

import { injectSystemPrompt } from "../rtk/systemInject.js";

const SEP = "\n\n";

function asText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function fromMap(map, key) {
  if (!map || typeof map !== "object" || !key) return "";
  return asText(map[key]);
}

/**
 * Resolve the effective prompt for a provider/model pair.
 * `provider` is the provider id, `alias` the runtime alias (e.g. `oc`), and
 * `aliases` any additional routable spellings for the same provider (registry
 * aliases like `ds` / `cf`). Every spelling selects the same scope, so configs
 * do not need to know which form the user typed. Layers stack: universal
 * first, then provider, then model.
 *
 * @returns {{ text: string, scopes: string[] }}
 */
export function resolveSystemPrompt(config, { provider, alias, aliases, model } = {}) {
  try {
    if (!config || typeof config !== "object" || config.enabled !== true) {
      return { text: "", scopes: [] };
    }
    // Accepted spellings, in lookup order: provider id, runtime alias, then any
    // remaining routable aliases. The first configured spelling wins.
    const keys = [];
    for (const key of [provider, alias, ...(Array.isArray(aliases) ? aliases : [])]) {
      if (key && !keys.includes(key)) keys.push(key);
    }
    const universal = asText(config.universal);
    let providerText = "";
    for (const key of keys) {
      providerText = fromMap(config.providers, key);
      if (providerText) break;
    }
    let modelText = "";
    if (model) {
      for (const key of keys) {
        modelText = fromMap(config.models, `${key}/${model}`);
        if (modelText) break;
      }
    }
    const scopes = [];
    if (universal) scopes.push("universal");
    if (providerText) scopes.push(`provider:${provider}`);
    if (modelText) scopes.push(`model:${alias || provider}/${model}`);
    return {
      text: [universal, providerText, modelText].filter(Boolean).join(SEP),
      scopes,
    };
  } catch {
    return { text: "", scopes: [] };
  }
}

/**
 * Inject the resolved prompt into the final (translated) request body.
 *
 * @returns {{ scopes: string[], chars: number } | null} null when nothing applies
 */
export function applySystemPrompt(body, format, config, { provider, alias, aliases, model } = {}) {
  try {
    const { text, scopes } = resolveSystemPrompt(config, { provider, alias, aliases, model });
    if (!text) return null;
    injectSystemPrompt(body, format, text);
    return { scopes, chars: text.length };
  } catch {
    return null; // fail-open: injection must never break a request
  }
}
