// src/lib/sessions.ts
import { supabase } from '@/lib/db';
import { getUserIdClient, loadUserInventory } from '@/lib/inventorySync';

export type InventoryItem = {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  qty: number;
  status?: 'ok' | 'damaged';
};

export type SessionState = {
  // add any other fields you already track in state
  inventory: InventoryItem[];
};

/** Create a new session for the current logged-in user, seeding inventory from user_inventory */
export async function createSessionForCurrentUser(missionId: string) {
  const userId = await getUserIdClient();
  const items = await loadUserInventory();

  const initialState: SessionState = {
    inventory: items,
  };

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      mission_id: missionId,
      actions_remaining: 0, // tweak to your default
      state: initialState,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function getSession(sessionId: string): Promise<SessionState> {
  const { data, error } = await supabase
    .from('sessions')
    .select('state')
    .eq('id', sessionId)
    .single();
  if (error) throw error;
  return (data.state ?? { inventory: [] }) as SessionState;
}

export async function saveSessionState(sessionId: string, state: SessionState) {
  const { error } = await supabase
    .from('sessions')
    .update({ state })
    .eq('id', sessionId);
  if (error) throw error;
}
