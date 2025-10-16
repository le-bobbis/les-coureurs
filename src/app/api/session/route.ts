import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export const runtime = "nodejs";

type SeedRow = {
  slot: number;
  title: string;
  brief: string;
  objective: string | null;
  mission_prompt: string | null;
  opening: string | null;
};

type SeedInput = Partial<SeedRow> & {
  mission_type?: string | null;
  factions?: string[] | null;
};


function systemPrompt() {
  return `
You are an expert narrative designer for *Les Coureurs*, a survival-horror RPG set in an alternate early-19th-century Europe, ten years after the dead came back to life.

### World Capsule (authoritative)
- 1806: a meteor strike in northern France erased the capital and birthed **La Brume** — a clinging, toxic fog that ebbs and surges with weather and season, bringing the dead back to life.
- The dead (revenants) are born from the Brume: sluggish in cold, bolder in warmth; sound, light, and the scent of blood agitate them.
- Technology: flintlocks and black powder, oil lanterns, rope & pulleys, horse carts; crude alchemy and folk remedies; **no** electricity, radios, or modern jargon.
- Society: fractured polities, customs posts, parishes, guilds, smugglers, militias, petty warlords; travel is rare and dangerous.
- **Les Coureurs**: licensed runners and couriers who brave the wilderness between enclaves to move people, messages, and goods — professionals, not heroes.
- Superstition matters: bells, charms, salt, and lines of twine as warding; fear and rumor travel faster than truth.
- Scarcity rules: powder, oil, rations, clean water, and safe sleep are precious; injuries often mean death.
- Tone: grounded, terse, tactile; dread via atmosphere and consequence, not gore; **never** comedic or quippy.
- Names & places: Western/Central Europe (coastal mists, river valleys, moors, ruined suburbs, quarries, abbeys, redoubts).
- Moral texture: choices cost — escorts slow you, noise draws things, mercy risks time, cruelty buys time.
- Factions complicate runs: church orders, quartermasters, smugglers, rival coureurs, desperate locals, Prussian garrisons, English detachments.

### Style Rules
- Keep prose lean and physical (weather, footing, light, sound, smell).
- No modern slang, no grand heroics, no anachronistic tech.
- Outcomes should be **plausible** for a tired professional with limited kit.
`.trim();
}

