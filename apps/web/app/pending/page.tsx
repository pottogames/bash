'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Stack, Text } from '@mantine/core';
import { IconClock, IconLogout, IconRefresh } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { getSupabase } from '@/lib/supabase/client';

/**
 * The waiting room.
 *
 * A membership sits in `pending_approval` until an administrator activates it,
 * and until then every policy in the database returns nothing. Without this
 * screen the person would land in the application and see empty tables with no
 * explanation, which reads as a broken product rather than as a deliberate gate.
 */
export default function PendingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const check = async () => {
    setChecking(true);
    try {
      const supabase = getSupabase();
      const { data: auth } = await supabase.auth.getUser();
      setEmail(auth.user?.email ?? null);

      const { data } = await supabase
        .from('memberships')
        .select('status')
        .order('created_at', { ascending: false })
        .limit(1);

      const current = data?.[0]?.status ?? null;
      setStatus(current);
      if (current === 'active') {
        router.replace('/');
        router.refresh();
      }
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await getSupabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  return (
    <AuthShell
      title="החשבון ממתין לאישור"
      description="הקוד מומש בהצלחה והחשבון נוצר. מנהל צריך לאשר את התפקיד וההרשאות לפני שהגישה נפתחת."
    >
      <Stack>
        <Alert variant="light" color="caution" icon={<IconClock size={18} />}>
          <Text size="sm">
            עד לאישור החשבון לא רואה שום מידע — לא פרויקטים, לא כמויות ולא מחירים. זה לא באג, זו
            ההגדרה: הרשמה והרשאה הן שני שלבים נפרדים.
          </Text>
        </Alert>

        <Group justify="space-between">
          <Stack gap={2}>
            <Text size="xs" c="dimmed">
              החשבון
            </Text>
            <Text size="sm" fw={600}>
              {email ?? '—'}
            </Text>
          </Stack>
          <Badge color={status === 'active' ? 'verified' : 'caution'}>
            {status === 'pending_approval' ? 'ממתין לאישור' : (status ?? 'לא נמצאה חברות')}
          </Badge>
        </Group>

        <Button
          variant="default"
          leftSection={checking ? <Loader size={14} /> : <IconRefresh size={16} />}
          onClick={check}
          disabled={checking}
          fullWidth
        >
          בדיקה מחדש
        </Button>

        <Button variant="subtle" color="slate" leftSection={<IconLogout size={16} />} onClick={signOut} fullWidth>
          יציאה
        </Button>
      </Stack>
    </AuthShell>
  );
}
