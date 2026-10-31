import { ImageResponse } from "next/og";
import { getRepository } from "@/lib/data";
import { evaluateDestination } from "@/lib/engine";
import { DEFAULT_REQUEST, decodeQuery, engineNow, limitOr429 } from "@/lib/server/http";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** GET /api/share/[id]?q= — tarjeta 9:16 (1080×1920) para Stories y WhatsApp (función 11). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = limitOr429(req, "share", 60);
  if (limited) return limited;
  const { id: raw } = await ctx.params;
  if (!/^[A-Za-z]{3}$/.test(raw)) return new Response("No encontrado", { status: 404 });
  const id = raw.toUpperCase();
  const request = decodeQuery(new URL(req.url).searchParams.get("q")) ?? DEFAULT_REQUEST;
  const dataset = await getRepository().getDataset(request.origin, request.month);
  const d = dataset.destinations.find((x) => x.id === id);
  if (!d) return new Response("No encontrado", { status: 404 });
  // El puntaje sale siempre del motor, nunca del parámetro de la URL.
  const r = evaluateDestination(request, d, dataset, engineNow());
  const digits = r.score === null ? ["–", "–"] : String(r.score).padStart(2, "0").split("");
  const p = d.poster;
  const total = r.cost.totalUsd === null ? null : `US$${r.cost.totalUsd.toLocaleString("es-CL")}`;

  return new ImageResponse(
    (
      <div style={{ width: 1080, height: 1920, display: "flex", flexDirection: "column", background: "#0B1626", color: "#F2F5F8" }}>
        <div style={{ width: 1080, height: 860, display: "flex", position: "relative", background: p.sky, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 700, top: 180, width: 220, height: 220, borderRadius: 999, background: p.sun }} />
          <div style={{ position: "absolute", left: -200, top: 420, width: 900, height: 900, background: p.far, transform: "rotate(45deg)" }} />
          <div style={{ position: "absolute", left: 420, top: 520, width: 900, height: 900, background: p.far, transform: "rotate(45deg)" }} />
          <div style={{ position: "absolute", left: 0, top: 700, width: 1080, height: 200, background: "#0B1626" }} />
          <div style={{ position: "absolute", left: 80, top: 760, width: 360, height: 10, borderRadius: 5, background: "#46d4f2" }} />
          <div style={{ position: "absolute", left: 560, top: 740, width: 420, height: 10, borderRadius: 5, background: "#46d4f2" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "40px 80px", flex: 1 }}>
          <div style={{ fontSize: 44, color: "#8FA3BA" }}>Mi próximo viaje</div>
          <div style={{ fontSize: 300, fontWeight: 900, color: "#46d4f2", lineHeight: 0.9, letterSpacing: 6 }}>{d.id}</div>
          <div style={{ fontSize: 64, marginTop: 20 }}>{`${d.name}, ${d.country}`}</div>
          <div style={{ display: "flex", gap: 16, marginTop: 50 }}>
            {digits.map((ch, i) => (
              <div key={i} style={{ width: 170, height: 240, borderRadius: 22, background: "#1a2b43", color: "#46d4f2", fontSize: 190, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {ch}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 44, color: "#C5D0DC", marginTop: 40 }}>
            {`${MONTHS[request.month - 1]}${total ? `, ${total}` : ""}, confianza ${r.confidence}%`}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 56, fontWeight: 800 }}>Travel Pulse</div>
          <div style={{ fontSize: 36, color: "#8FA3BA", marginTop: 8 }}>Explora ciudades y planifica con datos de referencia</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, headers: { "cache-control": "public, max-age=3600" } },
  );
}
