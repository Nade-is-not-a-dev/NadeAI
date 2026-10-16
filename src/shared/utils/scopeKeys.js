// System-prompt scope keys vs. compatible provider nodes.
//
// The model picker (ModelSelectModal) emits compatible-node models using the
// node's display prefix ("oc-prod/glm-4.7" — the handle shown across the
// dashboard). System-prompt matching, however, compares the resolved provider
// identity: chatCore resolves a node prefix request to the node id, and the
// runtime alias of a node is its id, so the matched key is
// "<nodeId>/glm-4.7". Storing the display prefix would create a scope that can
// never match, so the system-prompt page converts in both directions around
// the picker: prefix -> node id when saving, node id -> prefix when marking
// the picker's already-added entries.

/**
 * Index provider nodes for key conversion.
 * @param {Array<{id: string, prefix?: string}>} providerNodes
 */
export function buildNodeIndex(providerNodes) {
  const byPrefix = new Map();
  const byId = new Map();
  for (const node of providerNodes || []) {
    if (!node?.id) continue;
    byId.set(node.id, node);
    if (node.prefix) byPrefix.set(node.prefix, node);
  }
  return { byPrefix, byId };
}

const splitEntry = (text) => {
  const i = text.indexOf("/");
  return i > 0 ? [text.slice(0, i), text.slice(i + 1)] : null;
};

/** Picker value -> scope key ("oc-prod/x" -> "openai-compatible-chat-.../x"). */
export function toStoredModelKey(value, nodeIndex) {
  const text = typeof value === "string" ? value.trim() : "";
  const parts = splitEntry(text);
  if (!parts || !nodeIndex) return text;
  const [head, rest] = parts;
  const node = nodeIndex.byPrefix.get(head);
  return node ? `${node.id}/${rest}` : text;
}

/** Scope key -> picker value ("openai-compatible-chat-.../x" -> "oc-prod/x"). */
export function toPickerModelValue(key, nodeIndex) {
  const text = typeof key === "string" ? key.trim() : "";
  const parts = splitEntry(text);
  if (!parts || !nodeIndex) return text;
  const [head, rest] = parts;
  const node = nodeIndex.byId.get(head);
  return node?.prefix ? `${node.prefix}/${rest}` : text;
}
