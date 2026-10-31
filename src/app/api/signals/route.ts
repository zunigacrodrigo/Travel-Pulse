import { NextResponse } from "next/server";
import { createSignal } from "@/lib/signals/engine";
import { SIGNAL_TYPES, type CreateSignalInput } from "@/lib/signals/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<CreateSignalInput>;
    if (!body.title || !body.detail || !body.place || !body.city || !body.type || !body.evidence) {
      return NextResponse.json({ ok: false, error: "Faltan campos obligatorios." }, { status: 400 });
    }
    if (!SIGNAL_TYPES.includes(body.type)) return NextResponse.json({ ok: false, error: "Tipo de señal no válido." }, { status: 400 });
    const signal = createSignal(body as CreateSignalInput);
    return NextResponse.json({ ok: true, signal }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "No se pudo crear la señal." }, { status: 400 });
  }
}
