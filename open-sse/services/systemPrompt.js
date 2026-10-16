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
 * `provider` is the provider id, `alias` the routing alias (e.g. `oc`); model
 * keys match in either form so configs do not need to know which one the user
 * typed. Layers stack: universal first, then provider, then model.
 *
 * @returns {{ text: string, scopes: string[] }}
 */
export function resolveSystemPrompt(config, { provider, alias, model } = {}) {
  try {
    if (!config || typeof config !== "object" || config.enabled !== true) {
      return { text: "", scopes: [] };
    }
    const universal = asText(config.universal);
    const providerText = fromMap(config.providers, provider) || fromMap(config.providers, alias);
    const modelText = fromMap(config.models, model && provider ? `${provider}/${model}` : "")
      || fromMap(config.models, model && alias ? `${alias}/${model}` : "");
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
export function applySystemPrompt(body, format, config, { provider, alias, model } = {}) {
  try {
    const { text, scopes } = resolveSystemPrompt(config, { provider, alias, model });
    if (!text) return null;
    injectSystemPrompt(body, format, text);
    return { scopes, chars: text.length };
  } catch {
    return null; // fail-open: injection must never break a request
  }
}
