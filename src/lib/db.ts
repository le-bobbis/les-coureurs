import { createClient } from "@supabase/supabase-js";

// Public client (safe for browser)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Service role (server-only). Accept either var name.
const service =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
if (!anon) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required.");
if (!service) throw new Error("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE) is required.");

export const supabase = createClient(url, anon);

// DO NOT import supabaseAdmin in client components
export const supabaseAdmin = createClient(url, service, {
  auth: { persistSession: false },
});
