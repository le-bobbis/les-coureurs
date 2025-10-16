// src/components/InventoryPanel.tsx
'use client';
import { useCallback, useEffect, useState } from 'react';

type Item = {
  id: string;
  name: string;
  emoji: string;
  descr: string;
  qty: number;
  status: 'ok' | 'damaged' | 'destroyed';
};

export default function InventoryPanel({ profileId }: { profileId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      if (!profileId) return;
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/inventory?profileId=${encodeURIComponent(profileId)}`);
      const json = await res.json();
      if (json.error) setError(json.error);
      setItems((json.items ?? []) as Item[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function applyItemChange(itemId: string, opts: { consume?: number; damage?: boolean }) {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/inventory/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, ...opts }),
      });
      const json = await res.json();
      if (json.error) setError(json.error);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update item');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/15 bg-black/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">Inventory</h3>
        <button onClick={() => void refresh()} className="text-xs opacity-70 hover:opacity-100" disabled={loading}>
          Refresh
        </button>
      </div>

      {loading && <div className="text-sm opacity-70">Loading…</div>}
      {error && <div className="mb-2 text-sm text-red-400">{error}</div>}

      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between rounded border border-white/10 p-2">
            <div className="flex items-start gap-2">
              <span className="text-lg leading-none">{it.emoji}</span>
              <div>
                <div className="text-sm font-medium leading-tight">{it.name}</div>
                <div className="text-xs opacity-70">
                  qty: {it.qty}
                  {it.status && it.status !== 'ok' ? ` · ${it.status}` : ''}
                </div>
                <div className="mt-1 text-xs opacity-80 max-w-[36ch]">{it.descr}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded border border-white/15 px-2 py-1 text-xs"
                onClick={() => void applyItemChange(it.id, { consume: 1 })}
                disabled={loading}
                title="Consume 1"
              >
                -1
              </button>
              <button
                className="rounded border border-white/15 px-2 py-1 text-xs"
                onClick={() => void applyItemChange(it.id, { damage: true })}
                disabled={loading}
                title="Mark damage"
              >
                damage
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 && !loading && <li className="text-sm opacity-70">No items yet.</li>}
      </ul>
    </div>
  );
}
