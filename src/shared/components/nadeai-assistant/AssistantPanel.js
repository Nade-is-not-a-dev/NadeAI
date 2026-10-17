"use client";

// NadeAI Assistant — the chat panel. Streams one turn from
// /api/nadeai/assistant (SSE), renders assistant markdown, tool activity and
// applies UI actions (navigate / spotlight) the model requested.

import { useCallback, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import { usePathname, useRouter } from "next/navigation";
import { useAssistantStore, nextMessageId } from "@/store/assistantStore";

const TOOL_META = {
  get_providers: { icon: "dns", verb: "Cek provider" },
  test_provider: { icon: "network_check", verb: "Tes provider" },
  test_model: { icon: "bolt", verb: "Tes model" },
  list_models: { icon: "search", verb: "Cari model" },
  get_usage: { icon: "bar_chart", verb: "Usage" },
  get_console_logs: { icon: "terminal", verb: "Console log" },
  get_app_status: { icon: "info", verb: "Status" },
  open_page: { icon: "tab", verb: "Buka halaman" },
  spotlight: { icon: "highlight", verb: "Sorot" },
};

const MARKDOWN_CLASSES =
  "text-sm break-words [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_code]:rounded [&_code]:bg-bg/60 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px] [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-bg/60 [&_pre]:p-2 [&_a]:text-primary [&_a]:underline [&_strong]:font-semibold [&_h1]:my-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:my-1.5 [&_h3]:text-sm [&_h3]:font-semibold";

function renderMarkdown(text) {
  const escaped = String(text || "").replace(/</g, "&lt;");
  try {
    const html = marked.parse(escaped, { gfm: true, breaks: true, async: false });
    return typeof html === "string" ? html : "";
  } catch {
    return escaped;
  }
}

/** Neutralise javascript:/data: links in model-written markdown. */
function sanitizeLinks(html) {
  if (typeof document === "undefined") return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("a").forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";
    if (/^\s*(javascript|data|vbscript):/i.test(href)) anchor.removeAttribute("href");
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noreferrer");
  });
  return template.innerHTML;
}

function ToolRow({ tool }) {
  const meta = TOOL_META[tool.name] || { icon: "build", verb: tool.name };
  const subject = tool.args?.provider || tool.args?.model || tool.args?.target || "";
  const detail = tool.status === "running" ? "…" : [tool.note, tool.preview].filter(Boolean).join(" · ");
  const iconClass =
    tool.status === "running" ? "animate-pulse text-primary" : tool.status === "error" ? "text-red-500" : "text-green-500";
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted">
      <span className={`material-symbols-outlined text-[13px] ${iconClass}`}>{meta.icon}</span>
      <span className="shrink-0 font-medium">{meta.verb}</span>
      {subject ? <span className="max-w-[130px] truncate font-mono text-text-muted/90">{subject}</span> : null}
      {detail ? <span className="truncate">· {detail}</span> : null}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5">
      <span className="size-1.5 animate-pulse rounded-full bg-text-muted" />
      <span className="size-1.5 animate-pulse rounded-full bg-text-muted [animation-delay:150ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-text-muted [animation-delay:300ms]" />
    </span>
  );
}

function MessageBubble({ message }) {
  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm">
        {message.content}
      </div>
    );
  }

  const html = message.content ? sanitizeLinks(renderMarkdown(message.content)) : "";
  return (
    <div className="max-w-[96%]">
      {message.tools?.length > 0 && (
        <div className="mb-1.5 space-y-1">
          {message.tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </div>
      )}
      <div className="rounded-2xl rounded-bl-sm border border-border-subtle bg-surface-2/70 px-3 py-2">
        {html ? (
          <div className={MARKDOWN_CLASSES} dangerouslySetInnerHTML={{ __html: html }} />
        ) : message.status === "streaming" ? (
          <TypingDots />
        ) : null}
        {message.error ? <p className="mt-1 break-words text-xs text-red-500">{message.error}</p> : null}
      </div>
    </div>
  );
}

