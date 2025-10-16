import { supabase } from '@/lib/db';

export async function getUserIdClient() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user?.id ?? null;
}
