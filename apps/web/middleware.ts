import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { readSupabaseEnv } from './lib/supabase/env';

/**
 * Session refresh and the front door.
 *
 * Two jobs. It refreshes the Supabase session cookie on every request, which is
 * what stops a user being silently signed out mid-session. And it keeps
 * unauthenticated visitors out of the application shell.
 *
 * The redirect here is convenience, not security — anybody can call PostgREST
 * directly, so the actual boundary is the row level security in
 * `supabase/migrations`. This just means a signed-out person sees a login form
 * rather than a screen of empty tables.
 */

/** Reachable without a session. */
const PUBLIC_PATHS = ['/login', '/register', '/pending', '/setup', '/auth'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const env = readSupabaseEnv();

  // Not connected yet: send everything to the setup page rather than to a login
  // form that cannot possibly work.
  if (!env) {
    if (pathname.startsWith('/setup')) return NextResponse.next();
    return NextResponse.redirect(new URL('/setup', request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getUser` rather than `getSession`: it validates the token with the auth
  // server instead of trusting whatever is in the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!user && !isPublic) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next's own assets and static files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
