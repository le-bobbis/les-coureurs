'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import { createSessionForCurrentUser } from '@/lib/sessions';

export default function StartMissionPage() {
  const router = useRouter();
  const [missionId, setMissionId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleStart() {
    setMsg(null);
    setBusy(true);
    try {
      if (!missionId) throw new Error('Enter a valid mission id');
      const sessionId = await createSessionForCurrentUser(missionId);
      setMsg(`✅ Session created: ${sessionId}`);
      // router.push(`/play/${sessionId}`)
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequireAuth>
      <div className="max-w-sm mx-auto mt-24 flex flex-col gap-3 text-center">
        <h1 className="text-2xl font-bold">Start Mission</h1>
        <input
          className="border p-2 rounded text-black"
          placeholder="Mission ID (real UUID)"
          value={missionId}
          onChange={(e) => setMissionId(e.target.value)}
        />
        <button
          onClick={handleStart}
          disabled={busy}
          className="bg-white text-black p-2 rounded disabled:opacity-50"
        >
          {busy ? 'Starting…' : 'Start'}
        </button>
        {msg && <p className="text-sm mt-1">{msg}</p>}
      </div>
    </RequireAuth>
  );
}
