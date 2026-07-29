import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { readSupabaseEnv } from './env';
import type { Database } from './types';

/**
 * The server client, for server components and route handlers.
 *
 * It reads and writes the session cookies so a page rendered on the server sees
 * the same signed-in user the browser does. Returns `null` when the project is
 * not connected, so callers can render the setup screen instead of throwing.
 */
export async function createClient() {
  const env = readSupabaseEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component, where cookies are read-only. The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
