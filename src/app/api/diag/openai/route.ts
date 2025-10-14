// src/app/api/diag/openai/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function GET() {
  try {
    const prompt = `Return a random UUID v4 and today's UTC timestamp.
Output on one line: <uuid> | <iso-utc>. No extra words.`;

    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Be terse. Follow instructions exactly." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 40,
    });

    const text = r.choices?.[0]?.message?.content?.trim() || "";
    return NextResponse.json({
      ok: true,
      model: r.model || "unknown",
      text,
      usage: r.usage ?? null,
    });
  } catch (e: unknown) {
    // No 'any' — safe, explicit typing
    const message = e instanceof Error ? e.message : String(e);
    const status =
      typeof (e as { status?: number })?.status === "number"
        ? (e as { status?: number }).status
        : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
