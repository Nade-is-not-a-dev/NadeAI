"use client";

// NadeAI Assistant — spotlight overlay. Resolves a target id to a DOM node
// (data-assistant-id → registry selector → visible-text match), navigates to
// the target's page if needed, then dims the page around the element and
// shows the note. Any click or Esc dismisses it.

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAssistantStore } from "@/store/assistantStore";
import { findAssistantTarget } from "@/shared/constants/assistantMap.js";

const RESOLVE_TIMEOUT_MS = 3200;
const POLL_MS = 150;
const MEASURE_DELAY_MS = 320;
const MISSING_AUTO_CLOSE_MS = 10000;
const PAD = 6;

function isVisible(element) {
  if (!element || !element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

function findByText(text) {
  const needle = String(text || "").trim().toLowerCase();
  if (!needle) return null;
  const candidates = document.querySelectorAll("h1, h2, h3, button, a, label, [role='button']");
  let partial = null;
  for (const element of candidates) {
    if (!isVisible(element)) continue;
    const value = (element.textContent || "").trim().toLowerCase();
    if (!value) continue;
    if (value === needle) return element;
    if (!partial && value.includes(needle)) partial = element;
  }
  return partial;
}

function resolveTarget(target) {
  if (typeof document === "undefined" || !target) return null;
  const safe = String(target).replace(/["\\]/g, "");
  let element = document.querySelector(`[data-assistant-id="${safe}"]`);
  if (element) return element;

  const entry = findAssistantTarget(target);
  if (entry?.selector) {
    try {
      element = document.querySelector(entry.selector);
      if (element) return element;
    } catch {
      // Invalid selector in the registry — fall through.
    }
  }
  if (entry?.text) return findByText(entry.text) || findByText(entry.label);
  return null;
}

function measureRect(element) {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

export default function SpotlightOverlay() {
  const spotlight = useAssistantStore((s) => s.spotlight);
  const clearSpotlight = useAssistantStore((s) => s.clearSpotlight);
  const router = useRouter();
  const pathname = usePathname();

  // `shown` carries the request it belongs to; data from an older request is
  // ignored by the derived `active` below, so a new spotlight request needs no
  // state reset — the render output simply ignores stale measurements.
  const [shown, setShown] = useState({ requestId: null, rect: null, missing: false });
  const elementRef = useRef(null);

  const active = spotlight
    ? shown.requestId === spotlight.requestId
      ? shown
      : { requestId: spotlight.requestId, rect: null, missing: false, locating: true }
    : null;

  // Navigate (when needed) + resolve the target element.
  useEffect(() => {
    const timers = { poll: null, measure: null };
    const clearTimers = () => {
      if (timers.poll) clearInterval(timers.poll);
      if (timers.measure) clearTimeout(timers.measure);
    };
    elementRef.current = null;

    if (!spotlight) return clearTimers;

    const targetPath = typeof spotlight.path === "string" && spotlight.path ? spotlight.path.split("?")[0] : null;
    if (targetPath && targetPath !== pathname) {
      router.push(targetPath);
      return clearTimers;
    }

    const requestId = spotlight.requestId;
    const startedAt = Date.now();

    const attempt = () => {
      const element = resolveTarget(spotlight.target);
      if (!element) return false;
      clearTimers();
      elementRef.current = element;
      try {
        element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      } catch {
        element.scrollIntoView();
      }
      timers.measure = setTimeout(() => {
        const current = elementRef.current;
        if (current?.isConnected) setShown({ requestId, rect: measureRect(current), missing: false });
        else setShown({ requestId, rect: null, missing: true });
      }, MEASURE_DELAY_MS);
      return true;
    };

    if (attempt()) return clearTimers;

    timers.poll = setInterval(() => {
      if (attempt()) return;
      if (Date.now() - startedAt > RESOLVE_TIMEOUT_MS) {
        clearTimers();
        setShown({ requestId, rect: null, missing: true });
      }
    }, POLL_MS);

    return clearTimers;
  }, [spotlight, pathname, router]);

  // Keep the hole aligned while the page scrolls behind it.
  useEffect(() => {
    if (!spotlight || !active?.rect) return undefined;
    const { requestId } = spotlight;
    const handler = () => {
      if (elementRef.current?.isConnected) {
        setShown({ requestId, rect: measureRect(elementRef.current), missing: false });
      }
    };
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [spotlight, active?.rect]);

  // Dismissal: Esc, any click, or auto-close for the "not found" toast.
  const dismissable = !!(spotlight && active && (active.rect || active.missing));
  useEffect(() => {
    if (!dismissable) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") clearSpotlight();
    };
    const onClick = () => clearSpotlight();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("click", onClick, true);
    const autoClose = active?.missing ? setTimeout(() => clearSpotlight(), MISSING_AUTO_CLOSE_MS) : null;
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("click", onClick, true);
      if (autoClose) clearTimeout(autoClose);
    };
  }, [dismissable, active?.missing, clearSpotlight]);

  if (!spotlight || !active) return null;

  if (active.missing) {
    return (
      <div className="fixed left-1/2 top-20 z-[86] w-[min(92vw,360px)] -translate-x-1/2 rounded-xl border border-amber-500/40 bg-surface-1 p-3 shadow-2xl">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-[16px] text-amber-500">search_off</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-main">Elemen &quot;{spotlight.target}&quot; tidak ditemukan di halaman ini.</p>
            {spotlight.note ? <p className="mt-1 text-[11px] text-text-muted">{spotlight.note}</p> : null}
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => clearSpotlight()}
            className="rounded-lg border border-border-subtle bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-text-main hover:border-primary/40"
          >
            Tutup
          </button>
        </div>
      </div>
    );
  }

  const rect = active.rect;
  if (!rect) return null;

  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
  const tooltipWidth = Math.min(330, viewportWidth - 24);
  const left = Math.min(Math.max(12, rect.left), viewportWidth - tooltipWidth - 12);
  const showAbove = rect.top > 150;
  const top = showAbove ? rect.top - PAD - 12 : rect.top + rect.height + PAD + 12;

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-[84] rounded-xl border-2 border-brand-500 transition-all duration-150"
        style={{
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          boxShadow: "0 0 0 9999px rgba(8,8,12,0.55), 0 0 24px rgba(139,92,246,0.45)",
        }}
      />
      <div
        role="dialog"
        className="fixed z-[86] rounded-xl border border-border-subtle bg-surface-1 p-3 shadow-2xl"
        style={{ width: tooltipWidth, left, top, transform: showAbove ? "translateY(-100%)" : "none" }}
      >
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-[16px] text-brand-500">highlight</span>
          <p className="min-w-0 flex-1 text-xs text-text-main">{spotlight.note || "Di sini."}</p>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => clearSpotlight()}
            className="rounded-lg border border-border-subtle bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-text-main hover:border-primary/40"
          >
            OK
          </button>
        </div>
      </div>
    </>
  );
}
