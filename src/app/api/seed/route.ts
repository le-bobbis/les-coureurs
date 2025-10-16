// src/app/api/seed/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  ensureHeaderOnBrief,
  LLM_HEADER_RULE,
  parseMissionHeader,
} from "@/lib/missionFormat";
import { todayLocal } from "@/lib/today";
import type { MissionRow, LlmResponse, LlmMission } from "@/types/db";

const OPENAI_MODEL = process.env.OPENAI_MISSIONS_MODEL || "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/** Set MISSIONS_SLOT_BASE=0 if your DB uses 0..2; default is 1..3 */
const SLOT_BASE = Number(process.env.MISSIONS_SLOT_BASE ?? 1);

type UpsertMission = Pick<
  MissionRow,
  "date" | "slot" | "title" | "brief" | "objective" | "opening" | "mission_type"
> & { mission_prompt: string | null };

const STATIC_MISSIONS: Array<{
  title: string;
  mission_type: string;
  factions: string[];
  brief: string;
  objective: string;
  opening: string;
}> = [
  {
    title: "The Drowned Toll",
    mission_type: "Deliver",
    factions: ["The Blessed", "English Crown"],
    brief: "The bell tower rises from black water; ferrymen refuse the crossing after dusk.",
    objective: "Deliver a sealed reliquary to the watch at Marivaux before nightfall.",
    opening:
      "Rain needles the marsh. The drowned church leans, its bell coughing through fog. The reliquary is cold in your satchel.",
  },
  {
    title: "Blue Light at the Frontier",
    mission_type: "Recover",
    factions: ["Prussian League"],
    brief: "A patrol abandoned an experimental coil near La Frontière. Locals say it hums at night.",
    objective: "Recover the coil intact and return it to the broker at La Frontière.",
    opening:
      "Wind combs the plains. Faint blue glows along the palisade, steady as a heartbeat. A map inked with grease stains guides you east.",
  },
  {
    title: "The Missing Apprentice",
    mission_type: "Rescue",
    factions: [],
    brief: "A surgeon’s apprentice left at dawn toward Calais and never arrived.",
    objective: "Find the apprentice or proof of death. Return any satchel.",
    opening:
      "Roadside ditches swell with meltwater. Crows worry at a bundle in the reeds. Your boots pull at the mud.",
  },
];

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "llm"; // "llm" | "static"

    const sb = supabaseServer();
    const date = todayLocal();

    let rows: UpsertMission[] = [];

    if (mode === "static") {
      rows = STATIC_MISSIONS.map<UpsertMission>((m, idx) => {
        const brief = ensureHeaderOnBrief({
          brief: m.brief,
          mission_type: m.mission_type,
          factions: m.factions,
          teaserFallback: m.brief,
        });
        const derivedType =
          parseMissionHeader(brief).mission_type ?? m.mission_type ?? "Unknown";

        return {
          date,
          slot: SLOT_BASE + idx, // 1,2,3 (or 0,1,2)
          title: m.title,
          brief,
          objective: m.objective,
          mission_prompt: null,
          opening: m.opening,
          mission_type: derivedType,
        };
      });
    } else {
      // ---- LLM generation path (UPSERT; no deletes) ----
      if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");

      const system = [
        "You are the Mission Generator for LES COUREURS — alternate 19th-century Europe ravaged by La Brume.",
        "Tone: grounded, spare, present-tense. Avoid modern idiom and flourish.",
        "Produce EXACTLY three missions.",
        "Each mission must include: title, brief, objective (<= 20 words), opening (<= 80 words).",
        "Brief MUST begin with the exact header format below.",
        LLM_HEADER_RULE,
        "",
        "World snapshot:",
        "- Factions: Prussian League (blue light, technocrats); English Crown (clerical, isolation); The Blessed (bell-marked dead); Lost Nobles (seek the Core).",
        "- Contracts: Deliver, Rescue, Recover, Hunt, Escort.",
        "- Evocative locales: Marivaux, Drowned Church, La Frontière, Saint-Étienne, Silent Fields, Vallon-Noir.",
      ].join("\n");

      const user = [
        "Generate three varied missions.",
        "Respect season/weather texture. Keep openings playable and specific.",
        "Output JSON ONLY:",
        `{
  "missions": [
    {"title":"...","brief":"(MUST start with required header)","objective":"(<=20w)","opening":"(<=80w)"},
    {"title":"...","brief":"...","objective":"...","opening":"..."},
    {"title":"...","brief":"...","objective":"...","opening":"..."}
  ]
}`,
      ].join("\n");

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          temperature: 0.7,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });

      if (!openaiRes.ok) {
        const txt = await openaiRes.text();
        throw new Error(`OpenAI error: ${openaiRes.status} ${txt}`);
      }

      const json = (await openaiRes.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content ?? "{}";

      let parsed: LlmResponse;
      try {
        parsed = JSON.parse(content) as LlmResponse;
      } catch {
        throw new Error("Failed to parse JSON from LLM");
      }

      const normalized = (parsed.missions ?? [])
        .filter((m): m is LlmMission => !!m && typeof m.title === "string")
        .slice(0, 3)
        .map<UpsertMission>((m, idx) => {
          const title = String(m.title || "").trim();
          const rawBrief = String(m.brief || "").trim();
          const objective = String(m.objective || "").trim().slice(0, 200);
          const opening = String(m.opening || "").trim().slice(0, 500);

          const brief = ensureHeaderOnBrief({
            brief: rawBrief,
            teaserFallback: rawBrief,
          });

          const mission_type = parseMissionHeader(brief).mission_type ?? "Unknown";

          return {
            date,
            slot: SLOT_BASE + idx, // 1,2,3 (or 0,1,2)
            title,
            brief,
            objective,
            mission_prompt: null,
            opening,
            mission_type,
          };
        });

      // Pad if < 3
      while (normalized.length < 3) {
        const s = STATIC_MISSIONS[normalized.length];
        const brief = ensureHeaderOnBrief({
          brief: s.brief,
          mission_type: s.mission_type,
          factions: s.factions,
          teaserFallback: s.brief,
        });
        normalized.push({
          date,
          slot: SLOT_BASE + normalized.length,
          title: s.title,
          brief,
          objective: s.objective,
          mission_prompt: null,
          opening: s.opening,
          mission_type: parseMissionHeader(brief).mission_type ?? "Unknown",
        });
      }

      rows = normalized;
      // ---- end LLM path ----
    }

    // UPSERT by (date, slot) to keep IDs stable; avoids FK issues with sessions
    const { data, error } = await sb
      .from("missions")
      .upsert(rows, { onConflict: "date,slot", ignoreDuplicates: false })
      .select("*");

    if (error) throw error;

    return NextResponse.json(
      { ok: true, upserted: data?.length ?? 0, missions: data },
      { status: 200 }
    );
  } catch (e) {
    console.error("[/api/seed] POST failed:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
