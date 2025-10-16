// src/lib/missionFormat.ts

export type MissionType = "Deliver" | "Rescue" | "Recover" | "Hunt" | "Escort" | "Unknown" | string;

export type ParsedTags = {
  mission_type: MissionType | null;
  factions: string[];
  stripped: string; // brief without the header line
};

/** Tolerant header parser. */
export function parseMissionHeader(briefRaw: string | null | undefined): ParsedTags {
  const text = (briefRaw ?? "").trim();
  if (!text) return { mission_type: null, factions: [], stripped: "" };

  // Normalize -, – , — to " — "
  const normalized = text.replace(/\s+-\s+|\s+–\s+|\s+—\s+/g, " — ");

  // Strict: Type: X | Factions: A, B — rest
  const strict = normalized.match(/^Type:\s*([^|—]+?)\s*\|\s*Factions:\s*([^—]+?)\s*—\s*(.*)$/i);
  if (strict) {
    const type = strict[1]?.trim() || null;
    const factions = strict[2].split(",").map(s => s.trim()).filter(Boolean);
    const rest = (strict[3] || "").trim();
    return { mission_type: type, factions, stripped: rest };
  }

  // Loose: Type: X — rest
  const loose = normalized.match(/^Type:\s*([^—]+?)\s*—\s*(.*)$/i);
  if (loose) {
    const type = loose[1]?.trim() || null;
    const rest = (loose[2] || "").trim();
    return { mission_type: type, factions: [], stripped: rest };
  }

  return { mission_type: null, factions: [], stripped: text };
}

/** If missing, prepend a strict header so downstream parsing/UI are stable. */
export function ensureHeaderOnBrief(opts: {
  brief: string;
  mission_type?: MissionType | null;
  factions?: string[];
  teaserFallback?: string;
}): string {
  const { brief, mission_type, factions = [], teaserFallback } = opts;
  const parsed = parseMissionHeader(brief);
  if (parsed.mission_type) return brief;

  const type = (mission_type ?? "Deliver").toString();
  const fac = factions.length ? ` | Factions: ${factions.join(", ")}` : "";
  const teaser = teaserFallback || brief.split(/(?<=\.)\s/)[0] || brief.slice(0, 120);

  return `Type: ${type}${fac} — ${teaser}\n${brief}`;
}

/** Put this in LLM prompts to stabilize formatting. */
export const LLM_HEADER_RULE = `
FIRST LINE of each mission MUST be EXACTLY:

Type: <Deliver|Rescue|Recover|Hunt|Escort> | Factions: <comma-separated list> — <one-line teaser>

Use "Type:", then " | ", then "Factions:", then an em dash " — " (U+2014). Example:
Type: Deliver | Factions: The Blessed, English Crown — A broken bell tolls from the marsh.
`.trim();
