// src/app/api/session/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const missionId: string | undefined = body?.missionId;
    if (!missionId) {
      return NextResponse.json({ error: "missionId required" }, { status: 400 });
    }

    // Load mission (snapshot the important fields)
    const { data: mission, error: mErr } = await supabaseAdmin
      .from("missions")
      .select("id, title, brief, objective, mission_prompt, opening, date, slot")
      .eq("id", missionId)
      .single();
    if (mErr || !mission) {
      return NextResponse.json({ error: mErr?.message || "mission not found" }, { status: 404 });
    }

    const userId = randomUUID(); // temp until Phase 7 auth

    // Create session with a mission snapshot in state
    const missionSnapshot = {
      id: mission.id,
      title: mission.title,
      brief: mission.brief,
      objective: mission.objective,
      prompt: mission.mission_prompt,
      date: mission.date,
      slot: mission.slot,
    };

    const { data: created, error: sErr } = await supabaseAdmin
      .from("sessions")
      .insert([{
        mission_id: mission.id,
        user_id: userId,
        actions_remaining: 10,
        state: { mission: missionSnapshot },
      }])
      .select("id, actions_remaining")
      .single();
    if (sErr || !created) {
      return NextResponse.json({ error: sErr?.message || "session create failed" }, { status: 500 });
    }

    const sessionId = created.id;

    // Optional: Turn 0 intro (does NOT consume action)
    if (mission.opening && mission.opening.trim().length > 0) {
      await supabaseAdmin.from("turns").insert([{
        session_id: sessionId,
        idx: 0,
        player_input: "(mission start)",
        narrative:
`${mission.opening.trim()}

---
**Summary**
- Mission: ${mission.title}
- Objective: ${mission.objective ?? "—"}
- Scene set. Await your first action.
- **Actions remaining:** ${created.actions_remaining}`,
        summary: JSON.stringify([
          `Mission: ${mission.title}`,
          `Objective: ${mission.objective ?? "—"}`,
          "Scene set",
        ]),
        debug: { intro: true, mission: missionSnapshot },
      }]);
    }

    return NextResponse.json({ ok: true, sessionId });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
