'use client';

import { Badge, Box, Card, Group, NumberFormatter, Progress, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconAlertTriangle, IconCalculator, IconReceipt2 } from '@tabler/icons-react';
import { DataState } from './DataState';
import { fetchProjectAnalysis } from '@/lib/queries';
import { useQuery } from '@/lib/use-query';

const MEASURE_LABEL: Record<string, string> = {
  length: 'אורך',
  area: 'שטח',
  volume: 'נפח',
  count: 'ספירה',
  weight: 'משקל',
};

/**
 * The "how is this project doing" summary, next to the structure instead of
 * behind it — one rough total instead of a tour through quantities, layers
 * and quotes to add it up by hand.
 *
 * The estimate is intentionally not a quote: it is quantity × the org's
 * default price book rate, with no discount, VAT or manual line edits. It
 * exists so a project owner has a number before any of that has been done.
 */
export function AnalysisPanel({ projectId }: { projectId: string | null }) {
  const load = () => (projectId ? fetchProjectAnalysis(projectId) : Promise.resolve(null));
  const { data, loading, error } = useQuery(load, [projectId]);

  return (
    <Card padding="md" style={{ position: 'sticky', top: 76 }}>
      <Group gap={8} mb="sm">
        <ThemeIcon variant="light" size="md" radius="md" color="ink">
          <IconCalculator size={16} />
        </ThemeIcon>
        <Text fw={600}>ניתוח כולל</Text>
      </Group>

      <DataState
        loading={loading}
        error={error}
        empty={!data || data.trades.length === 0}
        emptyTitle="אין עדיין כמויות"
        emptyBody="הניתוח מופיע ברגע שיש כתב כמויות — אחרי ייבוא תוכניות וסיווג שכבות."
      >
        {data ? (
          <Stack gap="md">
            <Box>
              <Text size="xs" c="dimmed" mb={2}>
                {data.hasPriceBook ? 'הערכת עלות ראשונית' : 'אין מחירון ברירת מחדל'}
              </Text>
              {data.totalEstimatedCost != null ? (
                <Group gap={6} align="baseline">
                  <Text fw={700} size="xl" className="p2q-numeric">
                    <NumberFormatter
                      value={data.totalEstimatedCost}
                      decimalScale={0}
                      thousandSeparator
                    />
                  </Text>
                  <Text size="sm" c="dimmed">
                    {data.currency}
                  </Text>
                </Group>
              ) : (
                <Text size="sm" c="dimmed">
                  יש כמויות בלי תמחור — הוסף מחירון כדי לראות הערכה.
                </Text>
              )}
              {data.hasPriceBook && data.pricedTradeCount < data.trades.length && (
                <Text size="xs" c="caution.7" mt={4}>
                  {data.trades.length - data.pricedTradeCount} מקצועות בלי מחיר במחירון — לא נכללו
                  בסכום.
                </Text>
              )}
              <Text size="xs" c="dimmed" mt={4}>
                הערכה בלבד, לא הצעת מחיר. לפני שליחה ללקוח נדרשת גרסת הצעה מסודרת.
              </Text>
            </Box>

            <Stack gap={8}>
              {data.trades.map((trade) => (
                <Box key={trade.trade_id}>
                  <Group justify="space-between" gap={8} wrap="nowrap">
                    <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                      <Box w={8} h={8} style={{ borderRadius: 2, background: trade.color, flexShrink: 0 }} />
                      <Text size="sm" fw={500} truncate>
                        {trade.trade_name}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                      <NumberFormatter value={trade.quantity} decimalScale={1} thousandSeparator />{' '}
                      {trade.unit}
                    </Text>
                  </Group>
                  {trade.estimated_cost != null ? (
                    <Text size="xs" c="dimmed" ta="end">
                      <NumberFormatter
                        value={trade.estimated_cost}
                        decimalScale={0}
                        thousandSeparator
                      />{' '}
                      {data.currency}
                    </Text>
                  ) : (
                    <Text size="xs" c="caution.7" ta="end">
                      ללא מחיר
                    </Text>
                  )}
                </Box>
              ))}
            </Stack>

            {data.unmeasurablePlans > 0 && (
              <Group gap={6} wrap="nowrap" align="flex-start">
                <ThemeIcon size="sm" radius="xl" variant="light" color="caution">
                  <IconAlertTriangle size={12} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">
                  {data.unmeasurablePlans} מתוך {data.totalPlans} גיליונות סומנו כלא ניתנים למדידה
                  אוטומטית ואינם בסכום.
                </Text>
              </Group>
            )}

            <Group gap={6} wrap="nowrap">
              <IconReceipt2 size={13} />
              <Text size="xs" c="dimmed">
                {data.trades.length} מקצועות נמדדו מתוך {data.totalPlans} תוכניות
              </Text>
            </Group>
            <Progress
              value={data.totalPlans ? ((data.totalPlans - data.unmeasurablePlans) / data.totalPlans) * 100 : 0}
              size="sm"
              color="verified"
            />
          </Stack>
        ) : null}
      </DataState>
    </Card>
  );
}
