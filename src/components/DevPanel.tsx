"use client";
import { useState } from "react";

export type CheckResult = {
  name: string;
  dc: number;
  parts: { d20: number; stat: number; item: number; situational: number };
  total: number;
  result: "critical" | "success" | "mixed" | "fail";
};

export type TurnDebug = {
  seed: string;
  rolls: number[];
  checks: CheckResult[];
  itemsUsed: Array<{ id?: string; name: string; effect?: string; consumed?: boolean; damaged?: boolean }>;
  stateDelta: Record<string, unknown>;
};

export default function DevPanel({ debug }: { debug: TurnDebug }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-white/15 bg-white/5">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left px-3 py-2 text-xs uppercase tracking-wide text-white/80 hover:text-white"
      >
        {open ? "▼" : "▶"} Dev Panel
      </button>
      {open && (
        <div className="px-3 pb-3 text-sm text-white/90 space-y-2">
          <div><span className="text-white/60">Seed:</span> <code className="font-mono">{debug.seed}</code></div>
          <div><span className="text-white/60">Rolls:</span> {debug.rolls.join(", ")}</div>
          {debug.checks?.map((c, i) => (
            <div key={i} className="rounded border border-white/10 p-2">
              <div className="font-semibold">{c.name} — {c.result.toUpperCase()}</div>
              <div className="text-white/70">DC {c.dc} | total {c.total}</div>
              <div className="font-mono text-xs">
                d20={c.parts.d20} stat={c.parts.stat} item={c.parts.item} situ={c.parts.situational}
              </div>
            </div>
          ))}
          {debug.itemsUsed?.length ? (
            <div>
              <div className="text-white/60">Items used:</div>
              <ul className="list-disc pl-5">
                {debug.itemsUsed.map((it, i) => <li key={i}>{it.name}</li>)}
              </ul>
            </div>
          ) : null}
          <details className="text-white/80">
            <summary className="cursor-pointer">stateDelta</summary>
            <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(debug.stateDelta, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
