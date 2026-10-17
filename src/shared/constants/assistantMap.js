// NadeAI Assistant — page / target map.
//
// Single source of truth shared by the server (rendered into the assistant's
// system prompt so the model knows which pages and controls exist) and the
// client (resolving a spotlight target to a DOM node — `data-assistant-id`
// first, then an explicit selector, then a visible-text match as a fallback).
//
// Keep ids kebab-case and stable: they are the contract between the prompt,
// the `data-assistant-id` attributes in the UI and the resolver.

export const ASSISTANT_PAGES = [
  {
    path: "/dashboard/endpoint",
    label: "Endpoint & Key",
    description:
      "Base URLs for calling the router, the API keys list with per-key access control, usage examples per client, and tunnel/security controls.",
    targets: [
      { id: "endpoint-create-key", label: "Create Key button" },
      { id: "endpoint-keys-list", label: "API keys list" },
    ],
  },
  {
    path: "/dashboard/providers",
    label: "Providers",
    description:
      "Manage provider accounts: OAuth logins, free-tier and API-key providers, plus custom OpenAI/Anthropic-compatible endpoints. Each group has a Test All button; each account card has its own test and toggle.",
    targets: [
      { id: "providers-add-anthropic", label: "Add Anthropic Compatible button" },
      { id: "providers-add-openai", label: "Add OpenAI Compatible button" },
      { id: "providers-test-oauth", label: "OAuth group Test All button" },
      { id: "providers-test-free", label: "Free tier group Test All button" },
      { id: "providers-test-apikey", label: "API key group Test All button" },
      { id: "providers-section-oauth", label: "OAuth Providers heading", text: "OAuth Providers" },
      { id: "providers-section-free", label: "Free Tier Providers heading", text: "Free Tier Providers" },
      { id: "providers-section-apikey", label: "API Key Providers heading", text: "API Key Providers" },
      { id: "providers-section-custom", label: "Custom Providers heading", text: "Custom Providers" },
    ],
  },
  {
    path: "/dashboard/nadeai",
    label: "NadeAI (masked models)",
    description:
      "Masked models: bind a public 'provider/model' id to the real routed target and attach an optional per-model system prompt. Also shows masking status and a per-model ping button.",
    targets: [
      { id: "nadeai-add", label: "Add masked model button" },
      { id: "nadeai-form-public-provider", label: "Public provider input" },
      { id: "nadeai-form-public-model", label: "Public model input" },
      { id: "nadeai-form-real-provider", label: "Real provider input" },
      { id: "nadeai-form-real-model", label: "Real model input" },
      { id: "nadeai-form-prompt", label: "System prompt textarea" },
      { id: "nadeai-form-save", label: "Save button of the masked-model form" },
      { id: "nadeai-models-list", label: "Masked models list (test / edit / delete per row)" },
    ],
  },
  {
    path: "/dashboard/combos",
    label: "Combo & Vision Adapter",
    description:
      "Combos route one requested id across several models with a fallback/round-robin/fusion strategy; the vision adapter attaches picture-capable models to requests that carry images.",
    targets: [],
  },
  {
    path: "/dashboard/usage",
    label: "Usage",
    description:
      "Usage statistics: overview charts, request logs and per-request details, with a period selector (Today / 24h / 7D / 30D / 60D / All).",
    targets: [],
  },
  {
    path: "/dashboard/quota",
    label: "Quota Tracker",
    description:
      "Quota tracking per account/provider (limits, remaining, reset times) and the Claude/Codex auto-ping options.",
    targets: [],
  },
  {
    path: "/dashboard/token-saver",
    label: "Token Saver",
    description:
      "Token-saving transforms (RTK, caveman/ponytail/pxpipe style compressors and similar) that shrink requests before they reach providers.",
    targets: [],
  },
  {
    path: "/dashboard/system-prompt",
    label: "System Prompt",
    description:
      "System prompt injection: a universal layer, per-provider layers and per-model layers, prepended to every matching request. Toggle + Save at the top; one textarea per scope below.",
    targets: [
      { id: "sysprompt-toggle", label: "Injection enable toggle" },
      { id: "sysprompt-save", label: "Save button" },
      { id: "sysprompt-universal", label: "Universal prompt textarea" },
    ],
  },
  {
    path: "/dashboard/cli-tools",
    label: "CLI Tools",
    description:
      "One-click configuration of coding CLIs (Claude Code, Codex, Cline, opencode, ...) against this router, incl. model mappings per tool.",
    targets: [],
  },
  {
    path: "/dashboard/media-providers",
    label: "Media Providers",
    description:
      "Media endpoints: embeddings, image, video, TTS, STT, systemone, plus combined web search & fetch.",
    targets: [],
  },
  {
    path: "/dashboard/console-log",
    label: "Console Log",
    description: "Live server console output (the log buffer get_console_logs reads).",
    targets: [],
  },
  {
    path: "/dashboard/translator",
    label: "Translator",
    description:
      "Request format translator playground: translate/send a request across API formats and inspect the result side by side.",
    targets: [],
  },
  {
    path: "/dashboard/proxy-pools",
    label: "Proxy Pools",
    description:
      "Outbound proxy pools (incl. deployable relay pools) used to route provider traffic through other egresses.",
    targets: [],
  },
  {
    path: "/dashboard/skills",
    label: "Skills",
    description: "Skill packages that extend the router (install/inspect).",
    targets: [],
  },
];

