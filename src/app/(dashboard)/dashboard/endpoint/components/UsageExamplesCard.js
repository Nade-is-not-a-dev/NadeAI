"use client";

// "Usage Examples" card for the dashboard Endpoint page — sits between the
// Endpoint card and API Keys. Builds a copy/download-ready snippet for the
// selected language and OS with the endpoint and an active API key filled in;
// model and message are user-controlled. Snippet generation lives in
// ../usageExamples (pure functions, unit-tested).

import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Button, Card, Input, ModelSelectModal, Select } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { USAGE_DEFAULT_MESSAGE, USAGE_LANGUAGES, USAGE_OS, buildUsageExample } from "../usageExamples";
import OsLogo from "./OsLogo";

const TEXTAREA_CLASS =
  "w-full min-h-[64px] py-2.5 px-3 text-sm text-text-main bg-surface-2 rounded-[10px] " +
  "border border-transparent placeholder-text-muted/70 focus:outline-none focus:ring-2 " +
  "focus:ring-brand-500/30 focus:border-brand-500/40 transition-all duration-150 ease-out";

const maskKey = (key) => {
  if (!key || key.length <= 10) return key || "";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
};

const COPY_ID = "usage-example";

export default function UsageExamplesCard({ baseUrl, keys = [] }) {
  const [language, setLanguage] = useState("curl");
  const [os, setOs] = useState("unix");
  const [model, setModel] = useState("");
  const [message, setMessage] = useState(USAGE_DEFAULT_MESSAGE);
  const [selectedKeyId, setSelectedKeyId] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [models, setModels] = useState([]);
  const [combos, setCombos] = useState([]);
  const { copied, copy } = useCopyToClipboard();

  // Auto-fill: first active key wins until the user picks another one.
  const activeKeys = useMemo(() => (keys || []).filter((key) => key?.isActive !== false), [keys]);
  const effectiveKey = useMemo(
    () => activeKeys.find((key) => key.id === selectedKeyId) || activeKeys[0] || null,
    [activeKeys, selectedKeyId]
  );

  // Model suggestions: combos first (user-curated, known to route), then the
  // catalog. Only used to seed the default and the datalist — free text stays.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [modelsRes, combosRes] = await Promise.all([
          fetch("/api/models", { cache: "no-store" }),
          fetch("/api/combos", { cache: "no-store" }),
        ]);
        const modelRows = modelsRes.ok ? (await modelsRes.json()).models || [] : [];
        const routed = modelRows
          .map((row) => row?.routedModel)
          .filter((value) => typeof value === "string" && value);
        const comboRows = combosRes.ok
          ? ((await combosRes.json()).combos || []).filter((combo) => !combo.kind || combo.kind === "llm")
          : [];
        if (cancelled) return;
        setModels(routed);
        setCombos(comboRows);
        setModel((prev) => prev || comboRows[0]?.name || routed[0] || "");
      } catch {
        // Picker data is optional; the model field stays free-text.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = useMemo(
    () => [...combos.map((combo) => combo.name), ...models],
    [combos, models]
  );

  const example = useMemo(
    () => buildUsageExample({ language, os, baseUrl, apiKey: effectiveKey?.key, model, message }),
    [language, os, baseUrl, effectiveKey, model, message]
  );

  const handleDownload = () => {
    const blob = new Blob([example.code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = example.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">code</span>
          Usage Examples
        </h2>
        <p className="text-sm text-text-muted mt-1">
          Ready-to-run snippets with your endpoint and key filled in. Pick a language and OS,
          customize the message, then copy or download.
        </p>
      </div>

      {/* Request controls */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="text-sm font-medium mb-1.5 block">API Key</label>
          <Select
            options={activeKeys.map((key) => ({ value: key.id, label: `${key.name} — ${maskKey(key.key)}` }))}
            value={effectiveKey?.id || ""}
            onChange={(e) => setSelectedKeyId(e.target.value)}
            placeholder={activeKeys.length > 0 ? "Select a key" : "No active keys"}
          />
        </div>

        <div className="min-w-0">
          <label className="text-sm font-medium mb-1.5 block">Model</label>
          <div className="flex gap-2">
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="provider/model"
              list="usage-example-models"
              className="flex-1"
            />
            <Button
              variant="secondary"
              icon="search"
              onClick={() => setShowModelPicker(true)}
              className="shrink-0"
            >
              Browse
            </Button>
          </div>
        </div>

        <div className="min-w-0 sm:col-span-2">
          <label className="text-sm font-medium mb-1.5 block">Endpoint</label>
          <Input value={baseUrl || ""} readOnly className="font-mono text-sm" />
        </div>

        <div className="min-w-0 sm:col-span-2">
          <label className="text-sm font-medium mb-1.5 block">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="User message to send..."
            spellCheck={false}
            rows={2}
            className={TEXTAREA_CLASS}
          />
        </div>
      </div>

      {/* Language + OS tabs */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-[10px] bg-surface-2 p-1">
          {USAGE_LANGUAGES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setLanguage(option.id)}
              className={`h-7 shrink-0 cursor-pointer rounded-[8px] px-3 text-xs font-medium transition-colors ${
                language === option.id
                  ? "bg-surface text-text-main shadow-sm"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-0.5 rounded-[10px] bg-surface-2 p-1">
          {USAGE_OS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setOs(option.id)}
              title={`Adjust the command for ${option.label}`}
              className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-medium transition-colors ${
                os === option.id
                  ? "bg-surface text-text-main shadow-sm"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              <OsLogo kind={String(option.id).startsWith("windows") ? "windows" : "unix"} />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Generated snippet */}
      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <code className="truncate font-mono text-xs text-text-muted">{example.filename}</code>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={copied === COPY_ID ? "check" : "content_copy"}
              onClick={() => copy(example.code, COPY_ID)}
            >
              {copied === COPY_ID ? "Copied!" : "Copy"}
            </Button>
            <Button variant="secondary" size="sm" icon="download" onClick={handleDownload}>
              Download
            </Button>
          </div>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-black/[0.03] p-3 font-mono text-xs leading-relaxed text-text-main dark:bg-white/[0.03]">
          {example.code}
        </pre>
      </div>

      <datalist id="usage-example-models">
        {suggestions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>

      {showModelPicker && (
        <ModelSelectModal
          isOpen={showModelPicker}
          onClose={() => setShowModelPicker(false)}
          onSelect={(selected) => setModel(selected?.value || selected?.name || "")}
          selectedModel={model}
          title="Select Model"
        />
      )}
    </Card>
  );
}

UsageExamplesCard.propTypes = {
  baseUrl: PropTypes.string,
  keys: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      key: PropTypes.string,
      isActive: PropTypes.bool,
    })
  ),
};
