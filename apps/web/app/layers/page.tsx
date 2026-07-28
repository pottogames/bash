'use client';

import { useMemo, useState } from 'react';
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
  IconCheck,
  IconInfoCircle,
  IconRuler2,
  IconSearch,
} from '@tabler/icons-react';
import { classifyLayer, type OrgRule } from '@plan2quote/classify';
import { measure } from '@plan2quote/geometry';
import { DEFAULT_UNIT_FOR_MEASURE, TRADES, tradeMeta, type MeasureType, type TradeCode } from '@plan2quote/core';
import { PageHeader } from '@/components/PageHeader';
import { DEMO_LAYERS } from '@/lib/demo';

const MEASURE_LABEL: Record<MeasureType, string> = {
  length: 'אורך',
  area: 'שטח',
  volume: 'נפח',
  count: 'ספירה',
  weight: 'משקל',
};

const SOURCE_LABEL = {
  org_rule: 'כלל ארגוני',
  layer_standard: 'תקן שכבות',
  keyword: 'מילון מונחים',
  geometry_hint: 'תוכן השכבה',
  manual: 'שיוך ידני',
  none: 'לא זוהה',
} as const;

export default function LayersPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'review' | 'billable'>('all');
  const [overrides, setOverrides] = useState<Record<string, TradeCode>>({});
  const [names, setNames] = useState<Record<string, string>>({});

  // Organisation rules would come from `classification_rules`. Corrections made
  // on this screen become rows there, which is why the same layer name never
  // needs correcting twice.
  const orgRules: OrgRule[] = useMemo(() => [], []);

  const rows = useMemo(
    () =>
      DEMO_LAYERS.map((layer) => {
        const manual = overrides[layer.sourceKey];
        const classification = classifyLayer({
          sourceKey: layer.sourceKey,
          sourceName: layer.sourceName,
          entities: layer.entities,
          orgRules,
          ...(manual
            ? {
                manual: {
                  trade: manual,
                  measureType: tradeMeta(manual).defaultMeasure as MeasureType,
                },
              }
            : {}),
        });

        const measurement = measure(layer.entities, { measureType: classification.measureType });

        return { layer, classification, measurement };
      }),
    [overrides, orgRules],
  );

  const visible = rows.filter(({ layer, classification }) => {
    const name = names[layer.sourceKey] ?? layer.sourceName;
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'review') return classification.confidence < 0.7;
    if (filter === 'billable') return tradeMeta(classification.trade).billable;
    return true;
  });

  const needsReview = rows.filter((r) => r.classification.confidence < 0.7).length;
  const classified = rows.length - rows.filter((r) => r.classification.trade === 'unassigned').length;

  return (
    <Box>
      <PageHeader
        title="ניהול שכבות"
        description="כל שכבה מהקובץ, מה זוהה ולמה. השם המקורי מהקובץ לעולם לא משתנה — שינוי שם כאן נשמר בנפרד וישרוד ייבוא של גרסה מעודכנת של התוכנית."
        actions={
          <Button variant="default" leftSection={<IconRuler2 size={16} />}>
            כיול קנה מידה
          </Button>
        }
      />

      <Alert
        variant="light"
        color="verified"
        icon={<IconCheck size={18} />}
        mb="md"
        title="קנה מידה נקרא מהקובץ"
      >
        הקובץ מצהיר על יחידות מילימטר בכותרת ($INSUNITS). 7 מתוך 7 מידות בתוכנית תואמות להצהרה הזו —
        לא נדרשה שום הערכה, וכל המספרים למטה נגזרים ישירות מהגאומטריה.
      </Alert>

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
            { value: 'all', label: `הכול (${rows.length})` },
            { value: 'review', label: `לבדיקה (${needsReview})` },
            { value: 'billable', label: 'לתמחור' },
          ]}
        />
        <Group gap={6} ms="auto">
          <Text size="sm" c="dimmed">
            סווגו אוטומטית
          </Text>
          <Text size="sm" fw={600}>
            {classified}/{rows.length}
          </Text>
          <Progress value={(classified / rows.length) * 100} w={100} size="sm" color="verified" />
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
              {visible.map(({ layer, classification, measurement }) => {
                const meta = tradeMeta(classification.trade);
                const lowConfidence = classification.confidence < 0.7;
                return (
                  <Table.Tr key={layer.sourceKey} className={lowConfidence ? 'p2q-unverified' : undefined}>
                    <Table.Td>
                      <Stack gap={2}>
                        <TextInput
                          variant="unstyled"
                          value={names[layer.sourceKey] ?? layer.sourceName}
                          onChange={(e) =>
                            setNames((prev) => ({ ...prev, [layer.sourceKey]: e.currentTarget.value }))
                          }
                          styles={{ input: { fontWeight: 600, minHeight: 0, height: 22 } }}
                        />
                        <Group gap={6}>
                          <Text span className="p2q-source-name" c="dimmed">
                            {layer.sourceName}
                          </Text>
                          <Text span size="xs" c="dimmed">
                            · {layer.entities.length} ישויות
                          </Text>
                        </Group>
                      </Stack>
                    </Table.Td>

                    <Table.Td>
                      <Select
                        size="xs"
                        variant="unstyled"
                        allowDeselect={false}
                        value={classification.trade}
                        onChange={(v) =>
                          v && setOverrides((prev) => ({ ...prev, [layer.sourceKey]: v as TradeCode }))
                        }
                        data={TRADES.map((t) => ({ value: t.code, label: t.he }))}
                        leftSection={
                          <Box
                            w={9}
                            h={9}
                            style={{ borderRadius: 3, background: meta.color, flexShrink: 0 }}
                          />
                        }
                      />
                    </Table.Td>

                    <Table.Td>
                      <Badge variant="default" size="sm">
                        {MEASURE_LABEL[classification.measureType]}
                      </Badge>
                    </Table.Td>

                    <Table.Td>
                      {meta.billable ? (
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          <Text span className="p2q-numeric" fw={600}>
                            <NumberFormatter
                              value={measurement.value}
                              decimalScale={classification.measureType === 'count' ? 0 : 2}
                              thousandSeparator
                            />
                          </Text>
                          <Text span size="xs" c="dimmed">
                            {DEFAULT_UNIT_FOR_MEASURE[classification.measureType]}
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
                                classification.confidence >= 0.85
                                  ? 'verified'
                                  : classification.confidence >= 0.5
                                    ? 'caution'
                                    : 'alert'
                              }
                            >
                              {Math.round(classification.confidence * 100)}%
                            </Badge>
                            <Text size="xs" c="dimmed" truncate>
                              {SOURCE_LABEL[classification.source]}
                            </Text>
                          </Group>
                        </HoverCard.Target>
                        <HoverCard.Dropdown>
                          <Text size="sm" fw={600} mb={6}>
                            למה זה סווג כך?
                          </Text>
                          <List size="sm" spacing={6}>
                            {classification.evidence.map((e, i) => (
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
                          {measurement.warnings.length > 0 && (
                            <>
                              <Text size="sm" fw={600} mt="sm" mb={6}>
                                הערות על המדידה
                              </Text>
                              <List size="sm" spacing={4}>
                                {measurement.warnings.map((w, i) => (
                                  <List.Item
                                    key={i}
                                    icon={
                                      <ThemeIcon size={16} radius="xl" variant="light" color="caution">
                                        <IconAlertTriangle size={10} />
                                      </ThemeIcon>
                                    }
                                  >
                                    {w.message}
                                  </List.Item>
                                ))}
                              </List>
                            </>
                          )}
                        </HoverCard.Dropdown>
                      </HoverCard>
                    </Table.Td>

                    <Table.Td>
                      {measurement.warnings.length > 0 && (
                        <Tooltip label={`${measurement.warnings.length} הערות על המדידה`}>
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
        כל מספר בטבלה הזו מגיע מסכימה גאומטרית של ישויות מהקובץ, ולא מהערכה. לחיצה על שורת כמות
        תסמן על התוכנית בדיוק את הצורות שהרכיבו אותה.
      </Text>
    </Box>
  );
}