function EmptyState({ onSuggest }) {
  const suggestions = [
    "Cek provider yang error",
    "Di mana saya bisa tambah model masked?",
    "Ringkas usage 7 hari terakhir",
    "Tes model deepseek-v4.1-flash-free",
  ];
  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="rounded-xl border border-border-subtle bg-surface-2/50 p-3">
        <p className="text-sm font-semibold">Hai, saya Nade.</p>
        <p className="mt-1 text-xs text-text-muted">
          Asisten dashboard ini. Saya bisa cek provider &amp; model, menjalankan tes, membaca usage/log, membuka
          halaman, dan menyorot kontrol yang kamu cari.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggest(suggestion)}
            className="rounded-lg border border-border-subtle bg-bg/40 px-3 py-2 text-left text-xs text-text-muted transition-colors hover:border-primary/40 hover:text-text-main"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function ModelPicker({ current, onPick, onClose }) {
  const [models, setModels] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [extra, setExtra] = useState("");
  const [savedNote, setSavedNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = [];
      try {
        const res = await fetch("/api/models", { cache: "no-store" });
        const data = await res.json();
        for (const model of data?.models || []) {
          const id = model.routedModel || model.fullModel;
          if (id) rows.push({ id, masked: false });
        }
      } catch {
        // Routed list unavailable — masked models below still help.
      }
      try {
        const res = await fetch("/api/nadeai/models", { cache: "no-store" });
        const data = await res.json();
        for (const model of data?.models || []) {
          if (model.id) rows.push({ id: model.id, masked: true });
        }
      } catch {}
      try {
        const res = await fetch("/api/nadeai/assistant/config", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && typeof data?.systemPromptExtra === "string") setExtra(data.systemPromptExtra);
      } catch {}
      if (!cancelled) {
        rows.sort((a, b) => a.id.localeCompare(b.id));
        setModels(rows);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = query.trim()
    ? models.filter((model) => model.id.toLowerCase().includes(query.trim().toLowerCase()))
    : models;

  return (
    <div className="absolute inset-x-0 top-12 bottom-0 z-20 flex flex-col overflow-hidden border-t border-border-subtle bg-surface-1/95 backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari model…"
          className="w-full rounded-lg border border-border-subtle bg-surface-2 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500/40"
        />
        <button type="button" onClick={onClose} className="shrink-0 text-text-muted hover:text-text-main">
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <p className="px-2 py-3 text-xs text-text-muted">Memuat daftar model…</p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-3 text-xs text-text-muted">Tidak ada model yang cocok.</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.slice(0, 120).map((model) => (
              <button
                key={`${model.masked ? "masked" : "routed"}:${model.id}`}
                type="button"
                onClick={() => onPick(model.id)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-2 ${
                  model.id === current ? "bg-primary/10 text-primary" : "text-text-main"
                }`}
              >
                <span className="truncate font-mono">{model.id}</span>
                {model.masked ? (
                  <span className="shrink-0 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] text-brand-500">masked</span>
                ) : null}
                {model.id === current ? (
                  <span className="material-symbols-outlined ml-auto shrink-0 text-[14px]">check</span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border-subtle px-3 py-2">
        <p className="mb-1 text-[11px] font-medium text-text-muted">Instruksi tambahan (opsional)</p>
        <textarea
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          rows={2}
          placeholder="mis. Selalu jawab singkat, pakai bahasa Indonesia."
          className="w-full resize-none rounded-lg border border-border-subtle bg-surface-2 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500/40"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] text-green-500">{savedNote}</span>
          <button
            type="button"
            onClick={async () => {
              try {
                await fetch("/api/nadeai/assistant/config", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ systemPromptExtra: extra }),
                });
                setSavedNote("Tersimpan");
                setTimeout(() => setSavedNote(""), 2000);
              } catch {
                setSavedNote("Gagal menyimpan");
              }
            }}
            className="rounded-lg border border-border-subtle bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-text-main hover:border-primary/40"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AssistantPanel() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const messages = useAssistantStore((s) => s.messages);
  const busy = useAssistantStore((s) => s.busy);
  const model = useAssistantStore((s) => s.model);

  const router = useRouter();
  const pathname = usePathname();

  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft, open]);

  const applyAction = useCallback(
    (event) => {
      const args = event?.args || {};
      if (event?.name === "navigate" && typeof args.path === "string") {
        if (args.path.split("?")[0] !== pathname) router.push(args.path);
        return;
      }
      if (event?.name === "spotlight") {
        useAssistantStore.getState().setSpotlight({ target: args.target, note: args.note || null, path: args.path || null });
      }
    },
    [pathname, router],
  );

  const handleEvent = useCallback(
    (event, update) => {
      switch (event?.type) {
        case "delta":
          if (typeof event.text === "string" && event.text) {
            update((m) => ({ ...m, content: m.content + event.text }));
          }
          break;
        case "tool_start":
          update((m) => ({
            ...m,
            tools: [...(m.tools || []), { id: event.id, name: event.name, args: event.args || {}, status: "running" }],
          }));
          break;
        case "tool_result":
          update((m) => ({
            ...m,
            tools: (m.tools || []).map((tool) =>
              tool.id === event.id ? { ...tool, status: event.ok ? "ok" : "error", note: event.note, preview: event.preview } : tool,
            ),
          }));
          break;
        case "action":
          applyAction(event);
          break;
        case "error":
          update((m) => ({ ...m, status: "error", error: String(event.message || "Terjadi kesalahan.") }));
          break;
        default:
          break;
      }
    },
    [applyAction],
  );

  const send = useCallback(
    async (overrideText) => {
      const text = String(overrideText ?? draft).trim();
      if (!text) return;
      const store = useAssistantStore.getState();
      if (store.busy) return;
      if (overrideText === undefined) setDraft("");

      const assistantId = nextMessageId("m");
      store.appendMessage({ id: nextMessageId("m"), role: "user", content: text, tools: [], status: "done" });
      store.appendMessage({ id: assistantId, role: "assistant", content: "", tools: [], status: "streaming" });
      store.setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const update = (patch) => useAssistantStore.getState().updateMessage(assistantId, patch);

      const history = useAssistantStore
        .getState()
        .messages.filter((m) => m.id !== assistantId)
        .filter((m) => m.role === "user" || (m.role === "assistant" && m.content.trim().length > 0))
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch("/api/nadeai/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({
            messages: history,
            model: useAssistantStore.getState().model || undefined,
            page: { path: pathname },
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          let payload = null;
          try {
            payload = await res.json();
          } catch {
            payload = null;
          }
          if (payload?.code === "model_unset") {
            update((m) => ({ ...m, status: "error", error: "Belum ada model asisten — pilih model dulu." }));
            setPickerOpen(true);
          } else {
            update((m) => ({ ...m, status: "error", error: payload?.error || `HTTP ${res.status}` }));
          }
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          update((m) => ({ ...m, status: "error", error: "Stream respons tidak tersedia." }));
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newlineIndex;
          while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            let event = null;
            try {
              event = JSON.parse(data);
            } catch {
              continue;
            }
            handleEvent(event, update);
          }
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          update((m) => ({ ...m, status: "error", error: String(error?.message || error) }));
        }
      } finally {
        useAssistantStore.getState().setBusy(false);
        abortRef.current = null;
        update((m) => (m.status === "streaming" ? { ...m, status: "done" } : m));
      }
    },
    [draft, handleEvent, pathname],
  );

  if (!open) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[75] flex h-[min(80vh,640px)] w-[min(94vw,420px)] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-vibrancy shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700">
          <span className="material-symbols-outlined text-[16px] text-white">theater_comedy</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Nade</p>
          <button
            type="button"
            data-assistant-id="assistant-model-picker"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex max-w-full items-center gap-1 text-[11px] text-text-muted hover:text-text-main"
          >
            <span className="truncate">{model || "pilih model"}</span>
            <span className="material-symbols-outlined text-[13px]">expand_more</span>
          </button>
        </div>
        <button
          type="button"
          title="Percakapan baru"
          onClick={() => useAssistantStore.getState().clearConversation()}
          className="text-text-muted hover:text-text-main"
        >
          <span className="material-symbols-outlined text-[18px]">edit_square</span>
        </button>
        <button type="button" title="Tutup" onClick={() => setOpen(false)} className="text-text-muted hover:text-text-main">
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {pickerOpen && (
        <ModelPicker
          current={model}
          onPick={async (id) => {
            useAssistantStore.getState().setModel(id);
            setPickerOpen(false);
            try {
              await fetch("/api/nadeai/assistant/config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: id }),
              });
            } catch {
              // Client keeps the selection even if persisting failed.
            }
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div ref={scrollRef} className="custom-scrollbar flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? <EmptyState onSuggest={(text) => send(text)} /> : null}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>

      <div className="border-t border-border-subtle p-2.5">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent?.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Tanya apa saja… (Enter kirim, Shift+Enter baris baru)"
            className="max-h-[120px] min-h-[38px] flex-1 resize-none rounded-xl border border-border-subtle bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand-500/40"
          />
          {busy ? (
            <button
              type="button"
              title="Berhenti"
              onClick={() => abortRef.current?.abort()}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-2 text-red-500 hover:border-red-500/40"
            >
              <span className="material-symbols-outlined text-[18px]">stop_circle</span>
            </button>
          ) : (
            <button
              type="button"
              title="Kirim"
              onClick={() => send()}
              disabled={!draft.trim()}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:bg-surface-3 disabled:text-text-muted"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
