'use client';

import { useState } from 'react';
import {
  Alert,
  Anchor,
  Button,
  List,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle, IconInfoCircle, IconKey, IconLock, IconMail, IconUser } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { getSupabase } from '@/lib/supabase/client';

/**
 * Registration.
 *
 * Three steps happen here, in one submit, and the order matters:
 *
 *   1. Create the auth user. A trigger writes the profile row, which is what
 *      the next step matches the invitation's email against.
 *   2. Redeem the code. The database checks it is unused, unexpired, and issued
 *      to this exact address, then creates a membership in `pending_approval`.
 *   3. Send the person to the waiting screen.
 *
 * There is no path from here to an active account. Activation only happens when
 * an administrator calls `approve_membership`, and no policy lets a client
 * write that status directly.
 */
export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const form = useForm({
    initialValues: { fullName: '', email: '', code: '', password: '', confirm: '' },
    validate: {
      fullName: (v) => (v.trim().length >= 2 ? null : 'נדרש שם מלא'),
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : 'כתובת מייל לא תקינה'),
      code: (v) => (v.replace(/[\s-]/g, '').length >= 16 ? null : 'קוד ההזמנה נראה קצר מדי'),
      password: (v) => (v.length >= 10 ? null : 'הסיסמה חייבת להיות באורך 10 תווים לפחות'),
      confirm: (v, values) => (v === values.password ? null : 'הסיסמאות אינן זהות'),
    },
  });

  const submit = form.onSubmit(async ({ fullName, email, code, password }) => {
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabase();

      const { data: signUp, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      // With email confirmation switched on there is no session yet, so the
      // code cannot be redeemed until the address is verified. Say so instead
      // of failing on the RPC with a permissions error.
      if (!signUp.session) {
        setError(
          'נשלח אליך מייל אימות. אשר אותו, ואז חזור לכאן והירשם שוב עם אותו קוד כדי להשלים את התהליך.',
        );
        return;
      }

      const { error: redeemError } = await supabase.rpc('redeem_invitation', {
        code: code.trim().toUpperCase(),
      });
      if (redeemError) {
        // The RPC's messages are already written for a person to read.
        setError(redeemError.message);
        return;
      }

      router.replace('/pending');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ההרשמה נכשלה.');
    } finally {
      setBusy(false);
    }
  });

  return (
    <AuthShell
      title="הרשמה עם קוד הזמנה"
      description="חשבון נוצר רק מול קוד שמנהל הנפיק. הקוד קשור לכתובת מייל אחת ולא ניתן להעברה."
      footer={
        <Text size="sm" c="dimmed">
          כבר יש לך חשבון?{' '}
          <Anchor component={Link} href="/login" size="sm">
            כניסה
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
            label="שם מלא"
            leftSection={<IconUser size={16} />}
            required
            {...form.getInputProps('fullName')}
          />

          <TextInput
            label="מייל"
            description="חייב להיות בדיוק הכתובת שאליה נשלח הקוד"
            placeholder="name@company.co.il"
            leftSection={<IconMail size={16} />}
            autoComplete="username"
            required
            {...form.getInputProps('email')}
          />

          <TextInput
            label="קוד הזמנה"
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            leftSection={<IconKey size={16} />}
            styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
            required
            {...form.getInputProps('code')}
          />

          <PasswordInput
            label="סיסמה"
            description="10 תווים לפחות"
            leftSection={<IconLock size={16} />}
            autoComplete="new-password"
            required
            {...form.getInputProps('password')}
          />

          <PasswordInput
            label="אימות סיסמה"
            leftSection={<IconLock size={16} />}
            autoComplete="new-password"
            required
            {...form.getInputProps('confirm')}
          />

          <Alert variant="light" color="slate" icon={<IconInfoCircle size={18} />}>
            <Text size="sm" fw={600} mb={4}>
              מה קורה אחרי ההרשמה
            </Text>
            <List size="sm" spacing={4}>
              <List.Item>החשבון נוצר במצב ״ממתין לאישור״ ואינו רואה שום מידע.</List.Item>
              <List.Item>מנהל בודק את התפקיד וההרשאות ומאשר במפורש.</List.Item>
              <List.Item>רק אז תיפתח לך הגישה, ורק לחלק ששויך אליך.</List.Item>
            </List>
          </Alert>

          <Button type="submit" loading={busy} fullWidth>
            יצירת חשבון
          </Button>
        </Stack>
      </form>
    </AuthShell>
  );
}
