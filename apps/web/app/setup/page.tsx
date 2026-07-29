'use client';

import { Alert, Anchor, Code, List, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { AuthShell } from '@/components/AuthShell';

/**
 * Shown when the Supabase project is not connected.
 *
 * A fresh clone has no backend behind it. Rendering the login form in that
 * state produces a request to `undefined` and an error nobody can act on, so
 * the two missing values are named here instead.
 */
export default function SetupPage() {
  return (
    <AuthShell
      title="חיבור למסד הנתונים"
      description="האפליקציה עדיין לא מחוברת לפרויקט Supabase. שני משתנים חסרים."
    >
      <Stack>
        <Alert variant="light" color="slate" icon={<IconInfoCircle size={18} />}>
          <Text size="sm">
            הקוד רץ, אבל בלי מסד נתונים אין התחברות, אין הרשאות ואין נתונים. מנוע קריאת התוכניות
            עצמו לא תלוי בזה.
          </Text>
        </Alert>

        <Text size="sm" fw={600}>
          מה לעשות
        </Text>
        <List size="sm" spacing="sm" type="ordered">
          <List.Item>
            צור פרויקט חינמי ב־
            <Anchor href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" size="sm">
              supabase.com
            </Anchor>
            .
          </List.Item>
          <List.Item>
            הרץ את המיגרציות מהתיקייה <Code>supabase/migrations</Code> לפי הסדר — דרך ה-SQL Editor
            או עם <Code>npx supabase db push</Code>.
          </List.Item>
          <List.Item>
            העתק את <Code>apps/web/.env.local.example</Code> ל־<Code>apps/web/.env.local</Code>{' '}
            ומלא את שני הערכים מ־Settings → API בפרויקט שלך:
            <Code block mt={6}>
              {'NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...'}
            </Code>
          </List.Item>
          <List.Item>
            הפעל מחדש את השרת (<Code>npm run dev</Code>). Next קורא קבצי סביבה רק בעלייה.
          </List.Item>
          <List.Item>
            הרץ את <Code>supabase/seed.sql</Code> כדי ליצור ארגון, פרויקט לדוגמה ומשתמש בעלים ראשון.
          </List.Item>
        </List>
      </Stack>
    </AuthShell>
  );
}
