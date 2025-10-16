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
[... trimmed for brevity — keep your existing systemPrompt content ...]
`.trim();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function fallbackSeeds(_date: string): SeedRow[] {
  // existing fallback seeds function here unchanged
  // (use your current version — no logic changes)
  return [];
}

// Existing sanitizeSeed, generateWithLLM, etc. unchanged.
// Make sure all `catch (e: any)` are now `catch (e: unknown)`
// and `let debug: any` / `let parsed: any` are now `unknown`.

