"use client";

import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";

export interface MapStop { n: number; name: string; lat: number; lon: number }

/** Mapa de OpenStreetMap con el punto de partida y las paradas numeradas, unidas en orden. */
export function DayMap({ origin, originName, stops }: { origin: { lat: number; lon: number }; originName: string; stops: MapStop[] }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !host.current) return;
      if (!map.current) {
        map.current = L.map(host.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([origin.lat, origin.lon], 13);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' }).addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
      }
      const g = layer.current!;
      g.clearLayers();
      const pin = (n: string, cls: string) => L.divIcon({ className: "", html: `<div class="day-pin ${cls}">${n}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      const pts: Array<[number, number]> = [[origin.lat, origin.lon]];
      L.marker([origin.lat, origin.lon], { icon: pin("●", "is-origin"), title: originName }).bindTooltip(originName).addTo(g);
      for (const s of stops) {
        pts.push([s.lat, s.lon]);
        L.marker([s.lat, s.lon], { icon: pin(String(s.n), ""), title: s.name }).bindTooltip(`${s.n}. ${s.name}`).addTo(g);
      }
      if (pts.length > 1) {
        L.polyline(pts, { color: "#46d4f2", weight: 3, opacity: 0.85, dashArray: "6 6" }).addTo(g);
        map.current.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
      } else map.current.setView(pts[0]!, 14);
    })();
    return () => { cancelled = true; };
  }, [origin.lat, origin.lon, originName, stops]);

  useEffect(() => () => { map.current?.remove(); map.current = null; layer.current = null; }, []);

  return (
    <div
      ref={host}
      role="img"
      aria-label={`Mapa de ${originName} con ${stops.length} parada${stops.length === 1 ? "" : "s"}. El detalle está en la lista del itinerario.`}
      className="h-[320px] w-full overflow-hidden rounded-2xl border border-line lg:h-[380px]"
    />
  );
}
