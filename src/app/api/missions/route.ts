import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db"; // named export; client instance

export const runtime = "nodejs";

// Extract mission_type + factions if brief starts with: "Type: X | Factions: A, B — rest…"
function parseTags(brief: string | null): { mission_type: string | null; factions: string[]; stripped: string } {
  const text = (brief ?? "").trim();
  const m = text.match(/^Type:\s*([^|—]+?)(?:\s*\|\s*Factions:\s*([^—]+))?\s*—\s*(.*)$/);
  if (!m) return { mission_type: null, factions: [], stripped: text };
  const type = m[1].trim();
  const fac = (m[2] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rest = (m[3] || "").trim();
  return { mission_type: type || null, factions: fac, stripped: rest };
}

/**
 * Returns up to 3 missions for *today* (UTC), sorted by slot.
 * Maps your schema to a UI-friendly shape:
 *   - mission_type & factions parsed from brief tag prefix
 *   - prompt := mission_prompt ?? stripped-brief
 */
export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

    const { data, error } = await supabaseAdmin
      .from("missions")
      .select("id, date, slot, title, brief, objective, mission_prompt, opening")
      .eq("date", today)
      .order("slot", { ascending: true })
      .limit(3);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const mapped = (data ?? []).map((m) => {
      const { mission_type, factions, stripped } = parseTags(m.brief ?? null);
      const prompt = (m as any).mission_prompt ?? stripped ?? null;

      return {
        id: m.id,
        date: m.date,
        slot: m.slot,
        title: m.title,
        objective: m.objective ?? null,
        prompt, // long paragraph first (used by UI)
        mission_type, // parsed
        factions,     // parsed
        displayBrief: stripped || null, // clean teaser if you want it
        // raw fields in case other pages want them
        brief: m.brief ?? null,
        mission_prompt: (m as any).mission_prompt ?? null,
        opening: (m as any).opening ?? null,
      };
    });

    return NextResponse.json(mapped);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
