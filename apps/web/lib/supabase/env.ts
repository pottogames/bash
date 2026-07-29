/**
 * Supabase connection settings, and what to do when they are missing.
 *
 * A first clone has no Supabase project behind it. Reading `undefined` into a
 * client and letting it fail at the first query gives a blank screen and a
 * console error nobody sees, so the absence is detected up front and the app
 * shows a setup screen that says which two values to fill in.
 */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/** Returns the settings, or `null` when the project is not connected yet. */
export function readSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Placeholder values from `.env.local.example` count as unset — otherwise the
  // app would try to reach a hostname that does not exist and report a network
  // error instead of "you have not filled this in".
  if (!url || !anonKey) return null;
  if (url.includes('your-project') || anonKey.startsWith('your-')) return null;

  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv() !== null;
}
