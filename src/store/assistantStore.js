/**
 * Assistant Store — state for the built-in NadeAI assistant panel.
 * Chat history, selected model and panel visibility persist in localStorage.
 */

import { create } from "zustand";

const STORAGE_KEY = "nadeai.assistant.v1";
const MAX_STORED_MESSAGES = 60;

let messageCounter = 0;
let spotlightCounter = 0;

export function nextMessageId(prefix = "m") {
  messageCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${messageCounter}`;
}

export const useAssistantStore = create((set, get) => ({
  open: false,
  hydrated: false,
  messages: [],
  busy: false,
  model: "",
  spotlight: null,

  hydrate: () => {
    if (get().hydrated) return;
    let stored = null;
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      stored = raw ? JSON.parse(raw) : null;
    } catch {
      stored = null;
    }
    set({
      hydrated: true,
      open: stored?.open === true,
      model: typeof stored?.model === "string" ? stored.model : "",
      messages: Array.isArray(stored?.messages) ? stored.messages.slice(-MAX_STORED_MESSAGES) : [],
    });
  },

  setOpen: (open) => set({ open: open === true }),
  toggleOpen: () => set((state) => ({ open: !state.open })),

  setBusy: (busy) => set({ busy: busy === true }),
  setModel: (model) => set({ model: typeof model === "string" ? model : "" }),

  appendMessage: (message) => {
    set((state) => ({ messages: [...state.messages, message] }));
    return message.id;
  },

  updateMessage: (id, patch) => {
    set((state) => ({
      messages: state.messages.map((message) => {
        if (message.id !== id) return message;
        const next = typeof patch === "function" ? patch(message) : { ...message, ...patch };
        return next || message;
      }),
    }));
  },

  clearConversation: () => set({ messages: [], spotlight: null }),

  setSpotlight: (payload) => {
    spotlightCounter += 1;
    set({ spotlight: payload ? { requestId: spotlightCounter, ...payload } : null });
  },

  clearSpotlight: (requestId) =>
    set((state) => {
      if (!state.spotlight) return {};
      if (requestId !== undefined && state.spotlight.requestId !== requestId) return {};
      return { spotlight: null };
    }),
}));

// Persist the interesting primitives only; keeps the panel alive across reloads.
if (typeof window !== "undefined") {
  useAssistantStore.subscribe((state, prevState) => {
    if (state.open === prevState.open && state.model === prevState.model && state.messages === prevState.messages) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          open: state.open,
          model: state.model,
          messages: state.messages.slice(-MAX_STORED_MESSAGES),
        }),
      );
    } catch {
      // Storage full or blocked — persistence is best-effort.
    }
  });
}
