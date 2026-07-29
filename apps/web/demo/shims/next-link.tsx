'use client';

import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/**
 * Stand-in for `next/link` in the single-file demo build.
 *
 * The demo has no router — the screens come from one component map — so a link
 * becomes an anchor that publishes a navigation event. Without this the bundle
 * would pull in the whole Next runtime for the sake of one component.
 *
 * The prop order matters and is the reason this is not a one-liner: Mantine's
 * `NavLink` passes its own `onClick` down to whatever `component` it is given,
 * so spreading the caller's props *after* our handler silently replaces it and
 * nothing navigates at all.
 */
type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string };

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, children, onClick, ...rest },
  ref,
) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    event.preventDefault();
    if (typeof href === 'string') {
      window.dispatchEvent(new CustomEvent('p2q:navigate', { detail: href }));
    }
  };

  return (
    <a {...rest} ref={ref} href={typeof href === 'string' ? `#${href}` : '#'} onClick={handleClick}>
      {children}
    </a>
  );
});

export default Link;
