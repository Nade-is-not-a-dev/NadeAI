"use client";

// Provider picker for system-prompt provider scopes. Lists only providers that
// can route right now — active connections, no-auth free providers, and
// compatible nodes that already have user-added models — mirroring how the
// Combo & Vision Adapter picker (ModelSelectModal) sources its entries.
// Click a row to add that provider as a scope on the System Prompt page.

import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Modal } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import {
  AI_PROVIDERS,
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  getProviderAlias,
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
} from "@/shared/constants/providers";
import { getDeactivatedProviderIds } from "@/shared/utils/connectionStatus";
import { PROVIDER_ALIASES_BY_ID } from "open-sse/services/model.js";

// Same display order as the model picker: OAuth, Free, Free Tier, API Key.
const PROVIDER_ORDER = [
  ...Object.keys(OAUTH_PROVIDERS),
  ...Object.keys(FREE_PROVIDERS),
  ...Object.keys(FREE_TIER_PROVIDERS),
  ...Object.keys(APIKEY_PROVIDERS),
];

export default function ProviderSelectModal({ isOpen, onClose, onAdd, addedKeys = [] }) {
  const [connections, setConnections] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [customModels, setCustomModels] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = async () => {
    try {
      const [connRes, nodeRes, customRes] = await Promise.all([
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/provider-nodes", { cache: "no-store" }),
        fetch("/api/models/custom", { cache: "no-store" }),
      ]);
      if (connRes.ok) setConnections((await connRes.json()).connections || []);
      if (nodeRes.ok) setNodes((await nodeRes.json()).nodes || []);
      if (customRes.ok) setCustomModels((await customRes.json()).models || []);
    } catch (error) {
      console.error("Error fetching providers for scope picker:", error);
    }
  };

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen]);

  const addedSet = useMemo(() => {
    const set = new Set();
    for (const key of addedKeys || []) {
      const text = String(key || "").trim().toLowerCase();
      if (text) set.add(text);
    }
    return set;
  }, [addedKeys]);

  const isAdded = (entry) =>
    addedSet.has(entry.id.toLowerCase()) || addedSet.has(entry.key.toLowerCase());

  const entries = useMemo(() => {
    const deactivated = getDeactivatedProviderIds(connections);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const connCount = new Map();
    for (const c of connections) {
      if (!c?.provider || c.isActive === false) continue;
      connCount.set(c.provider, (connCount.get(c.provider) || 0) + 1);
    }

    const seen = new Set();
    const out = [];
    const push = (id, { noAuth = false } = {}) => {
      if (!id || seen.has(id) || deactivated.has(id)) return;
      seen.add(id);
      const meta = AI_PROVIDERS[id] || null;
      const node = nodeById.get(id) || null;
      const count = connCount.get(id) || 0;

      // Prefer the UI handle only when it routes to this provider; otherwise
      // the provider id is the only spelling guaranteed to select this scope
      // (e.g. mimo-free's UI alias `mmf` routes to the `mmf` provider instead).
      const uiAlias = getProviderAlias(id) || id;
      const routable = PROVIDER_ALIASES_BY_ID[id] || [];
      const key = uiAlias !== id && routable.includes(uiAlias) ? uiAlias : id;

      const parts = [];
      if (count > 0) parts.push(`${count} active connection${count === 1 ? "" : "s"}`);
      if (noAuth) parts.push("no-auth");
      if (node) parts.push(`compatible node${node.prefix ? ` · prefix ${node.prefix}` : ""}`);

      out.push({
        id,
        key,
        name: node?.name || meta?.name || id,
        sub: parts.join(" · "),
        color: meta?.color,
        textIcon: meta?.textIcon || id.slice(0, 2).toUpperCase(),
        order: PROVIDER_ORDER.indexOf(id),
      });
    };

    for (const id of connCount.keys()) push(id);
    for (const id of Object.keys(FREE_PROVIDERS)) {
      if (FREE_PROVIDERS[id].noAuth) push(id, { noAuth: true });
    }
    // Compatible nodes with registered models are selectable even without a
    // connection (local/self-hosted endpoints often need no stored key).
    for (const m of customModels) {
      const alias = m?.providerAlias;
      if (alias && nodeById.has(alias) && (isOpenAICompatibleProvider(alias) || isAnthropicCompatibleProvider(alias))) {
        push(alias);
      }
    }

    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? out.filter((e) =>
          [e.name, e.id, e.key].some((v) => String(v || "").toLowerCase().includes(query))
        )
      : out;

    return filtered.sort((a, b) => {
      const ia = a.order === -1 ? 999 : a.order;
      const ib = b.order === -1 ? 999 : b.order;
      return ia - ib || a.name.localeCompare(b.name);
    });
  }, [connections, nodes, customModels, searchQuery]);

  const handleSelect = (entry) => {
    if (isAdded(entry)) return;
    onAdd(entry);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        onClose();
        setSearchQuery("");
      }}
      title="Add Provider Scope"
      size="lg"
      className="p-4!"
      footer={null}
    >
      {/* Info bar */}
      <div className="flex items-center gap-2 mb-3 px-2.5 py-2 bg-primary/8 border border-primary/20 rounded-lg text-xs text-text-muted">
        <span className="material-symbols-outlined text-primary shrink-0" style={{ fontSize: "14px" }}>info</span>
        <span>Click a provider to add a scope for it. Only providers that can route right now are listed.</span>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-[16px]">
          search
        </span>
        <input
          type="text"
          placeholder="Search providers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 bg-surface border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      {/* Provider list */}
      <div className="max-h-[400px] overflow-y-auto space-y-1.5">
        {entries.map((entry) => {
          const added = isAdded(entry);
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => handleSelect(entry)}
              disabled={added}
              title={added ? "Already added" : `Add a scope for ${entry.name}`}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                added
                  ? "border-primary/40 bg-primary/5 cursor-default"
                  : "border-border cursor-pointer hover:border-primary/50 hover:bg-primary/5"
              }`}
            >
              <ProviderIcon
                src={`/providers/${entry.id}.png`}
                alt={entry.name}
                size={20}
                className="object-contain rounded shrink-0"
                fallbackText={entry.textIcon}
                fallbackColor={entry.color}
              />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-text-main">{entry.name}</span>
                  <code className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 font-mono text-[10px] text-text-muted dark:bg-white/5">
                    {entry.key}
                  </code>
                </span>
                {entry.sub && (
                  <span className="mt-0.5 block truncate text-[10px] text-text-muted">{entry.sub}</span>
                )}
              </span>
              <span className={`material-symbols-outlined shrink-0 text-[16px] ${added ? "text-primary" : "text-text-muted"}`}>
                {added ? "check" : "arrow_forward"}
              </span>
            </button>
          );
        })}

        {entries.length === 0 && (
          <div className="text-center py-4 text-text-muted">
            <span className="material-symbols-outlined text-2xl mb-1 block">search_off</span>
            <p className="text-xs">
              {searchQuery.trim()
                ? "No providers match the search."
                : "No active providers found. Connect a provider on the Providers page first."}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

ProviderSelectModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onAdd: PropTypes.func.isRequired,
  addedKeys: PropTypes.arrayOf(PropTypes.string),
};
