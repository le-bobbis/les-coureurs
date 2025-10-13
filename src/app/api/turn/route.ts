import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, route: "turn", method: "GET" });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json({ ok: true, route: "turn", method: "POST", echo: body });
}
