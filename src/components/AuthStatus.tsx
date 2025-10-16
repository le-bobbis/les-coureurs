'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/db';

export default function AuthStatus() {
  const [email, setEmail] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<string>('checking…');

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSessionInfo(session ? 'session active' : 'no session');
      setEmail(session?.user?.email ?? null);
      console.log('[AuthStatus] session', session);
    };
    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSessionInfo(sess ? 'session active' : 'no session');
      setEmail(sess?.user?.email ?? null);
      console.log('[AuthStatus] onAuthStateChange', _e, sess);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setEmail(null);
    setSessionInfo('signed out');
  }

  async function signInTest() {
    // quick sanity: prints whatever user is visible now
    const { data: { user } } = await supabase.auth.getUser();
    console.log('[AuthStatus] getUser()', user);
    alert(user ? `Signed in as ${user.email}` : 'No user');
  }

  return (
    <div className="fixed top-3 right-3 z-50">
      <div className="px-3 py-2 rounded bg-white/90 text-black shadow">
        <div className="text-xs">Auth: <b>{sessionInfo}</b></div>
        <div className="text-xs">{email ?? '—'}</div>
        <div className="mt-1 flex gap-2">
          <button className="underline text-xs" onClick={signInTest}>Who am I?</button>
          <button className="underline text-xs" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
