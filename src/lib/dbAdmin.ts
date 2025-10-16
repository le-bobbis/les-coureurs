import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
if (!service) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required (server only)');

export const supabaseAdmin = createClient(url, service);
