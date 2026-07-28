'use client';

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, DirectionProvider, MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { IconInfoCircle } from '@tabler/icons-react';
import { theme } from '../app/theme';
import { Shell } from '../components/Shell';
import UploadPage from '../app/upload/page';
import LayersPage from '../app/layers/page';
import StructurePage from '../app/structure/page';
import AdminPage from '../app/admin/page';
import HomePage from '../app/page';
import { __setPathname } from './shims/next-navigation';

/**
 * Single-file demo build.
 *
 * This is the real application: the same page components, the same theme, and
 * the same engine packages — the DXF parser, the geometry engine and the rule
 * based classifier all run in the page. Dropping a DXF on the upload screen
 * genuinely parses it and genuinely classifies its layers; nothing here is a
 * mock-up of that.
 *
 * What is missing is everything that needs a server: Supabase, the invitation
 * and approval flow, the worker, and persistence. Those are enforced in the
 * database, which is exactly why they cannot be demonstrated in a page.
 */

const ROUTES: Record<string, () => JSX.Element> = {
  '/': HomePage,
  '/upload': UploadPage,
  '/layers': LayersPage,
  '/structure': StructurePage,
  '/admin': AdminPage,
};

function Demo() {
  const [path, setPath] = useState('/upload');

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      if (target && target in ROUTES) {
        __setPathname(target);
        setPath(target);
        window.scrollTo({ top: 0 });
      }
    };
    window.addEventListener('p2q:navigate', onNavigate);
    __setPathname(path);
    return () => window.removeEventListener('p2q:navigate', onNavigate);
  }, [path]);

  const Page = ROUTES[path] ?? UploadPage;

  return (
    <DirectionProvider initialDirection="rtl" detectDirection={false}>
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <ModalsProvider>
          <Notifications position="top-center" />
          <Shell>
            <Alert variant="light" color="slate" icon={<IconInfoCircle size={18} />} mb="lg">
              הדגמה חיה. מנוע קריאת ה-DXF, מנוע המדידה ומנוע הסיווג רצים כאן בדפדפן — אפשר לגרור
              קובץ DXF אמיתי למסך ההעלאה ולראות מה המערכת מזהה. מה שלא פעיל כאן זה כל מה שדורש
              שרת: התחברות, הרשאות, שמירה ותור העיבוד.
            </Alert>
            <Page />
          </Shell>
        </ModalsProvider>
      </MantineProvider>
    </DirectionProvider>
  );
}

document.documentElement.setAttribute('dir', 'rtl');
document.documentElement.setAttribute('lang', 'he');

/**
 * Bridges the host page's theme to Mantine's.
 *
 * The artifact viewer stamps `data-theme="dark"` / `"light"` on the root
 * element when somebody uses its toggle, while Mantine reads
 * `data-mantine-color-scheme`. Without this the toggle appears to do nothing,
 * and the page sits in whatever the OS preference was when it loaded.
 */
function syncColorScheme(): void {
  const host = document.documentElement.getAttribute('data-theme');
  if (host === 'dark' || host === 'light') {
    document.documentElement.setAttribute('data-mantine-color-scheme', host);
  }
}

syncColorScheme();
new MutationObserver(syncColorScheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});

const container = document.getElementById('p2q-root');
if (container) createRoot(container).render(<Demo />);
