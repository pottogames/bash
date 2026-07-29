'use client';

import { Suspense, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  HoverCard,
  List,
  NumberFormatter,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconInfoCircle,
  IconRuler2,
  IconSearch,
} from '@tabler/icons-react';
import { TRADES, type MeasureType, type TradeCode } from '@plan2quote/core';
import { PageHeader } from '@/components/PageHeader';
import { DataState } from '@/components/DataState';
import { fetchLayerQuantities, fetchLayers, fetchTrades, updateLayer } from '@/lib/queries';
import { useProject } from '@/lib/use-project';
import { useQuery } from '@/lib/use-query';
import type { LayerWithPlan } from '@/lib/queries';

const MEASURE_LABEL: Record<MeasureType, string> = {
  length: 'אורך',
  area: 'שטח',
  volume: 'נפח',
  count: 'ספירה',
  weight: 'משקל',
};

const SOURCE_LABEL: Record<string, string> = {
  org_rule: 'כלל ארגוני',
  layer_standard: 'תקן שכבות',
  keyword: 'מילון מונחים',
  geometry_hint: 'תוכן השכבה',
  manual: 'שיוך ידני',
  none: 'לא זוהה',
};

export default function LayersPage() {
  return (
    <Suspense fallback={null}>
      <LayersScreen />
    </Suspense>
  );
}

