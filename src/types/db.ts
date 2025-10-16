// src/types/db.ts

// Row as stored in Supabase
export interface MissionRow {
  id: string;
  date: string;          // YYYY-MM-DD
  slot: number;          // 1,2,3 (or 0,1,2 if you set that up)
  title: string;
  brief: string;
  objective: string | null;
  opening: string | null;
  mission_type: string | null;
  mission_prompt?: string | null;
  created_at?: string;
}

// What the API returns to the UI
export interface MissionDTO {
  id: string;
  date: string;
  slot: number;
  title: string;
  brief: string;
  displayBrief: string;
  objective: string | null;
  opening: string | null;
  mission_type: string;          // normalized to a string (fallback “Unknown”)
  factionsText: string | null;   // derived from brief
  created_at?: string;
}

// LLM response typing
export interface LlmMission {
  title: string;
  brief: string;
  objective: string;
  opening: string;
}
export interface LlmResponse {
  missions: LlmMission[];
}
