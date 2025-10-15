import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db"; // named export; client instance

export const runtime = "nodejs";

type SeedRow = {
  slot: number;
  title: string;
  brief: string;                 // NOT NULL
  objective: string | null;
  mission_prompt: string | null;
  opening: string | null;        // Turn-0 text
};

type LlmResponse = {
  date: string;                  // YYYY-MM-DD
  missions: Array<{
    slot: number;                // 1..3
    title: string;
    brief: string;
    objective?: string | null;
    mission_prompt?: string | null;
    opening?: string | null;
  }>;
};

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function fallbackSeeds(date: string): SeedRow[] {
  return [
    {
      slot: 1,
      title: "Scout the Quarry",
      brief: "Bells echo from the pit; metal on stone carries through the fog.",
      objective: "Locate the source of the bell.",
      mission_prompt:
        "A quarry north of town has gone quiet. Survey the pit, avoid lights, and identify the bell ringer.",
      opening:
        "Gray dawn over the quarry. Cold mist hangs above stepped walls, and a bell tolls from somewhere below—too slow, too steady to be wind. Your oil is low. Your nerves, lower. Find the ringer, if you can, and live long enough to tell it.",
    },
    {
      slot: 2,
      title: "Escort the Caravan",
      brief: "Fog-choked lane; unseen hands brush wagon canvas as you pass.",
      objective: "Reach the south gate with supplies intact.",
      mission_prompt:
        "Merchants begged passage through the brume. Keep them moving, no heroics if things sour.",
      opening:
        "Three wagons. Two skittish mules. One road swallowed by white. Shapes gather in the hedgerows—quiet as moths, hungry as wolves. The caravan master watches you, waiting for the word. You lead. They follow. Try not to stop.",
    },
    {
      slot: 3,
      title: "Recover the Ledger",
      brief: "A scribe fled into the chapel ruins clutching a leather ledger.",
      objective: "Retrieve the ledger and return unseen.",
      mission_prompt:
        "Find the scribe’s ledger in the ruined chapel; avoid contact—contents are sensitive.",
      opening:
        "The chapel’s bones jut from the moor, windows black as sockets. Somewhere inside lies a ledger people will kill to keep hidden—or to read. Your breath fogs the doorway. The floor groans. Something else groans back.",
    },
  ];
}

function sanitizeSeed(m: any, slot: number): SeedRow {
  const title = String(m?.title ?? "").trim().slice(0, 120) || `Mission ${slot}`;
  const brief =
    String(m?.brief ?? m?.mission_prompt ?? "").trim().slice(0, 240) ||
    "A dangerous task awaits in the brume.";
  const objective = (m?.objective ? String(m.objective) : null)?.trim()?.slice(0, 160) || null;
  const mission_prompt = (m?.mission_prompt ? String(m.mission_prompt) : null)
    ?.trim()
    ?.slice(0, 500) || null;
  const opening = (m?.opening ? String(m.opening) : null)?.trim()?.slice(0, 700) || null;

  return { slot, title, brief, objective, mission_prompt, opening };
}

