'use client';

import { Alert, Button, Card, Center, Loader, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconAlertTriangle, IconDatabaseOff } from '@tabler/icons-react';
import Link from 'next/link';

/**
 * The three states every data screen has, in one place.
 *
 * An empty table and a failed query look identical if you only render rows, and
 * "nothing here" is a very different message from "the query was refused".
 * Keeping them distinct is the whole point of this component.
 */
export function DataState({
  loading,
  error,
  empty,
  emptyTitle,
  emptyBody,
  emptyAction,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyTitle: string;
  emptyBody: string;
  emptyAction?: { href: string; label: string };
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <Center py="xl">
        <Stack align="center" gap="xs">
          <Loader />
          <Text size="sm" c="dimmed">
            טוען…
          </Text>
        </Stack>
      </Center>
    );
  }

  if (error) {
    return (
      <Alert variant="light" color="alert" icon={<IconAlertTriangle size={18} />} title="הנתונים לא נטענו">
        <Text size="sm">{error}</Text>
        <Text size="sm" c="dimmed" mt={6}>
          אם החשבון עדיין ממתין לאישור מנהל, זה הצפוי — עד לאישור אין גישה לשום שורה.
        </Text>
      </Alert>
    );
  }

  if (empty) {
    return (
      <Card padding="xl">
        <Center>
          <Stack align="center" gap="xs" maw="46ch" ta="center">
            <ThemeIcon size={44} radius="xl" variant="light" color="slate">
              <IconDatabaseOff size={22} />
            </ThemeIcon>
            <Text fw={600}>{emptyTitle}</Text>
            <Text size="sm" c="dimmed">
              {emptyBody}
            </Text>
            {emptyAction ? (
              <Button component={Link} href={emptyAction.href} mt="xs">
                {emptyAction.label}
              </Button>
            ) : null}
          </Stack>
        </Center>
      </Card>
    );
  }

  return <>{children}</>;
}
