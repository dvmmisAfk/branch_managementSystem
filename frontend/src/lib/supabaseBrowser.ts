/**
 * Optional Supabase browser client for this Vite + React app.
 *
 * This project’s API auth remains Express + JWT (`src/api/client.ts`).
 * Use Supabase only for features you add (Realtime, Storage, Edge calls, etc.).
 *
 * Env (e.g. `.env.local`, ignored by git via `*.local`):
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJ...   (Dashboard → Settings → API → anon public)
 *
 * The Next.js + `@supabase/ssr` pattern (server.ts, middleware, `cookies()` from
 * `next/headers`) does not apply here—there is no Next.js server. For SSR you’d
 * need a separate Next app or pass Supabase JWT from this SPA to your API.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let singleton: SupabaseClient | null | undefined;

/** Returns null if URL/key are not configured (app still runs with JWT API only). */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (singleton !== undefined) return singleton;

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!url?.trim() || !anonKey?.trim()) {
    singleton = null;
    return null;
  }

  singleton = createClient(url.trim(), anonKey.trim(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return singleton;
}

export function resetSupabaseBrowserForTests(): void {
  singleton = undefined;
}
