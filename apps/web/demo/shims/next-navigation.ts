/**
 * Stand-in for `next/navigation` in the demo build. The Shell only reads the
 * pathname to highlight the active nav item; the demo keeps that in its own
 * state and publishes it here.
 */
let current = '/';

export function __setPathname(path: string): void {
  current = path;
}

export function usePathname(): string {
  return current;
}

export function useRouter() {
  return {
    push: (path: string) => window.dispatchEvent(new CustomEvent('p2q:navigate', { detail: path })),
    replace: (path: string) => window.dispatchEvent(new CustomEvent('p2q:navigate', { detail: path })),
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  };
}

export function useSearchParams() {
  return new URLSearchParams();
}
