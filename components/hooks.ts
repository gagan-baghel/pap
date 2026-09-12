"use client";

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";

export const DEFAULT_PLACE = { lat: 12.9719, lng: 77.6412, label: "Bengaluru" };
const LS_KEY = "pap.coords";

export function useMe() {
  return useQuery(api.users.me);
}

/** A clock that ticks, so "in 25 min" stays honest without re-querying the server. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export type GeoSource = "gps" | "home" | "default";

/** Last known position, so a returning user sees nearby plans before the GPS answers. */
function readStoredCoords(): { lat: number; lng: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return typeof parsed?.lat === "number" && typeof parsed?.lng === "number" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Location, in order of preference: live GPS (only after permission is already
 * granted or the user asks), the approximate home area on the profile, then the
 * launch city. We never store precise coordinates server-side.
 */
export function useGeo() {
  const me = useMe();
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(readStoredCoords);
  const [denied, setDenied] = useState(false);
  const [asking, setAsking] = useState(false);

  const locate = useCallback((explicit = false) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setDenied(true);
      return Promise.resolve(null);
    }
    setAsking(true);
    return new Promise<{ lat: number; lng: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const c = { lat: p.coords.latitude, lng: p.coords.longitude };
          setGps(c);
          setDenied(false);
          setAsking(false);
          try {
            localStorage.setItem(LS_KEY, JSON.stringify(c));
          } catch {}
          resolve(c);
        },
        () => {
          setAsking(false);
          if (explicit) setDenied(true);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
      );
    });
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((p) => {
      if (p.state === "granted") {
        void locate();
      }
      if (p.state === "denied") setDenied(true);
    }).catch(() => {});
  }, [locate]);

  const coords = gps ?? (me?.homeLat != null && me?.homeLng != null ? { lat: me.homeLat, lng: me.homeLng } : DEFAULT_PLACE);
  const source: GeoSource = gps ? "gps" : me?.homeLat != null ? "home" : "default";
  const label = gps ? "your location" : me?.areaName || DEFAULT_PLACE.label;
  return { coords, source, label, denied, asking, locate: () => locate(true) };
}

/** Native share sheet where it exists, clipboard everywhere else. */
export function useShare() {
  return useCallback(async (url: string, title: string, text?: string) => {
    const full = url.startsWith("http") ? url : `${location.origin}${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ url: full, title, text });
        return "shared" as const;
      } catch {
        return "cancelled" as const;
      }
    }
    await navigator.clipboard.writeText(full);
    return "copied" as const;
  }, []);
}

export function useLocalStorage(key: string) {
  return {
    get: () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (v: string) => {
      try {
        localStorage.setItem(key, v);
      } catch {}
    },
  };
}
