# 🧾 Project Handoff — *Les Coureurs: Inventory & Auth Integration*

**Last updated:** October 2025  
**Maintainer:** Bobby Lamirande  
**Merged branch:** `feat/inventory-minimal-step7` → `main`  
**Status:** Basic Supabase Auth working in production · Inventory backend groundwork complete.

---

## 🎯 Phase 7 Goal — Inventory System (Minimal Implementation)

**Objective:**  
Give each *runner* (user) an **inventory** that persists between missions and play sessions, connected to Supabase Auth.

### ✅ Current Progress
- ✅ Supabase Auth sign-in / sign-up works on live site.  
- ✅ Auth state persists globally (`AuthStatus` in layout).  
- ✅ Server routes use service-role client for writes.  
- ✅ `createSessionForCurrentUser` established.  
- ✅ `user_inventory` table exists with RLS policies.  

### 🧱 Target Data Model
```ts
type InventoryItem = {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  qty: number;
  status?: 'ok' | 'damaged';
};
````

Stored in `sessions.state.inventory` and persisted in `user_inventory`.

---

## 🧩 Gameplay Integration Plan

### 1️⃣ Item Acquisition

* Server (not LLM) generates emoji + ≤15-word description.
* Appends to `inventory`; logs change to turn summary.

### 2️⃣ Item Use

* Parse player input for item name/emoji.
* Validate ownership → apply bonus → consume/damage/persist → update DB.

### 3️⃣ Inventory Display

* Show inventory grid on `/play` page (merged session + user inventory).

**Done when:**
Player can “use rope” for a bonus and see inventory change both in UI and Supabase.

---

## 🧑‍💻 Working with Bobby (Learning Context)

| Preference     | Description                                      |
| -------------- | ------------------------------------------------ |
| Learning style | Hands-on with clear examples.                    |
| Code style     | Minimal abstraction, explicit helpers.           |
| Review style   | Inline comments > lengthy docs.                  |
| Workflow       | Feature branches + PR Previews (Vercel).         |
| Priority       | Keep repo stable; favor clarity over cleverness. |

---

## 🧠 Established Practices

### Auth Flow

* `/login` page → Supabase browser client.
* `AuthStatus` overlay → in `app/layout.tsx`.
* `RequireAuth` → wraps protected pages.

### DB Clients

* `src/lib/db.ts` → anon (client-safe).
* `src/lib/dbAdmin.ts` → service (server-only).

  ```ts
  export const runtime = 'nodejs';
  import { supabaseAdmin } from '@/lib/dbAdmin';
  ```

### Error & Type Safety

* Replaced `catch (e: any)` → `catch (e: unknown)` + `instanceof Error`.
* Utility `toMessage(e)` standardizes errors.
* ESLint & Husky block future `any`.

---

## 🔒 Supabase Schema Recap

| Table            | Purpose           | Key Columns                                     |
| ---------------- | ----------------- | ----------------------------------------------- |
| `sessions`       | Active runs       | `id`, `user_id`, `state (jsonb)`                |
| `turns`          | Narrative history | `session_id`, `player_input`, `summary (jsonb)` |
| `user_inventory` | Persistent items  | `user_id`, `items (jsonb)`                      |

**RLS policy**

```sql
CREATE POLICY "inventory_access_own"
ON public.user_inventory
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

---

## 🚀 Next Steps (Phase 8+)

| Goal               | Description                                   | Priority |
| ------------------ | --------------------------------------------- | -------- |
| 🧠 Item generator  | Random emoji + description utility            | High     |
| ⚔️ Item use logic  | Apply item bonus during checks                | High     |
| 🧾 Inventory UI    | Visual grid on `/play`                        | Medium   |
| 🔁 Persistent sync | Merge session → user inventory on mission end | Medium   |
| 🧹 Refactor        | Move session logic → `/lib/sessions.ts`       | Low      |
| 🧪 Testing         | Add Vitest + mock Supabase                    | Low      |

---

## 🧰 Tooling & Deployment

| Tool               | Purpose                                |
| ------------------ | -------------------------------------- |
| **Vercel**         | Builds Preview → PR, Production → main |
| **Supabase**       | Auth + DB + Storage                    |
| **Next.js 15.5**   | App Router / Turbopack                 |
| **TypeScript**     | Strict mode on                         |
| **ESLint + Husky** | Blocks unsafe types pre-commit         |

---

## 📁 Suggested Files to Add

| File                         | Purpose                            |
| ---------------------------- | ---------------------------------- |
| `docs/HANDOFF.md`            | (This document) Continuity summary |
| `docs/DEV_GUIDE.md`          | Branch & deploy workflow           |
| `src/lib/toMessage.ts`       | Error utility                      |
| `src/lib/types/inventory.ts` | Shared types                       |
| `.husky/pre-commit`          | Runs `npm run lint` before commit  |

---

## 🧭 Developer Workflow (Quick Ref)

```bash
git switch -c feat/inventory-ui
npm run dev
git add .
git commit -m "feat: inventory UI grid"
git push -u origin feat/inventory-ui
# open PR → review preview → squash merge
git switch main
git pull origin main
```

---

## 🪄 Collaboration Tips

* Keep Supabase writes in API routes (never client-side).
* Always set `runtime = 'nodejs'` for service-role routes.
* Review Preview Deploys before merge.
* For schema changes → `supabase migration new <desc>`.

---

**End of handoff.**
Future contributors should read this before branching to ensure continuity and type safety across the inventory system.
