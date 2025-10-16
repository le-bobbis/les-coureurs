// src/app/api/missions/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { parseMissionHeader } from "@/lib/missionFormat";
import { todayLocal } from "@/lib/today";
import type { MissionRow, MissionDTO } from "@/types/db";

// GET /api/missions
export async function GET() {
  try {
    const sb = supabaseServer();
    const missionDate = todayLocal();

    // Keep builder filterable (no `.returns<T>()` here)
    const { data, error } = await sb
      .from("missions")
      .select("*")
      .eq("date", missionDate)
      .order("slot", { ascending: true });

    if (error) throw error;

    const rows = (data ?? []) as MissionRow[];

    const missions: MissionDTO[] = rows.map((m) => {
      // Your helper: pulls [MissionType] and [Factions] tags out of the text, etc.
      const parsed = parseMissionHeader(m.brief ?? "");
      const mission_type =
        m.mission_type ?? parsed.mission_type ?? "Unknown";

      return {
        id: m.id,
        slot: m.slot,
        title: m.title,
        brief: m.brief,
        displayBrief: parsed.stripped || m.brief, // keep your UI-friendly brief if you use it
        objective: m.objective,
        opening: m.opening,
        mission_type,
        factionsText: parsed.factions.length ? parsed.factions.join(" • ") : null,
        date: m.date,
        created_at: m.created_at,
      };
    });

    return NextResponse.json({ missions, count: missions.length });
  } catch (e) {
    console.error("[/api/missions] GET failed:", e);
    return NextResponse.json(
      { missions: [], error: true, message: "Failed to load missions" },
      { status: 200 }
    );
  }
}
