import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, route: "seed", method: "GET" });
}

export async function POST() {
  return NextResponse.json({ ok: true, route: "seed", method: "POST" });
}
