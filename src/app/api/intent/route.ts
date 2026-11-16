import { NextResponse } from "next/server";
import { z } from "zod";
import { llmEnabled } from "@/lib/ai";
import { describeIntent, interpretDayIntent } from "@/lib/director/intent";
import { apiError, engineNow, limitOr429, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const bodySchema = z.object({ text: z.string().trim().min(3, "Escribe al menos unas palabras.").max(500, "Usa hasta 500 caracteres.") }).strict();

/**
 * POST /api/intent — entiende una frase libre y devuelve los datos del formulario de «Mi día».
 * No arma el día ni guarda nada: la persona revisa lo que se entendió y confirma.
 */
export async function POST(req: Request) {
  const limited = limitOr429(req, "intent", 30);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError(400, "PETICION_INVALIDA", parsed.error.issues[0]?.message ?? "Revisa el texto.");
  try {
    const result = await interpretDayIntent(parsed.data.text, engineNow());
    return NextResponse.json({
      ...result,
      understood: describeIntent(result.intent),
      /** Si la IA estaba disponible para esta consulta; sin ella se entienden frases simples por reglas. */
      aiMode: llmEnabled("nonEssential") ? "disponible" : "sin_ia",
    });
  } catch (e) {
    console.error("intent_failed", e);
    return apiError(500, "ERROR_INTERNO", "No pudimos entender la frase. Puedes llenar el formulario a mano.");
  }
}
