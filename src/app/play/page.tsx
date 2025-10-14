"use client";
import { useEffect, useState } from "react";

type TurnLog = { narrative: string };

function getErrMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown error";
  }
}

async function parseJsonOrText(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return await res.json();
  }
  const txt = await res.text();
  throw new Error(
    `Non-JSON response (${res.status} ${res.statusText}). First 120 chars:\n` +
      txt.slice(0, 120)
  );
}

export default function PlayPage() {
  const [sessionId, setSessionId] = useState<string>("");
  const [input, setInput] = useState<string>("");
  const [log, setLog] = useState<TurnLog[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const s = new URL(window.location.href).searchParams.get("session");
    if (s) setSessionId(s);
  }, []);

  async function createSession() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/session", { method: "POST" });
      const data = await parseJsonOrText(res);
      if (!res.ok) throw new Error((data && data.error) || "Failed to create session");
      const id: string = data.sessionId;
      setSessionId(id);
      history.replaceState(null, "", `?session=${id}`);
    } catch (e: unknown) {
      setErr(getErrMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!sessionId || !input) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, playerInput: input.slice(0, 50) }),
      });
      const data = await parseJsonOrText(res);
      if (!res.ok) throw new Error((data && data.error) || "API error");
      if (data?.narrative) setLog((prev) => [...prev, { narrative: data.narrative }]);
      setInput("");
    } catch (e: unknown) {
      setErr(getErrMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4 text-white">
      <h1 className="text-2xl font-bold mb-3">Play Session</h1>

      <div className="flex gap-2 mb-2">
        <input
          className="flex-1 rounded border border-white/20 bg-black/40 p-2"
          placeholder="Session ID (or click Create)"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        />
        <button
          onClick={createSession}
          className="rounded border border-white/20 px-3"
          disabled={busy}
        >
          {busy ? "…" : "Create"}
        </button>
      </div>

      {err && <p className="mb-3 text-red-400 whitespace-pre-wrap">{err}</p>}

      <div className="space-y-3 mb-4">
        {log.map((t, i) => (
          <div key={i} className="rounded border border-white/20 p-3 whitespace-pre-wrap">
            {t.narrative}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-white/20 bg-black/40 p-2"
          placeholder="Enter action (≤ 50 chars)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={50}
        />
        <button
          onClick={send}
          className="rounded border border-white/20 px-3"
          disabled={busy || !sessionId}
        >
          Send
        </button>
      </div>
    </main>
  );
}