async function generateWithLLM(date: string): Promise<SeedRow[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallbackSeeds(date);

  // Ask for ALL THREE missions in one shot to keep it cheap/consistent.
 const system = `
You are an expert narrative designer for *Les Coureurs*, a survival-horror RPG set in an alternate early-19th-century Europe, ten years after the dead returned.

### World Capsule (authoritative)
- 1806: a meteor strike in northern France erased the capital and birthed **La Brume** — a clinging, toxic fog that ebbs and surges with weather and season.
- The dead (revenants) stir in the Brume: sluggish in cold, bolder in warmth; sound, light, and blood agitate them.
- Technology: flintlocks and black powder, oil lanterns, rope & pulleys, horse carts; crude alchemy and folk remedies; **no** electricity, radios, or modern jargon.
- Society: fractured polities, customs posts, parishes, guilds, smugglers, militias, petty warlords; travel is rare and dangerous.
- **Les Coureurs**: licensed runners and couriers who brave the Brume to move people, messages, and goods — professionals, not heroes.
- Superstition matters: bells, charms, salt, and lines of twine as warding; fear and rumor travel faster than truth.
- Scarcity rules: powder, oil, rations, clean water, and safe sleep are precious; injuries often mean death.
- Tone: grounded, terse, tactile; dread via atmosphere and consequence, not gore; **never** comedic or quippy.
- Names & places: Western/Central Europe (coastal mists, river valleys, moors, ruined suburbs, quarries, abbeys, redoubts).
- Moral texture: choices cost — escorts slow you, noise draws things, mercy risks time, cruelty buys time.
- Factions complicate runs: church orders, quartermasters, smugglers, rival coureurs, desperate locals.
- Bells: warning, luring, signaling; distant tolls are ominous, not decorative.

### Style Rules
- Keep prose lean and physical (weather, footing, light, sound, smell).
- No modern slang, no grand heroics, no anachronistic tech.
- Outcomes should be **plausible** for a tired professional with limited kit.
`.trim();

const user = (date: string) => `
Return **JSON ONLY** for three distinct missions for date ${date}. Slots must be 1, 2, and 3.

Each mission MUST include:
- slot (1..3)
- title (<= 80 chars)
- mission_prompt (<= 500 chars) — a vivid, scene-setting paragraph the GM reads first (long description).
- objective (<= 160 chars) — a blunt, simple goal line (shown second).
- brief (<= 100 chars, optional) — tagline/teaser the home page can show.
- opening (<= 700 chars) — the Turn-0 blurb a player sees when play starts (focus on immediate sensory orientation and stakes).

**Variation knobs to rotate across the three**: geography/biome, time of day, weather/Brume intensity, faction pressure, resource scarcity, moral entanglement.

**Hard constraints**
- Use only period-appropriate kit (flintlocks, lanterns, rope, mules).
- Keep danger lethal but not cartoonish; no power fantasy.
- Avoid repeating the same location/setup across all three.
- Do not invent hard magic systems; superstition is fine.
- Output must be valid JSON matching this schema:
{
  "date": "${date}",
  "missions": [
    { "slot": 1, "title": "...", "mission_prompt": "...", "objective": "...", "brief": "...", "opening": "..." },
    { "slot": 2, ... },
    { "slot": 3, ... }
  ]
}
`.trim();

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 900,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    const j = await r.json();
    const content = j?.choices?.[0]?.message?.content?.trim() ?? "";

    // Try parse as JSON; if it contains surrounding text, try to extract the JSON substring.
    let parsed: LlmResponse | null = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    if (!parsed || !Array.isArray(parsed.missions)) return fallbackSeeds(date);

    // Sanitize and coerce each mission to our SeedRow
    const bySlot: Record<number, SeedRow> = {};
    for (const m of parsed.missions) {
      const slot = Number(m?.slot);
      if (![1, 2, 3].includes(slot)) continue;
      bySlot[slot] = sanitizeSeed(m, slot);
    }
    return ([1, 2, 3] as const).map((s) => bySlot[s] || fallbackSeeds(date)[s - 1]);
  } catch {
    return fallbackSeeds(date);
  }
}

/**
 * POST /api/seed
 * Body: { mode?: "llm" | "static" }
 * - "llm" → uses OpenAI to generate missions; falls back to static seeds on error/no key.
 * - "static" → always uses static seeds.
 * For each slot 1..3: UPDATE if a row exists for (date, slot), else INSERT.
 * No deletes → safe with FK sessions.mission_id.
 */
export async function POST(req: Request) {
  try {
    const today = todayUTC();
    let mode: "llm" | "static" = "llm";
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.mode === "static") mode = "static";
    } catch {
      // ignore body parse errors, default to llm
    }

    const seeds: SeedRow[] =
      mode === "llm" ? await generateWithLLM(today) : fallbackSeeds(today);

    const results: Array<{ slot: number; op: "updated" | "inserted"; id?: string }> = [];

    for (const s of seeds) {
      // Try UPDATE (date+slot)
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

      // INSERT fresh
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
      mode,
      count: results.length,
      results,
      note:
        mode === "llm"
          ? "Generated via LLM (fallback-safe)."
          : "Static seeds inserted.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

// Optional GET ping
export async function GET() {
  return NextResponse.json({ ok: true, route: "seed", method: "GET" });
}
