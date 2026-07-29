'use client';

import { createBrowserClient } from '@supabase/ssr';
import { readSupabaseEnv } from './env';
import type { Database } from './types';

/**
 * The browser client.
 *
 * Queries go straight from the browser to PostgREST with the anon key, and row
 * level security decides what comes back. That is not a shortcut around a
 * server layer — it is the design: the policies in `supabase/migrations` are
 * the security boundary, and routing the same query through a Next server
 * would add a hop without adding a check.
 *
 * The return type is inferred from `createBrowserClient` itself rather than
 * spelled out as `SupabaseClient<Database>` — the client library's generic
 * signature carries extra defaulted type parameters that shift between minor
 * versions, and re-deriving them by hand is exactly the kind of thing that
 * silently breaks on an upgrade.
 */

type Supabase = ReturnType<typeof createBrowserClient<Database>>;

let cached: Supabase | null = null;

export function getSupabase(): Supabase {
  if (cached) return cached;
  const env = readSupabaseEnv();
  if (!env) {
    throw new Error(
      'Supabase אינו מוגדר. העתק את .env.local.example ל-.env.local ומלא את שני המשתנים.',
    );
  }
  cached = createBrowserClient<Database>(env.url, env.anonKey);
  return cached;
}