// Sidebar entries — every dashboard page reachable from the nav, plus the
// assistant opener the sidebar hosts. Attributes live in Sidebar.js.
export const ASSISTANT_SIDEBAR_LINKS = [
  { id: "nav-assistant", label: "Sidebar → NadeAI Assistant (opens this panel)" },
  { id: "nav-endpoint", label: "Sidebar → Endpoint & Key" },
  { id: "nav-providers", label: "Sidebar → Providers" },
  { id: "nav-nadeai", label: "Sidebar → NadeAI" },
  { id: "nav-combos", label: "Sidebar → Combo & Vision Adapter" },
  { id: "nav-usage", label: "Sidebar → Usage" },
  { id: "nav-quota", label: "Sidebar → Quota Tracker" },
  { id: "nav-token-saver", label: "Sidebar → Token Saver" },
  { id: "nav-system-prompt", label: "Sidebar → System Prompt" },
  { id: "nav-cli-tools", label: "Sidebar → CLI Tools" },
  { id: "nav-media-providers", label: "Sidebar → Media Providers" },
  { id: "nav-console-log", label: "Sidebar → Console Log" },
  { id: "nav-translator", label: "Sidebar → Translator" },
  { id: "nav-proxy-pools", label: "Sidebar → Proxy Pools" },
  { id: "nav-skills", label: "Sidebar → Skills" },
  { id: "nav-profile", label: "Sidebar → Settings (profile)" },
];

const TARGET_INDEX = new Map();
for (const page of ASSISTANT_PAGES) {
  for (const target of page.targets || []) {
    if (!TARGET_INDEX.has(target.id)) TARGET_INDEX.set(target.id, { ...target, pagePath: page.path });
  }
}
for (const link of ASSISTANT_SIDEBAR_LINKS) {
  if (!TARGET_INDEX.has(link.id)) TARGET_INDEX.set(link.id, { ...link, pagePath: null, sidebar: true });
}

/** Look up one page entry by its dashboard path (query string ignored). */
export function findAssistantPage(path) {
  if (typeof path !== "string") return null;
  const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
  return ASSISTANT_PAGES.find((p) => p.path === clean) || null;
}

/** Look up a target by id; returns { ...target, pagePath } or null. */
export function findAssistantTarget(id) {
  return TARGET_INDEX.get(String(id || "").trim()) || null;
}

/** All known target ids (used by validation and tests). */
export function assistantTargetIds() {
  return [...TARGET_INDEX.keys()];
}
