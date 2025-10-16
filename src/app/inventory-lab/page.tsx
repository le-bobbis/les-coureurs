'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/db';

type Draft = {
  name: string;
  emoji: string;
  desc: string;
  item_slug: string;
  qty: number;
};

type ApiOk = {
  ok: true;
  draft: Draft;
  saved: boolean;
  mode?: 'insert' | 'increment';
  error: null;
};

type ApiErr = {
  ok: false;
  error: string;
  details?: unknown;
};

type ApiResponse = ApiOk | ApiErr;

export default function InventoryLabPage() {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setProfileId(data.user?.id ?? null);
    });
  }, []);

  /** Parse JSON safely so TS knows it returns ApiResponse */
  async function parseJsonSafe(res: Response): Promise<ApiResponse> {
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      const txt = await res.text();
      throw new Error(`Non-JSON (${res.status}): ${txt.slice(0, 120)}`);
    }
    return (await res.json()) as ApiResponse;
  }

  async function generate(): Promise<void> {
    setBusy(true);
    setMsg(null);
    setDraft(null);
    try {
      const res = await fetch('/api/inventory/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const json = await parseJsonSafe(res);

      if (!json.ok) {
        setMsg(json.error);
        return;
      }

      setDraft(json.draft);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMsg(message);
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    if (!profileId || !draft) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/inventory/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, profile_id: profileId, save: true }),
      });

      const json = await parseJsonSafe(res);

      if (!json.ok) {
        setMsg(json.error);
        return;
      }

      const modeText = json.mode === 'increment' ? 'Incremented' : 'Inserted';
      setMsg(`${modeText}: ${json.draft.name} (qty +${json.draft.qty})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMsg(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="p-6 space-y-4 text-white">
      <h1 className="text-xl font-semibold">Inventory Lab</h1>

      {!profileId && (
        <div className="rounded border border-yellow-600 bg-yellow-900/30 p-3 text-sm">
          Sign in to save items to your inventory.
        </div>
      )}

      <div className="rounded border border-white/15 bg-black/30 p-3">
        <label className="mb-2 block text-sm opacity-80">
          Describe an item to add
        </label>
        <textarea
          className="w-full rounded border border-white/20 bg-black/40 p-2"
          placeholder='e.g. "add a compact powder horn for 20 measures of powder"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
        />
        <div className="mt-2 flex gap-2">
          <button
            className="rounded border border-white/20 px-3 py-1 disabled:opacity-50"
            onClick={() => void generate()}
            disabled={busy || text.trim().length === 0}
          >
            Generate
          </button>
          <button
            className="rounded border border-white/20 px-3 py-1 disabled:opacity-50"
            onClick={() => void save()}
            disabled={busy || !draft || !profileId}
            title={profileId ? '' : 'Sign in first'}
          >
            Save to my inventory
          </button>
        </div>
        {msg && <div className="mt-2 text-sm opacity-80">{msg}</div>}
      </div>

      {draft && (
        <div className="rounded border border-white/15 bg-black/30 p-3">
          <div className="mb-2 text-sm opacity-70">Preview</div>
          <div className="flex items-start gap-3">
            <div className="text-2xl">{draft.emoji}</div>
            <div>
              <div className="text-base font-semibold">{draft.name}</div>
              <div className="text-xs opacity-70">
                slug: {draft.item_slug} · qty: {draft.qty}
              </div>
              <p className="mt-1 text-sm opacity-90">{draft.desc}</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
