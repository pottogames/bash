'use client';

import { Box, Group, Stack, Text, Title } from '@mantine/core';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <Box mb="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Title order={1}>{title}</Title>
          {description ? (
            <Text size="sm" c="dimmed" style={{ maxWidth: '68ch' }}>
              {description}
            </Text>
          ) : null}
        </Stack>
        {actions ? <Group gap="xs">{actions}</Group> : null}
      </Group>
    </Box>
  );
}
