'use client';

import { Suspense, useState } from 'react';
import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle, IconLock, IconMail } from '@tabler/icons-react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { getSupabase } from '@/lib/supabase/client';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}

function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (value) => (/^\S+@\S+\.\S+$/.test(value) ? null : 'כתובת מייל לא תקינה'),
      password: (value) => (value.length > 0 ? null : 'נדרשת סיסמה'),
    },
  });

  const submit = form.onSubmit(async ({ email, password }) => {
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        // Supabase returns the same message for a wrong password and an
        // unknown address, which is correct — telling them apart would let
        // anybody enumerate who has an account here.
        setError('המייל או הסיסמה שגויים.');
        return;
      }

      // A membership that is still waiting for an administrator can sign in but
      // sees nothing, so send it somewhere that explains that rather than to an
      // application full of empty tables.
      const { data: memberships } = await supabase
        .from('memberships')
        .select('status')
        .eq('status', 'active');

      router.replace(memberships && memberships.length > 0 ? (params.get('next') ?? '/') : '/pending');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ההתחברות נכשלה.');
    } finally {
      setBusy(false);
    }
  });

  return (
    <AuthShell
      title="כניסה למערכת"
      description="המשתמש והסיסמה נוצרו אחרי שמימשת קוד הזמנה. אין הרשמה פתוחה."
      footer={
        <Text size="sm" c="dimmed">
          יש לך קוד הזמנה?{' '}
          <Anchor component={Link} href="/register" size="sm">
            הרשמה עם קוד
          </Anchor>
        </Text>
      }
    >
      <form onSubmit={submit}>
        <Stack>
          {error ? (
            <Alert variant="light" color="alert" icon={<IconAlertTriangle size={18} />}>
              {error}
            </Alert>
          ) : null}

          <TextInput
            label="מייל"
            placeholder="name@company.co.il"
            leftSection={<IconMail size={16} />}
            autoComplete="username"
            required
            {...form.getInputProps('email')}
          />

          <PasswordInput
            label="סיסמה"
            leftSection={<IconLock size={16} />}
            autoComplete="current-password"
            required
            {...form.getInputProps('password')}
          />

          <Button type="submit" loading={busy} fullWidth mt="xs">
            כניסה
          </Button>
        </Stack>
      </form>
    </AuthShell>
  );
}
