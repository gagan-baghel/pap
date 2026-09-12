"use client";

import { ConvexError } from "convex/values";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

const subscribeToNetwork = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

type Toast = { id: number; text: string; tone: "ok" | "bad" };
const Ctx = createContext<(text: string, tone?: "ok" | "bad") => void>(() => {});

export const useToast = () => useContext(Ctx);

/** Turns anything thrown by a Convex function into the sentence we wrote for the user. */
export function errorText(e: unknown) {
  if (e instanceof ConvexError) return String(e.data);
  const m = e instanceof Error ? e.message : "";
  if (/InvalidAccountId|InvalidSecret/i.test(m)) return "that email and password don't match";
  if (/Rate limit/i.test(m)) return "too many tries — wait a minute";
  return "something went wrong. try again?";
}

type PopoverEl = HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const host = useRef<PopoverEl>(null);

  useEffect(() => {
    const el = host.current;
    if (!el?.showPopover) return; // older browsers: plain fixed positioning, still fine outside sheets
    try {
      if (items.length) el.showPopover();
      else el.hidePopover?.();
    } catch {
      /* already open/closed */
    }
  }, [items.length]);
  const offline = useSyncExternalStore(subscribeToNetwork, () => !navigator.onLine, () => false);

  const push = useCallback((text: string, tone: "ok" | "bad" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, text, tone }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {offline && (
        <div className="fixed inset-x-0 top-0 z-[110] bg-ink px-4 py-2 pt-[calc(0.5rem+var(--sat))] text-center text-xs font-bold text-white">
          you're offline — plans will sync when you're back
        </div>
      )}
      {children}
      {/* a native <dialog> paints in the browser's top layer, above any z-index — so the
          toast host has to live there too, or errors raised inside a sheet are invisible */}
      <div
        ref={host}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ popover: "manual" } as any)}
        className="toast-host pointer-events-none fixed z-[100] flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`animate-rise pointer-events-auto max-w-sm rounded-full px-4 py-3 text-sm font-semibold shadow-lift ${
              t.tone === "bad" ? "bg-white text-[#c02637]" : "bg-ink text-white"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
