// src/app/page.tsx
import { MissionCard } from "@/components/MissionCard";
import { DevSeedButton } from "@/components/DevSeedButton";
import { headers } from "next/headers";
import type { MissionDTO } from "@/types/db";

function getBaseUrl() {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${proto}://${host}`;
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

async function fetchMissions(): Promise<MissionDTO[]> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/missions`, { cache: "no-store", next: { revalidate: 0 } });
  if (!res.ok) return [];
  const json = (await res.json()) as { missions: MissionDTO[] };
  return json.missions ?? [];
}

export default async function HomePage() {
  const missions = await fetchMissions();

  return (
    <main className="max-w-xl mx-auto p-4 space-y-4">
      <header className="mb-2">
        <h1 className="text-2xl font-bold">Les Coureurs — Daily Missions</h1>
        <p className="text-sm opacity-70">All players see the same three. Outcomes diverge in play.</p>
      </header>

      <DevSeedButton />

      {missions.length === 0 ? (
        <div className="text-sm opacity-80 border border-zinc-800 rounded-xl p-4">
          No missions available for today yet.
        </div>
      ) : null}

      <div className="grid gap-3">
        {missions
          .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
          .map((m) => (
            <MissionCard key={m.id} mission={m} />
          ))}
      </div>
    </main>
  );
}
