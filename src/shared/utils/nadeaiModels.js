// NadeAI masked-model helpers.
//
// A masked model binds a public id clients use ("nadeai/claude-fable-5.1") to
// the real "provider/model" it routes to. Public ids are stored as slashed
// model aliases (key = public id, value = real id — resolved before provider
// parsing by getModelInfo) and their per-model system prompts live in
// settings.systemPrompts.models[publicId], so the NadeAI page and the System
// Prompt page edit the same state.

export function splitModelId(id) {
  if (typeof id !== "string") return null;
  const text = id.trim();
  const slash = text.indexOf("/");
  if (slash <= 0 || slash === text.length - 1) return null;
  return { provider: text.slice(0, slash), model: text.slice(slash + 1) };
}

export function composeModelId(provider, model) {
  const p = typeof provider === "string" ? provider.trim() : "";
  const m = typeof model === "string" ? model.trim() : "";
  return p && m ? `${p}/${m}` : "";
}

export const MASKED_MODEL_ERROR_MESSAGE =
  "Model gagal dipanggil. Silakan coba lagi. Jika masih tidak bisa, segera hubungi admin.";

export function isMaskedModelId(id) {
  const parsed = splitModelId(typeof id === "string" ? id : "");
  return !!parsed && parsed.provider === "nadeai";
}

export function isMaskedModel(modelStr, modelInfo) {
  // A masked model is any request that resolved through a registered slashed
  // alias (viaAlias is set only for slashed aliases in getModelInfo), so the
  // real backend stays hidden on every error path. The "nadeai" head check is
  // kept as a fallback for broken/missing aliases whose public id still uses
  // the nadeai mask, so they never leak a "no credentials for provider" error.
  if (modelInfo?.viaAlias) return true;
  return isMaskedModelId(modelStr);
}

/** Merge the alias map (public -> real) and per-model prompts into UI entries. */
export function mergeMaskedModels(aliases, prompts) {
  const entries = [];
  for (const [publicId, realId] of Object.entries(aliases || {})) {
    const pub = splitModelId(publicId);
    const real = splitModelId(typeof realId === "string" ? realId : "");
    if (!pub || !real) continue;
    const prompt = typeof prompts?.[publicId] === "string" ? prompts[publicId] : "";
    entries.push({
      id: publicId,
      provider: pub.provider,
      model: pub.model,
      realProvider: real.provider,
      realModel: real.model,
      realId: `${real.provider}/${real.model}`,
      systemPrompt: prompt,
    });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}
