"use client";

// NadeAI Assistant — top-level mount: panel, launcher button and the
// spotlight overlay. Rendered once by the dashboard layout so it survives
// client-side navigation.

import { useEffect } from "react";
import { useAssistantStore } from "@/store/assistantStore";
import AssistantPanel from "./AssistantPanel";
import SpotlightOverlay from "./SpotlightOverlay";

export default function AssistantDock() {
  const open = useAssistantStore((s) => s.open);

  useEffect(() => {
    useAssistantStore.getState().hydrate();
  }, []);

  return (
    <>
      <AssistantPanel />
      {!open && (
        <button
          type="button"
          data-assistant-id="assistant-launcher"
          onClick={() => useAssistantStore.getState().toggleOpen()}
          title="NadeAI Assistant"
          aria-label="Open NadeAI Assistant"
          className="fixed bottom-5 right-5 z-[70] flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <span className="material-symbols-outlined text-[22px]">theater_comedy</span>
        </button>
      )}
      <SpotlightOverlay />
    </>
  );
}