function userPrompt(date: string) {
  return `
Return **JSON ONLY** for three distinct missions for date ${date}. Slots must be 1, 2, and 3.

Each mission MUST include:
- slot (1..3)
- mission_type: one of ["Escort","Scout/Recon","Delivery/Run","Retrieval","Evacuation/Rescue","Sabotage/Denial","Negotiation/Parley","Investigation/Trace","Clearance/Route-Opening"]
- factions: 1–2 involved groups chosen from ["Prussian Garrison","English Detachment","Parish Wardens","Church Order","Smugglers","Quartermaster Corps","Local Militia","Rival Coureurs","Desperate Locals"]
- title (<= 80 chars)
- mission_prompt (<= 500 chars) — vivid, scene-setting paragraph the GM reads first (long description).
- objective (<= 160 chars) — blunt, simple goal line (shown second).
- brief (<= 100 chars) — one-line teaser for the home page.
- opening (<= 700 chars) — Turn-0 blurb the player sees when play starts (sensory orientation + stakes).

**Variation knobs across the three**: geography/biome, time of day, weather/Brume intensity, faction pressure, resource scarcity, moral entanglement.

**Hard constraints**
- Period-appropriate kit only (flintlocks, lanterns, rope, mules).
- Lethal but not cartoonish; no power fantasy.
- Do not repeat the same location/setup across all three.
- No hard magic systems; superstition is acceptable.

Output **must** be valid JSON exactly like:
{
  "date": "${date}",
  "missions": [
    { "slot": 1, "mission_type": "...", "factions": ["..."], "title": "...", "mission_prompt": "...", "objective": "...", "brief": "...", "opening": "..." },
    { "slot": 2, ... },
    { "slot": 3, ... }
  ]
}
`.trim();
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

// Encode mission_type & factions into brief prefix so we don't need a schema change.
function taggedBrief(missionType: string, factions: string[], brief: string) {
  const type = missionType.trim();
  const fac = factions.map((f) => f.trim()).filter(Boolean).join(", ");
  const tag = `Type: ${type}${fac ? ` | Factions: ${fac}` : ""}`;
  const body = brief.trim();
  return `${tag} — ${body}`.slice(0, 240);
}

function sanitizeSeed(m: SeedInput | null | undefined, slot: number): SeedRow {
  const title = String(m?.title ?? "").trim().slice(0, 120) || `Mission ${slot}`;
  const missionType = String(m?.mission_type ?? "").trim() || "Scout/Recon";
  const factions = Array.isArray(m?.factions) ? m.factions.slice(0, 2).map(String) : [];
  const briefRaw =
    String(m?.brief ?? m?.mission_prompt ?? "").trim().slice(0, 160) ||
    "A dangerous task awaits in the Brume.";
  const brief = taggedBrief(missionType, factions, briefRaw);
  const objective = (m?.objective ? String(m.objective) : null)?.trim()?.slice(0, 160) || null;
  const mission_prompt = (m?.mission_prompt ? String(m.mission_prompt) : null)
    ?.trim()
    ?.slice(0, 500) || null;
  const opening = (m?.opening ? String(m.opening) : null)?.trim()?.slice(0, 700) || null;

  return { slot, title, brief, objective, mission_prompt, opening };
}

function fallbackSeeds(_date: string): SeedRow[] {
  return [
    sanitizeSeed(
      {
        slot: 1,
        mission_type: "Scout/Recon",
        factions: ["Parish Wardens"],
        title: "Sounding the Quarry",
        mission_prompt:
          "Gray dawn over stepped stone. A bell tolls from below the fog line—too steady to be wind. The wardens want eyes on whatever rings it.",
        objective: "Identify the bell’s source and safest approach.",
        brief: "Strange bell from the quarry, wardens uneasy.",
        opening:
          "Cold mist pools in the pit. The bell keeps time like a slowed heart. Ropes creak. Your oil is low; your breath shows. Find the ringer before the Brume wakes.",
      },
      1
    ),
    sanitizeSeed(
      {
        slot: 2,
        mission_type: "Escort",
        factions: ["Quartermaster Corps", "Local Militia"],
        title: "Supply Line to the South Gate",
        mission_prompt:
          "Three wagons, two skittish mules, one road swallowed by white. The quartermaster promises powder if you keep them moving.",
        objective: "Bring the caravan to the south gate with supplies intact.",
        brief: "Powder wagons through thick Brume.",
        opening:
          "Canvas snaps like whispers. Shapes move in the hedgerows. The caravan master waits on your signal. You lead; they follow. Try not to stop.",
      },
      2
    ),
    sanitizeSeed(
      {
        slot: 3,
        mission_type: "Retrieval",
        factions: ["Church Order"],
        title: "The Ledger in the Ruined Chapel",
        mission_prompt:
          "The chapel’s bones jut from the moor. An order scribe fled inside with a ledger others will kill to keep hidden—or to read.",
        objective: "Recover the ledger and return unseen.",
        brief: "A ledger lost in a gutted nave.",
        opening:
          "Wind presses the doors until they groan like sleepers. Dust hangs in your lamp’s halo. Something in the dark shifts when the bell in town falls silent.",
      },
      3
    ),
  ];
}

async function generateWithLLM(date: string) {
  const key = (process.env.OPENAI_API_KEY || "").trim();
  if (!key) {
    return { seeds: fallbackSeeds(date), debug: { source: "static", reason: "missing_openai_key" as const } };
  }

  let status = 0;
  let raw = "";
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 1100,
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: userPrompt(date) },
        ],
      }),
    });
    status = r.status;
    raw = await r.text();

    if (!r.ok) {
      return {
        seeds: fallbackSeeds(date),
        debug: { source: "static", reason: "openai_http_error", status, error: raw.slice(0, 300) },
      };
    }

    const j = JSON.parse(raw);
    const content = j?.choices?.[0]?.message?.content?.trim() ?? "";

    // Try parse JSON payload from content
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    const missions = Array.isArray(parsed?.missions) ? parsed.missions : [];
    if (!missions.length) {
      return {
        seeds: fallbackSeeds(date),
        debug: { source: "static", reason: "llm_empty_or_nonjson", preview: content.slice(0, 300) },
      };
    }

    const bySlot: Record<number, SeedRow> = {};
    for (const m of missions) {
      const slot = Number(m?.slot);
      if (![1, 2, 3].includes(slot)) continue;
      bySlot[slot] = sanitizeSeed(m, slot);
    }
    const fall = fallbackSeeds(date);
    const seeds = ([1, 2, 3] as const).map((s) => bySlot[s] || fall[s - 1]);

    return { seeds, debug: { source: "llm", status } };
  } catch (e: unknown) {
    return {
      seeds: fallbackSeeds(date),
      debug: { source: "static", reason: "exception", error: String(e).slice(0, 300), rawPreview: raw.slice(0, 300), status },
    };
  }
}

