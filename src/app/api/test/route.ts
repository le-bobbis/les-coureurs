// src/lib/db.ts
import { createClient } from "@supabase/supabase-js";

// Browser-safe client (uses Anon key). OK for reads guarded by RLS.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,        // e.g. https://xxx.supabase.co
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!    // anon public key
);

// Server-only client with full privileges (bypasses RLS). DO NOT use in client components.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!,           // service role key (secret)
  { auth: { persistSession: false } }
);
