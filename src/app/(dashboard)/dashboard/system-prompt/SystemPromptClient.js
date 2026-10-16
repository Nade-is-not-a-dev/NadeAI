"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardSkeleton, Input, Toggle } from "@/shared/components";

const TEXTAREA_CLASS =
  "w-full min-h-[110px] py-2.5 px-3 text-sm text-text-main bg-surface-2 rounded-[10px] " +
  "border border-transparent placeholder-text-muted/70 focus:outline-none focus:ring-2 " +
  "focus:ring-brand-500/30 focus:border-brand-500/40 transition-all duration-150 ease-out";

const rowsFromObject = (obj) =>
  Object.entries(obj || {}).map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : "",
  }));

const objectFromRows = (rows) => {
  const out = {};
  for (const row of rows) {
    const key = (row.key || "").trim();
    if (key && typeof row.value === "string" && row.value.trim()) out[key] = row.value;
  }
  return out;
};

function ScopeSection({
  title,
  description,
  hint,
  listId,
  placeholderKey,
  placeholderValue,
  addLabel,
  emptyText,
  rows,
  setRows,
}) {
  const update = (index, patch) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <Card title={title} subtitle={description}>
      {rows.length === 0 && <p className="text-sm text-text-muted">{emptyText}</p>}
      {rows.map((row, index) => (
        <div
          key={index}
          className={`flex flex-col gap-2 py-3 ${index > 0 ? "border-t border-border-subtle" : ""}`}
        >
          <div className="flex items-center gap-2">
            <Input
              value={row.key}
              onChange={(e) => update(index, { key: e.target.value })}
              placeholder={placeholderKey}
              list={listId}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="sm"
              icon="delete"
              aria-label={`Remove ${title}`}
              onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
            />
          </div>
          <textarea
            value={row.value}
            onChange={(e) => update(index, { value: e.target.value })}
            placeholder={placeholderValue}
            spellCheck={false}
            className={TEXTAREA_CLASS}
          />
        </div>
      ))}
      <div className="pt-3">
        <Button
          variant="secondary"
          size="sm"
          icon="add"
          onClick={() => setRows((prev) => [...prev, { key: "", value: "" }])}
        >
          {addLabel}
        </Button>
      </div>
      <p className="text-xs text-text-muted mt-2">{hint}</p>
    </Card>
  );
}

export default function SystemPromptClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [universal, setUniversal] = useState("");
  const [providerRows, setProviderRows] = useState([]);
  const [modelRows, setModelRows] = useState([]);
  const [providerOptions, setProviderOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load settings (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        const sp = data.systemPrompts || {};
        setEnabled(sp.enabled === true);
        setUniversal(typeof sp.universal === "string" ? sp.universal : "");
        setProviderRows(rowsFromObject(sp.providers));
        setModelRows(rowsFromObject(sp.models));
      } catch (error) {
        if (!cancelled) setMessage({ kind: "err", text: error.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Suggestions for the key inputs: provider ids/aliases, routed/full model names.
    const loadSuggestions = async () => {
      try {
        const res = await fetch("/api/models", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const models = Array.isArray(data?.models) ? data.models : [];
        const providers = new Set();
        const names = new Set();
        for (const m of models) {
          if (m?.provider) providers.add(m.provider);
          if (typeof m?.routedModel === "string") {
            names.add(m.routedModel);
            const alias = m.routedModel.split("/")[0];
            if (alias) providers.add(alias);
          }
          if (typeof m?.fullModel === "string") names.add(m.fullModel);
        }
        if (cancelled) return;
        setProviderOptions([...providers].sort());
        setModelOptions([...names].sort());
      } catch {
        // Suggestions are optional; the key inputs stay free-text.
      }
    };

    loadSettings();
    loadSuggestions();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const systemPrompts = {
        enabled,
        universal: universal.trim(),
        providers: objectFromRows(providerRows),
        models: objectFromRows(modelRows),
      };
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompts }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setMessage({
        kind: "ok",
        text: "Saved. New requests pick it up immediately - no restart needed.",
      });
    } catch (error) {
      setMessage({ kind: "err", text: error.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="font-medium">Enable system prompt injection</p>
            <p className="text-sm text-text-muted">
              Layers stack in order (universal, then provider, then model) and are appended
              to every routed chat request. Off means nothing is injected; injection is
              fail-open and skips requests that already carry the same text.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Toggle checked={enabled} onChange={setEnabled} />
            <Button icon="save" onClick={handleSave} loading={saving}>
              Save
            </Button>
          </div>
        </div>
        {message && (
          <p className={`text-sm mt-3 ${message.kind === "ok" ? "text-success" : "text-red-500"}`}>
            {message.text}
          </p>
        )}
      </Card>

      <Card title="Universal" subtitle="Applies to every model and provider.">
        <textarea
          value={universal}
          onChange={(e) => setUniversal(e.target.value)}
          placeholder="e.g. Always answer in Indonesian unless the user writes in another language."
          spellCheck={false}
          className={TEXTAREA_CLASS}
        />
      </Card>

      <ScopeSection
        title="Per provider"
        description="One prompt per provider. Applies to every model routed through it."
        hint="Key: provider id (e.g. opencode) or routing alias (e.g. oc)."
        listId="sp-provider-options"
        placeholderKey="provider id or alias, e.g. oc"
        placeholderValue="System prompt for this provider..."
        addLabel="Add provider"
        emptyText="No provider-specific prompts."
        rows={providerRows}
        setRows={setProviderRows}
      />

      <ScopeSection
        title="Per model"
        description="Most specific layer. Applies only to the listed model."
        hint='Key: "alias/model" (e.g. oc/grok-code-fast-1) or "provider/model".'
        listId="sp-model-options"
        placeholderKey="alias/model, e.g. oc/grok-code-fast-1"
        placeholderValue="System prompt for this model..."
        addLabel="Add model"
        emptyText="No model-specific prompts."
        rows={modelRows}
        setRows={setModelRows}
      />

      <datalist id="sp-provider-options">
        {providerOptions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <datalist id="sp-model-options">
        {modelOptions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
    </div>
  );
}
