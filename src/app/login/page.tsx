'use client';

import { useState } from 'react';
import { supabase } from '@/lib/db';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleAuth() {
  postMessage('');

  if (mode === 'login') {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return postMessage(error.message);
    postMessage(`✅ Logged in as ${data.user?.email}`);
  } else {
    // new-style signup API
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`, // redirect target after confirmation emails
      },
    });
    if (error) return postMessage(error.message);
    postMessage(`✅ Check ${data.user?.email ?? email} for confirmation`);
  }
}


  return (
    <div className="max-w-xs mx-auto mt-24 flex flex-col gap-2">
      <h1 className="text-xl font-bold text-center">Runner Login</h1>
      <input className="border p-2 rounded" placeholder="Email" onChange={e=>setEmail(e.target.value)} />
      <input className="border p-2 rounded" type="password" placeholder="Password" onChange={e=>setPassword(e.target.value)} />
      <button onClick={handleAuth} className="bg-black text-white p-2 rounded">
        {mode === 'login' ? 'Log In' : 'Sign Up'}
      </button>
      <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="text-sm underline">
        {mode === 'login' ? 'Create account' : 'Already have an account? Log in'}
      </button>
    </div>
  );
}
