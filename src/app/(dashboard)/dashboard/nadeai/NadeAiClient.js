"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardSkeleton,
  ConfirmModal,
  Input,
  ModelSelectModal,
} from "@/shared/components";
import { getProviderAlias } from "@/shared/constants/providers";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import { composeModelId, splitModelId } from "@/shared/utils/nadeaiModels";

const TEXTAREA_CLASS =
  "w-full min-h-[110px] py-2.5 px-3 text-sm text-text-main bg-surface-2 rounded-[10px] " +
  "border border-transparent placeholder-text-muted/70 focus:outline-none focus:ring-2 " +
  "focus:ring-brand-500/30 focus:border-brand-500/40 transition-all duration-150 ease-out";

const EMPTY_FORM = {
  previousId: null,
  publicProvider: "nadeai",
  publicModel: "",
  realProvider: "",
  realModel: "",
  systemPrompt: "",
};

export default function NadeAiClient() {
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState([]);
  const [promptsEnabled, setPromptsEnabled] = useState(true);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [testing, setTesting] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [showPicker, setShowPicker] = useState(false);
  const [pickerAliases, setPickerAliases] = useState({});
  const [providerOptions, setProviderOptions] = useState([]);
  const [modelOptionsByProvider, setModelOptionsByProvider] = useState({});

  const searchQuery = useHeaderSearchStore((s) => s.query);
  const registerSearch = useHeaderSearchStore((s) => s.register);
  const unregisterSearch = useHeaderSearchStore((s) => s.unregister);

  useEffect(() => {
    registerSearch("Search masked models...");
    return () => unregisterSearch();
  }, [registerSearch, unregisterSearch]);

  const load = useCallback(async () => {
    try {
      const [modelsRes, providersRes, nodesRes, catalogRes, aliasRes] = await Promise.all([
        fetch("/api/nadeai/models", { cache: "no-store" }),
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/provider-nodes", { cache: "no-store" }),
        fetch("/api/models", { cache: "no-store" }),
        fetch("/api/models/alias", { cache: "no-store" }),
      ]);

      const data = await modelsRes.json();
      if (!modelsRes.ok) throw new Error(data?.error || `Load failed (${modelsRes.status})`);
      setModels(Array.isArray(data?.models) ? data.models : []);
      setPromptsEnabled(data?.promptsEnabled !== false);

      const providers = new Set();
      if (providersRes.ok) {
        const pData = await providersRes.json();
        for (const conn of pData?.connections || []) {
          if (!conn?.provider) continue;
          providers.add(conn.provider);
          const alias = getProviderAlias(conn.provider);
          if (alias) providers.add(alias);
        }
      }
      if (nodesRes.ok) {
        const nData = await nodesRes.json();
        for (const node of nData?.nodes || []) {
          if (node?.id) providers.add(node.id);
          if (node?.prefix) providers.add(node.prefix);
        }
      }
      setProviderOptions([...providers].sort());

      const byProvider = {};
      if (catalogRes.ok) {
        const cData = await catalogRes.json();
        for (const m of cData?.models || []) {
          const routed = typeof m?.routedModel === "string" ? m.routedModel : "";
          const parsed =
            splitModelId(routed) ||
            splitModelId(typeof m?.fullModel === "string" ? m.fullModel : "");
          if (!parsed) continue;
          (byProvider[parsed.provider] ||= []).push(parsed.model);
        }
        for (const key of Object.keys(byProvider)) {
          byProvider[key] = [...new Set(byProvider[key])].sort();
        }
      }
      setModelOptionsByProvider(byProvider);

      if (aliasRes.ok) {
        const aData = await aliasRes.json();
        setPickerAliases(aData?.aliases || {});
      }
    } catch (error) {
      setMessage({ kind: "err", text: error.message || "Load failed" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => `${m.id} ${m.realId}`.toLowerCase().includes(q));
  }, [models, searchQuery]);

  const modelListId = `nadeai-real-models-${(form.realProvider || "any").replace(/[^a-z0-9_-]/gi, "")}`;
  const modelSuggestions = useMemo(() => {
    const scoped = modelOptionsByProvider[form.realProvider];
    if (scoped?.length) return scoped;
    return [...new Set(Object.values(modelOptionsByProvider).flat())].slice(0, 500);
  }, [modelOptionsByProvider, form.realProvider]);

  const startAdd = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
    setMessage(null);
  };

  const startEdit = (model) => {
    setForm({
      previousId: model.id,
      publicProvider: model.provider,
      publicModel: model.model,
      realProvider: model.realProvider,
      realModel: model.realModel,
      systemPrompt: model.systemPrompt || "",
    });
    setFormOpen(true);
    setMessage(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    const fakeId = composeModelId(form.publicProvider, form.publicModel);
    const realId = composeModelId(form.realProvider, form.realModel);
    if (!fakeId || !realId) {
      setMessage({
        kind: "err",
        text: "Both the public id and the real target need a provider and a model.",
      });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/nadeai/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previousFakeId: form.previousId || undefined,
          fakeId,
          realId,
          systemPrompt: form.systemPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);
      setMessage({ kind: "ok", text: `Saved ${fakeId} -> ${realId}.` });
      setFormOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (error) {
      setMessage({ kind: "err", text: error.message || "Save failed" });
    } finally {
      setBusy(false);
    }
  };

  const deleteModel = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/nadeai/models?fakeId=${encodeURIComponent(confirmDelete.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Delete failed (${res.status})`);
      setMessage({ kind: "ok", text: `Deleted ${confirmDelete.id}.` });
      setConfirmDelete(null);
      await load();
    } catch (error) {
      setMessage({ kind: "err", text: error.message || "Delete failed" });
    } finally {
      setBusy(false);
    }
  };

  const testModel = async (id) => {
    setTesting(id);
    setTestResults((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: id }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [id]: data?.ok
          ? { kind: "ok", text: `ok - ${data.latencyMs}ms` }
          : { kind: "err", text: data?.error || "failed" },
      }));
    } catch (error) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { kind: "err", text: error.message || "failed" },
      }));
    } finally {
      setTesting(null);
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
      <Card
        icon="theater_comedy"
        title="NadeAI - masked models"
        subtitle="One public id per model; the real provider/model stays hidden behind it."
      >
        <ul className="flex flex-col gap-1.5 pl-5 text-sm text-text-muted list-disc">
          <li>
            Requests for the public id (e.g. <code className="font-mono">nadeai/claude-fable-5.1</code>)
            are routed to the real target (e.g. <code className="font-mono">oc/deepseek-v4.1-flash-free</code>).
          </li>
          <li>
            Replies, <code className="font-mono">/v1/models</code>, and logs only ever show the public id.
          </li>
          <li>
            The optional system prompt is stored under the same key on the System Prompt page
            (<code className="font-mono">Per model</code> scope) - both pages edit the same state.
          </li>
        </ul>
        {!promptsEnabled && (
          <p className="text-sm mt-4 text-amber-600 dark:text-amber-400">
            System prompt injection is off - per-model prompts are stored but not sent until
            injection is enabled on the{" "}
            <Link href="/dashboard/system-prompt" className="underline">
              System Prompt
            </Link>{" "}
            page.
          </p>
        )}
        {message && (
          <p className={`text-sm mt-4 ${message.kind === "ok" ? "text-success" : "text-red-500"}`}>
            {message.text}
          </p>
        )}
      </Card>

      {formOpen && (
        <Card
          icon="theater_comedy"
          title={form.previousId ? `Edit ${form.previousId}` : "Add masked model"}
          subtitle={
            form.previousId
              ? "Renaming replaces the id - requests for the old public id stop routing."
              : undefined
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Public provider"
              value={form.publicProvider}
              onChange={(e) => setForm((f) => ({ ...f, publicProvider: e.target.value }))}
              placeholder="nadeai"
              data-assistant-id="nadeai-form-public-provider"
              list="nadeai-public-providers"
              hint="Prefix clients see - anything (nadeai, anthropic, ...)."
            />
            <Input
              label="Public model"
              value={form.publicModel}
              onChange={(e) => setForm((f) => ({ ...f, publicModel: e.target.value }))}
              placeholder="claude-fable-5.1"
              data-assistant-id="nadeai-form-public-model"
            />
            <Input
              label="Real provider"
              value={form.realProvider}
              onChange={(e) => setForm((f) => ({ ...f, realProvider: e.target.value }))}
              placeholder="oc"
              data-assistant-id="nadeai-form-real-provider"
              list="nadeai-providers"
              hint="Active provider id or routing alias."
            />
            <div>
              <Input
                label="Real model"
                value={form.realModel}
                onChange={(e) => setForm((f) => ({ ...f, realModel: e.target.value }))}
                placeholder="deepseek-v4.1-flash-free"
                data-assistant-id="nadeai-form-real-model"
                list={modelListId}
              />
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">travel_explore</span>
                Pick from active providers
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-text-muted">
            Preview:{" "}
            <code className="font-mono">
              {composeModelId(form.publicProvider, form.publicModel) || "..."}
            </code>
            {" -> "}
            <code className="font-mono">
              {composeModelId(form.realProvider, form.realModel) || "..."}
            </code>
          </p>

          <div className="mt-4">
            <p className="text-sm font-medium text-text-main">System prompt (optional)</p>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              placeholder="e.g. You are Claude Fable 5.1 ..."
              data-assistant-id="nadeai-form-prompt"
              spellCheck={false}
              className={`${TEXTAREA_CLASS} mt-1.5`}
            />
            <p className="text-xs text-text-muted mt-1.5">
              Stored as the <code>Per model</code> scope keyed by the public id. Leave empty to
              remove a prompt.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 mt-5">
            <Button
              variant="ghost"
              onClick={() => {
                setFormOpen(false);
                setForm(EMPTY_FORM);
              }}
            >
              Cancel
            </Button>
            <Button icon="save" onClick={save} loading={busy} data-assistant-id="nadeai-form-save">
              Save
            </Button>
          </div>
        </Card>
      )}

      <Card
        title="Models"
        subtitle="Public id -> real target. Test sends one real ping through the router."
        action={
          <Button size="sm" icon="add" onClick={startAdd} data-assistant-id="nadeai-add">
            Add model
          </Button>
        }
      >
        <div data-assistant-id="nadeai-models-list">
        {models.length === 0 ? (
          <p className="text-sm text-text-muted">No masked models yet - use &quot;Add model&quot;.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-text-muted">No matches for your search.</p>
        ) : (
          filtered.map((model) => (
            <div
              key={model.id}
              className="flex flex-col gap-2 border-b border-border-subtle py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <code className="rounded bg-sidebar px-1.5 py-0.5 font-mono text-xs text-text-main">
                  {model.id}
                </code>
                <span className="material-symbols-outlined text-[14px] text-text-muted">arrow_forward</span>
                <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-xs text-text-muted">
                  {model.realId}
                </code>
                {model.systemPrompt ? (
                  <Badge variant="primary" size="sm">
                    prompt
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {testResults[model.id] && (
                  <span
                    className={`mr-1 max-w-[220px] truncate text-xs ${
                      testResults[model.id].kind === "ok"
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-500"
                    }`}
                  >
                    {testResults[model.id].text}
                  </span>
                )}
                <Button
                  size="xs"
                  variant="ghost"
                  icon="science"
                  title="Send a test ping"
                  aria-label={`Test ${model.id}`}
                  onClick={() => testModel(model.id)}
                  loading={testing === model.id}
                />
                <Button
                  size="xs"
                  variant="ghost"
                  icon="edit"
                  title="Edit"
                  aria-label={`Edit ${model.id}`}
                  onClick={() => startEdit(model)}
                />
                <Button
                  size="xs"
                  variant="ghost"
                  icon="delete"
                  title="Delete"
                  aria-label={`Delete ${model.id}`}
                  onClick={() => setConfirmDelete(model)}
                />
              </div>
            </div>
          ))
        )}
        </div>
      </Card>

      <datalist id="nadeai-public-providers">
        {["nadeai", ...providerOptions]
          .filter((v, i, a) => v && a.indexOf(v) === i)
          .map((value) => (
            <option key={value} value={value} />
          ))}
      </datalist>
      <datalist id="nadeai-providers">
        {providerOptions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <datalist id={modelListId}>
        {modelSuggestions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>

      <ModelSelectModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        title="Pick real target"
        modelAliases={pickerAliases}
        hideCombos
        onSelect={(model) => {
          const value =
            typeof model === "string" ? model : model?.value || model?.fullModel || "";
          const parsed = splitModelId(value);
          if (parsed) {
            setForm((f) => ({ ...f, realProvider: parsed.provider, realModel: parsed.model }));
          }
          setShowPicker(false);
        }}
      />

      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={deleteModel}
        title="Delete masked model"
        message={
          confirmDelete
            ? `Remove "${confirmDelete.id}"? Requests for that public id stop routing - the real model is untouched.`
            : ""
        }
        confirmText="Delete"
        loading={busy}
      />
    </div>
  );
}
