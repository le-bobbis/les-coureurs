"use client";

type Mission = {
  id: string;
  slot: number;
  title: string;
  brief: string;
  displayBrief?: string;
  objective?: string | null;
  mission_type?: string | null;  // from DB (with API fallback to parsed)
  factionsText?: string | null;  // still derived
};

export function MissionCard({ mission }: { mission: Mission }) {
  const typeLabel = mission.mission_type ?? "Unknown";
  const factions = mission.factionsText ?? "—";
  const teaser = mission.displayBrief?.trim() || mission.brief;

  return (
    <div className="rounded-2xl border border-zinc-800 p-4 bg-zinc-950/50 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide opacity-80">{typeLabel}</span>
        <span className="text-xs opacity-60">Slot {mission.slot}</span>
      </div>

      <h3 className="text-lg font-semibold mb-1">{mission.title}</h3>
      <p className="text-sm opacity-90 line-clamp-3">{teaser}</p>

      <div className="mt-3 text-xs opacity-70">
        <div><span className="opacity-60">Factions:</span> {factions}</div>
        {mission.objective ? (
          <div className="mt-1">
            <span className="opacity-60">Objective:</span> {mission.objective}
          </div>
        ) : null}
      </div>
    </div>
  );
}
