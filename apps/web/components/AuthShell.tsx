'use client';

import { Box, Card, Center, Group, Stack, Text, Title } from '@mantine/core';

/**
 * Frame for the signed-out screens.
 *
 * Deliberately not the application shell: there is no navigation to show
 * somebody who cannot see anything yet, and a sidebar full of links that all
 * bounce back to the login form is worse than no sidebar.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Center mih="100vh" p="md" className="p2q-grid-bg">
      <Box w="100%" maw={460}>
        <Group gap={8} mb="lg" justify="center">
          <Text fw={700} size="xl" style={{ letterSpacing: '-0.02em' }}>
            plan2quote
          </Text>
        </Group>

        <Card padding="xl" shadow="md">
          <Stack gap="xs" mb="lg">
            <Title order={2}>{title}</Title>
            {description ? (
              <Text size="sm" c="dimmed">
                {description}
              </Text>
            ) : null}
          </Stack>
          {children}
        </Card>

        {footer ? (
          <Box mt="md" ta="center">
            {footer}
          </Box>
        ) : null}
      </Box>
    </Center>
  );
}
