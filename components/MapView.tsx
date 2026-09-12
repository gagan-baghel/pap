"use client";

import type { Map as LMap, Marker } from "leaflet";
import { useEffect, useRef } from "react";

export type MapPoint = { id: string; lat: number; lng: number; emoji: string; live?: boolean };

// OpenStreetMap's own tiles: keyless and fine at launch volumes. Point
// NEXT_PUBLIC_MAP_TILES at a paid provider (Carto, Stadia, Mapbox) before scaling —
// their free tiers now stamp "API KEY REQUIRED" over unkeyed requests.
const TILES = process.env.NEXT_PUBLIC_MAP_TILES || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIB = '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>';

export default function MapView({
  center,
  zoom = 13,
  points = [],
  selectedId,
  onSelect,
  onCenterChange,
  showMe = true,
  pickMode = false,
  className = "",
}: {
  center: { lat: number; lng: number };
  zoom?: number;
  points?: MapPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onCenterChange?: (c: { lat: number; lng: number }) => void;
  showMe?: boolean;
  pickMode?: boolean;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const meMarker = useRef<Marker | null>(null);
  const select = useRef(onSelect);
  const changed = useRef(onCenterChange);
  useEffect(() => {
    select.current = onSelect;
    changed.current = onCenterChange;
  }, [onSelect, onCenterChange]);

  useEffect(() => {
    let cancelled = false;
    const markerStore = markers.current;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current, { center: [center.lat, center.lng], zoom, zoomControl: false, attributionControl: true });
      L.tileLayer(TILES, { attribution: ATTRIB, maxZoom: 19, detectRetina: true }).addTo(m);
      L.control.zoom({ position: "bottomright" }).addTo(m);
      if (changed.current) m.on("moveend", () => changed.current?.({ lat: m.getCenter().lat, lng: m.getCenter().lng }));
      map.current = m;
      // leaflet measures itself before the pane finishes laying out
      setTimeout(() => m.invalidateSize(), 60);
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      markerStore.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the view roughly where the app wants it without fighting the user's panning
  useEffect(() => {
    const m = map.current;
    if (!m || pickMode) return;
    const c = m.getCenter();
    if (Math.abs(c.lat - center.lat) > 0.02 || Math.abs(c.lng - center.lng) > 0.02) m.setView([center.lat, center.lng], m.getZoom());
  }, [center.lat, center.lng, pickMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      const m = map.current;
      if (cancelled || !m) return;

      if (showMe) {
        const icon = L.divIcon({
          className: "",
          html: `<span style="display:block;width:16px;height:16px;border-radius:999px;background:#2b6ef6;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"></span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        if (meMarker.current) meMarker.current.setLatLng([center.lat, center.lng]);
        else meMarker.current = L.marker([center.lat, center.lng], { icon, interactive: false, zIndexOffset: -100 }).addTo(m);
      }

      const seen = new Set<string>();
      for (const p of points) {
        seen.add(p.id);
        const cls = `pap-pin ${p.live ? "pap-pin-live" : ""} ${selectedId === p.id ? "pap-pin-on" : ""}`;
        const icon = L.divIcon({ className: "", html: `<span class="${cls}">${p.emoji}</span>`, iconSize: [42, 42], iconAnchor: [21, 42] });
        const existing = markers.current.get(p.id);
        if (existing) {
          existing.setIcon(icon);
          existing.setLatLng([p.lat, p.lng]);
        } else {
          const mk = L.marker([p.lat, p.lng], { icon, keyboard: true, title: "plan" }).addTo(m);
          mk.on("click", () => select.current?.(p.id));
          markers.current.set(p.id, mk);
        }
      }
      for (const [id, mk] of markers.current)
        if (!seen.has(id)) {
          mk.remove();
          markers.current.delete(id);
        }
    })();
    return () => {
      cancelled = true;
    };
  }, [points, selectedId, showMe, center.lat, center.lng]);

  return (
    <div className={`relative ${className}`}>
      <div ref={el} className="size-full" />
      {pickMode && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center pb-8">
          <span className="pap-pin !rotate-0 text-2xl shadow-lift">📍</span>
        </div>
      )}
    </div>
  );
}
