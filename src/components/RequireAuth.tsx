'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/db';
import { useRouter } from 'next/navigation';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) router.replace('/login');
      else setReady(true);
    })();
  }, [router]);

  if (!ready) return null; // or spinner
  return <>{children}</>;
}
