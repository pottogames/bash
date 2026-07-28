import type { Metadata } from 'next';
import { ColorSchemeScript, DirectionProvider, MantineProvider, mantineHtmlProps } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { theme } from './theme';
import { Shell } from '@/components/Shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'plan2quote — מתוכנית לכתב כמויות',
  description: 'קריאת תוכניות בנייה, כתב כמויות, הצעת מחיר וחלוקה לגורמים',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `dir="rtl"` on the document plus Mantine's DirectionProvider: the first
    // fixes the browser's own layout and text handling, the second flips the
    // components' internal logical properties. Both are needed — setting only
    // the attribute leaves popovers and sliders opening the wrong way.
    <html lang="he" dir="rtl" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <DirectionProvider initialDirection="rtl" detectDirection={false}>
          <MantineProvider theme={theme} defaultColorScheme="auto">
            <ModalsProvider>
              <Notifications position="top-center" />
              <Shell>{children}</Shell>
            </ModalsProvider>
          </MantineProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
