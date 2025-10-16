'use client';
import { useEffect, useState } from 'react';
import InventoryPanel from '@/components/InventoryPanel';
import { supabase } from '@/lib/db';

export default function InventoryDemoPage() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Grab the current user's ID from Supabase auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) setError(error.message);
      setProfileId(data.user?.id ?? null);
    });
  }, []);

  if (error) return <main className="p-6">Auth error: {error}</main>;
  if (!profileId) return <main className="p-6">Sign in to view your inventory.</main>;

  return (
    <main className="p-6 space-y-4 text-white">
      <h1 className="text-xl font-semibold">Inventory Demo</h1>
      <InventoryPanel profileId={profileId} />
    </main>
  );
}
