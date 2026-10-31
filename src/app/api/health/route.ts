import { NextResponse } from "next/server";
import { budgetStatus, llmEnabled } from "@/lib/ai";

/** GET /api/health — estado para el despliegue. No expone montos de gasto. */
export function GET() {
  return NextResponse.json({
    ok: true,
    data: process.env.SUPABASE_URL ? "supabase" : "demo",
    ai: llmEnabled() ? "anthropic" : "respaldo",
    aiBudgetLevel: budgetStatus().level,
  });
}
