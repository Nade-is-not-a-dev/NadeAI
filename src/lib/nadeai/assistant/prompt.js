// NadeAI Assistant — system prompt assembly and history sanitising.
// Pure module: imported by the server agent runner and by unit tests.

import { ASSISTANT_PAGES, ASSISTANT_SIDEBAR_LINKS } from "@/shared/constants/assistantMap.js";

const MAX_HISTORY_MESSAGES = 16;
const MAX_MESSAGE_CHARS = 4000;

/** Keep only user/assistant text turns, capped in count and size. */
export function sanitizeHistory(messages, options = {}) {
  const maxMessages = options.maxMessages || MAX_HISTORY_MESSAGES;
  const maxChars = options.maxChars || MAX_MESSAGE_CHARS;
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : String(m.content ?? "") }))
    .filter((m) => m.content.trim().length > 0)
    .slice(-maxMessages)
    .map((m) => ({ role: m.role, content: m.content.slice(0, maxChars) }));
}

function formatPage(page) {
  const lines = [`- ${page.path} — ${page.label}: ${page.description}`];
  const targets = page.targets || [];
  if (targets.length) {
    lines.push(`  targets: ${targets.map((t) => `${t.id} (${t.label})`).join(", ")}`);
  }
  return lines.join("\n");
}

export function buildSystemPrompt({ pagePath } = {}) {
  const clean = typeof pagePath === "string" ? pagePath.split("?")[0] : "";
  const current = clean.startsWith("/dashboard") ? clean : null;

  return [
    `You are "Nade", the built-in assistant of the NadeAI dashboard — a self-hosted AI router (fork of 9router) that the operator runs for their own use. You live inside the dashboard: you can answer, act on the instance through tools, and point at UI controls with the spotlight.`,
    ``,
    `# Language and tone`,
    `- Mirror the user's language. This operator usually writes Indonesian; direct and short is best.`,
    `- 1-4 sentences per reply unless more detail is asked for. No filler, no corporate tone.`,
    ``,
    `# Tools`,
    `- get_providers, test_provider, test_model: inspect accounts and probe routed models end-to-end.`,
    `- list_models: search routable model ids and masked (alias) models.`,
    `- get_usage, get_console_logs, get_app_status: usage stats, server log buffer, version info.`,
    `- open_page / spotlight: drive the dashboard UI. Prefer showing over describing.`,
    ``,
    `# Rules`,
    `- Ground every state claim (provider status, latency, numbers) in tool results from this conversation. Never invent them.`,
    `- "cek X" means call the matching tool first. "di mana X" means open_page + spotlight with a one-line note.`,
    `- spotlight.target must be one of the target ids listed below. Pass "path" when the control is on another page so the dashboard navigates first. If no id fits, answer in text instead.`,
    `- Never repeat a failing tool call with identical arguments; fix the arguments or report the failure.`,
    ``,
    `# Dashboard map`,
    ...ASSISTANT_PAGES.map(formatPage),
    ``,
    `# Sidebar targets`,
    ASSISTANT_SIDEBAR_LINKS.map((s) => `- ${s.id} (${s.label})`).join("\n"),
    ``,
    `# Current context`,
    `- The user is looking at: ${current || "unknown page"}.`,
  ].join("\n");
}