function LayersScreen() {
  const { project, loading: projectLoading, error: projectError } = useProject();
  const projectId = project?.id ?? null;

  const layersQuery = useQuery(
    () => (projectId ? fetchLayers(projectId) : Promise.resolve([])),
    [projectId],
  );
  const quantitiesQuery = useQuery(
    () => (projectId ? fetchLayerQuantities(projectId) : Promise.resolve(new Map())),
    [projectId],
  );
  const tradesQuery = useQuery(() => fetchTrades(), []);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'review' | 'billable'>('all');
  const [names, setNames] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const layers = layersQuery.data ?? [];
  const quantities = quantitiesQuery.data ?? new Map<string, { value: number; measure_type: MeasureType; unit: string }>();
  const trades = tradesQuery.data ?? [];
  const tradeByKey = useMemo(() => new Map(trades.map((t) => [t.key, t])), [trades]);
  const tradeById = useMemo(() => new Map(trades.map((t) => [t.id, t])), [trades]);

  const visible = layers.filter((layer) => {
    const name = names[layer.id] ?? layer.display_name ?? layer.source_name;
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'review') return layer.confidence < 0.7;
    if (filter === 'billable') {
      const trade = layer.trade_id ? tradeById.get(layer.trade_id) : null;
      return Boolean(trade?.billable);
    }
    return true;
  });

  const needsReview = layers.filter((l) => l.confidence < 0.7).length;
  const classified = layers.filter((l) => l.trade_id).length;

  const rename = (layerId: string, value: string) => {
    setNames((prev) => ({ ...prev, [layerId]: value }));
  };
  const commitRename = async (layerId: string, value: string) => {
    try {
      await updateLayer(layerId, { display_name: value || null });
    } catch {
      // The input already reflects the attempted value; a silent failure here
      // just means the next reload reverts it, which is enough signal.
    }
  };
  const reassign = async (layer: LayerWithPlan, tradeCode: TradeCode) => {
    const trade = tradeByKey.get(tradeCode);
    if (!trade) return;
    setSavingId(layer.id);
    try {
      await updateLayer(layer.id, { trade_id: trade.id });
      layersQuery.reload();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Box>
      <PageHeader
        title="ניהול שכבות"
        description="כל שכבה מהקובץ, מה זוהה ולמה. השם המקורי מהקובץ לעולם לא משתנה — שינוי שם כאן נשמר בנפרד וישרוד ייבוא של גרסה מעודכנת של התוכנית."
        actions={
          <Button variant="default" leftSection={<IconRuler2 size={16} />} disabled>
            כיול קנה מידה
          </Button>
        }
      />

      <DataState
        loading={projectLoading || layersQuery.loading}
        error={projectError ?? layersQuery.error}
        empty={!project || layers.length === 0}
        emptyTitle={project ? 'אין עדיין שכבות' : 'אין עדיין פרויקטים'}
        emptyBody={
          project
            ? 'שכבות נוצרות בייבוא תוכנית. אחרי שהייבוא מסתיים, כל שכבה תופיע כאן עם הסיווג והראיות שהובילו אליו.'
            : 'צריך פרויקט אחד לפחות לפני שיש שכבות להציג.'
        }
        emptyAction={{ href: '/upload', label: 'למסך ההעלאה' }}
      >
        <Group mb="md" gap="sm" wrap="wrap">
          <TextInput
            placeholder="חיפוש שכבה"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={260}
          />
          <SegmentedControl
            value={filter}
            onChange={(v) => setFilter(v as typeof filter)}
            data={[
              { value: 'all', label: `הכול (${layers.length})` },
              { value: 'review', label: `לבדיקה (${needsReview})` },
              { value: 'billable', label: 'לתמחור' },
            ]}
          />
          <Group gap={6} ms="auto">
            <Text size="sm" c="dimmed">
              סווגו
            </Text>
            <Text size="sm" fw={600}>
              {classified}/{layers.length}
            </Text>
            <Progress
              value={layers.length ? (classified / layers.length) * 100 : 0}
              w={100}
              size="sm"
              color="verified"
            />
          </Group>
        </Group>

        <Card p={0}>
          <Table.ScrollContainer minWidth={900}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>שכבה</Table.Th>
                  <Table.Th w={190}>מקצוע</Table.Th>
                  <Table.Th w={110}>סוג מדידה</Table.Th>
                  <Table.Th w={130} ta="end">
                    כמות
                  </Table.Th>
                  <Table.Th w={150}>ביטחון וסימוכין</Table.Th>
                  <Table.Th w={60} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visible.map((layer) => {
                  const trade = layer.trade_id ? tradeById.get(layer.trade_id) : null;
                  const lowConfidence = layer.confidence < 0.7;
                  const quantity = quantities.get(layer.id);
                  return (
                    <Table.Tr key={layer.id} className={lowConfidence ? 'p2q-unverified' : undefined}>
                      <Table.Td>
                        <Stack gap={2}>
                          <TextInput
                            variant="unstyled"
                            value={names[layer.id] ?? layer.display_name ?? layer.source_name}
                            onChange={(e) => rename(layer.id, e.currentTarget.value)}
                            onBlur={(e) => commitRename(layer.id, e.currentTarget.value)}
                            styles={{ input: { fontWeight: 600, minHeight: 0, height: 22 } }}
                          />
                          <Group gap={6}>
                            <Text span className="p2q-source-name" c="dimmed">
                              {layer.source_name}
                            </Text>
                            <Text span size="xs" c="dimmed">
                              · {layer.entity_count} ישויות
                            </Text>
                            {!layer.plan_measurable && (
                              <Badge size="xs" color="caution" variant="light">
                                גיליון לא נמדד
                              </Badge>
                            )}
                          </Group>
                        </Stack>
                      </Table.Td>

                      <Table.Td>
                        <Select
                          size="xs"
                          variant="unstyled"
                          allowDeselect={false}
                          disabled={savingId === layer.id}
                          value={trade?.key ?? null}
                          placeholder="לא סווג"
                          onChange={(v) => v && reassign(layer, v as TradeCode)}
                          data={TRADES.map((t) => ({ value: t.code, label: t.he }))}
                          leftSection={
                            trade ? (
                              <Box
                                w={9}
                                h={9}
                                style={{ borderRadius: 3, background: trade.color, flexShrink: 0 }}
                              />
                            ) : undefined
                          }
                        />
                      </Table.Td>

                      <Table.Td>
                        <Badge variant="default" size="sm">
                          {MEASURE_LABEL[layer.measure_type]}
                        </Badge>
                      </Table.Td>

                      <Table.Td>
                        {trade?.billable ? (
                          <Group gap={4} justify="flex-end" wrap="nowrap">
                            <Text span className="p2q-numeric" fw={600}>
                              <NumberFormatter
                                value={quantity?.value ?? 0}
                                decimalScale={layer.measure_type === 'count' ? 0 : 2}
                                thousandSeparator
                              />
                            </Text>
                            <Text span size="xs" c="dimmed">
                              {quantity?.unit ?? ''}
                            </Text>
                          </Group>
                        ) : (
                          <Text size="xs" c="dimmed" ta="end">
                            לא נמדד
                          </Text>
                        )}
                      </Table.Td>

                      <Table.Td>
                        <HoverCard width={420} shadow="md" position="left" withArrow>
                          <HoverCard.Target>
                            <Group gap={6} wrap="nowrap" style={{ cursor: 'help' }}>
                              <Badge
                                size="sm"
                                color={
                                  layer.confidence >= 0.85
                                    ? 'verified'
                                    : layer.confidence >= 0.5
                                      ? 'caution'
                                      : 'alert'
                                }
                              >
                                {Math.round(layer.confidence * 100)}%
                              </Badge>
                              <Text size="xs" c="dimmed" truncate>
                                {SOURCE_LABEL[layer.classification_source] ?? layer.classification_source}
                              </Text>
                            </Group>
                          </HoverCard.Target>
                          <HoverCard.Dropdown>
                            <Text size="sm" fw={600} mb={6}>
                              למה זה סווג כך?
                            </Text>
                            {layer.evidence.length === 0 ? (
                              <Text size="sm" c="dimmed">
                                אין ראיות רשומות — שיוך ידני או ברירת מחדל.
                              </Text>
                            ) : (
                              <List size="sm" spacing={6}>
                                {layer.evidence.map((e, i) => (
                                  <List.Item
                                    key={i}
                                    icon={
                                      <ThemeIcon
                                        size={16}
                                        radius="xl"
                                        variant="light"
                                        color={e.weight >= 0.8 ? 'verified' : 'slate'}
                                      >
                                        <Text size="10px" fw={700}>
                                          {Math.round(e.weight * 10)}
                                        </Text>
                                      </ThemeIcon>
                                    }
                                  >
                                    {e.explanation}
                                  </List.Item>
                                ))}
                              </List>
                            )}
                          </HoverCard.Dropdown>
                        </HoverCard>
                      </Table.Td>

                      <Table.Td>
                        {!layer.plan_measurable && (
                          <Tooltip label="גיליון לא ניתן למדידה אוטומטית">
                            <ThemeIcon variant="light" color="caution" size="sm" radius="xl">
                              <IconInfoCircle size={13} />
                            </ThemeIcon>
                          </Tooltip>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>

        <Text size="xs" c="dimmed" mt="sm">
          כל מספר בטבלה הזו מגיע מחישוב שנשמר בייבוא, ולא מהערכה. שינוי מקצוע כאן משנה רק את
          השיוך; מדידה מחדש רצה בייבוא הבא.
        </Text>
      </DataState>

      {needsReview > 0 && layers.length > 0 && (
        <Alert
          variant="light"
          color="caution"
          icon={<IconAlertTriangle size={18} />}
          mt="md"
          title={`${needsReview} שכבות בביטחון נמוך`}
        >
          שכבות עם ביטחון מתחת ל-70% כדאי לבדוק ידנית — שיוך מקצוע כאן נשמר וישמש לזיהוי הבא של
          שכבה עם אותו שם.
        </Alert>
      )}
    </Box>
  );
}
