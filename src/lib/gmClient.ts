// src/lib/gmClient.ts
import type { GmTurnOutput } from "@/lib/gmSchemas";

export async function gmStart(input: any): Promise<GmTurnOutput> {
  const res = await fetch("/api/gm/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return (await res.json()) as GmTurnOutput;
}

export async function gmTurn(input: any): Promise<GmTurnOutput> {
  const res = await fetch("/api/gm/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return (await res.json()) as GmTurnOutput;
}
