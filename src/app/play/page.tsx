"use client";
import { useEffect, useState } from "react";

export default function PlayPage() {
  const [sessionId, setSessionId] = useState("");
  const [input, setInput] = useState("");
  const [log, setLog] = useState<Array<{ narrative: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const s = new URL(window.location.href).searchParams.get("session");
    if (s) setSessionId(s);
  }, []);

  async function createSession() {
    setErr(null); setBusy(true);
    try {
      const res = await fetch("/api/session", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create session");
      setSessionId(data.sessionId);
      history.replaceState(null, "", `?session=${data.sessionId}`); // keep it in URL
    } catch (e: any) {
      setErr(e.message || "Error creating session");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!sessionId || !input) return;
    setErr(null); setBusy(true);
    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, playerInput: input.slice(0, 50) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "API error");
      if (data?.narrative) setLog(prev => [...prev, { narrative: data.narrative }]);
      setInput("");
    } catch (e: any) {
      setErr(e.message || "Error sending turn");
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
          onChange={e => setSessionId(e.target.value)}
        />
        <button
          onClick={createSession}
          className="rounded border border-white/20 px-3"
          disabled={busy}
        >
          {busy ? "…" : "Create"}
        </button>
      </div>

      {err && <p className="mb-3 text-red-400">{err}</p>}

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
          onChange={e => setInput(e.target.value)}
          maxLength={50}
        />
        <button onClick={send} className="rounded border border-white/20 px-3" disabled={busy || !sessionId}>
          Send
        </button>
      </div>
    </main>
  );
}
