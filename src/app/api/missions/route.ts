import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseMissionHeader } from "@/lib/missionFormat";
import { todayLocal } from "@/lib/today";

type DbMission = {
  id: string;
  date: string;          // <-- matches DB
  slot: number;          // 1,2,3 (or 0,1,2 if that's your choice)
  title: string;
  brief: string;
  objective: string | null;
  opening: string | null;
  mission_type: string | null; // persisted column (we still fallback from header)
  created_at: string;
};

export async function GET() {
  try {
    const sb = supabaseServer();
    const missionDate = todayLocal(); // e.g., America/Los_Angeles unless DAILY_TZ is set

    const { data, error } = await sb
      .from<DbMission>("missions")
      .select("*")
      .eq("date", missionDate)         // <-- critical fix here
      .order("slot", { ascending: true });

    if (error) throw error;

    const missions = (data ?? []).map((m) => {
      const parsed = parseMissionHeader(m.brief ?? "");
      const mission_type = m.mission_type ?? parsed.mission_type ?? "Unknown";

      return {
        id: m.id,
        slot: m.slot,
        title: m.title,
        brief: m.brief,
        displayBrief: parsed.stripped || m.brief,      // teaser text for the card
        objective: m.objective,
        opening: m.opening,
        mission_type,                                   // from DB, with fallback
        factionsText: parsed.factions.length ? parsed.factions.join(" • ") : null, // derived only
        date: m.date,
        created_at: m.created_at,
      };
    });

    return NextResponse.json({ missions, count: missions.length });
  } catch (e: any) {
    console.error("[/api/missions] GET failed:", e);
    return NextResponse.json(
      { missions: [], error: true, message: String(e?.message || e) },
      { status: 200 }
    );
  }
}