/**
 * POST /api/seed
 * Body (optional): { mode?: "llm" | "static" }
 * - mode: "llm" (default) tries LLM first; on any issue, falls back and returns a debug reason.
 * - mode: "static" forces static seeds.
 * Also supports query string ?mode=llm|static as a convenience.
 */
export async function POST(req: Request) {
  try {
    const today = todayUTC();

    // Accept mode from body OR query (?mode=llm|static)
    const url = new URL(req.url);
    const qsMode = url.searchParams.get("mode");
    let mode: "llm" | "static" = qsMode === "static" ? "static" : "llm";
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.mode === "static") mode = "static";
      if (body?.mode === "llm") mode = "llm";
    } catch {}

    let seeds: SeedRow[] = [];
    let debug: unknown = null;

    if (mode === "static") {
      seeds = fallbackSeeds(today);
      debug = { source: "static", reason: "forced_static_mode" };
    } else {
      const r = await generateWithLLM(today);
      seeds = r.seeds;
      debug = r.debug;
    }

    const results: Array<{ slot: number; op: "updated" | "inserted"; id?: string }> = [];

    for (const s of seeds) {
      const { data: updData, error: updErr } = await supabaseAdmin
        .from("missions")
        .update({
          title: s.title,
          brief: s.brief,
          objective: s.objective,
          mission_prompt: s.mission_prompt,
          opening: s.opening,
        })
        .eq("date", today)
        .eq("slot", s.slot)
        .select("id");

      if (updErr) {
        return NextResponse.json(
          { ok: false, error: `Update slot ${s.slot}: ${updErr.message}` },
          { status: 500 }
        );
      }

      if (updData && updData.length > 0) {
        results.push({ slot: s.slot, op: "updated", id: updData[0]?.id });
        continue;
      }

      const { data: insData, error: insErr } = await supabaseAdmin
        .from("missions")
        .insert({
          date: today,
          slot: s.slot,
          title: s.title,
          brief: s.brief,
          objective: s.objective,
          mission_prompt: s.mission_prompt,
          opening: s.opening,
        })
        .select("id")
        .single();

      if (insErr) {
        return NextResponse.json(
          { ok: false, error: `Insert slot ${s.slot}: ${insErr.message}` },
          { status: 500 }
        );
      }

      results.push({ slot: s.slot, op: "inserted", id: insData?.id });
    }

    return NextResponse.json({
      ok: true,
      date: today,
      mode_requested: mode,
      mode_used: debug?.source === "llm" ? "llm" : "static",
      llm_debug: debug,
      count: results.length,
      results,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "seed", method: "GET" });
}
