'use client';

import { useCallback, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Collapse,
  Group,
  HoverCard,
  List,
  Loader,
  Progress,
  Radio,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Dropzone } from '@mantine/dropzone';
import {
  IconAlertTriangle,
  IconBan,
  IconCheck,
  IconChevronDown,
  IconFileTypeXml,
  IconInfoCircle,
  IconTrash,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import { SHEET_KIND_LABEL } from '@plan2quote/classify';
import { FORMAT_GROUPS, FORMATS } from '@plan2quote/parsers';
import { PageHeader } from '@/components/PageHeader';
import {
  formatBytes,
  formatConflict,
  inspectFile,
  intentConflict,
  isReadableHere,
  UPLOAD_INTENTS,
  type FileInspection,
  type UploadIntent,
} from '@/lib/inspect';
import { DEMO_STRUCTURE } from '@/lib/demo';

/**
 * Multi-file upload.
 *
 * Three things happen here that happen nowhere else in the pipeline:
 *
 *   1. The user says what the set is *before* dropping it. That is a prior, not
 *      an override — detection still runs, and a disagreement is surfaced,
 *      because "I said these were floor plans" is exactly the situation in
 *      which a details sheet slips through unnoticed.
 *   2. Every file's format is decided from its first bytes. Renamed files are
 *      routine, and a `.dxf` that is really a PDF export otherwise fails as a
 *      "corrupt drawing".
 *   3. Every DXF is read here, in the tab, so its sheet kind is known before
 *      anybody assigns a trade to it.
 *
 * The customer's own set contains six waterproofing details at 1:5 and 1:10 on
 * a single sheet. Measured like a floor plan it yields a few hundred confident
 * square metres of hatched concrete that correspond to nothing at all, and
 * nothing about the result looks wrong. This screen is where that gets caught.
 */

type Row = {
  file: File;
  status: 'pending' | 'reading' | 'ready' | 'error';
  inspection?: FileInspection;
  duplicateOf?: string;
  floorId: string | null;
  include: boolean;
};

const FLOOR_OPTIONS = DEMO_STRUCTURE.buildings.flatMap((b) =>
  b.floors.map((f) => ({ value: `${b.name}|${f.level}`, label: `${b.name} · ${f.name}` })),
);

export default function UploadPage() {
  const [intent, setIntent] = useState<UploadIntent>('auto');
  const [rows, setRows] = useState<Row[]>([]);
  const [formatsOpen, formats] = useDisclosure(false);

  const addFiles = useCallback(
    async (dropped: File[]) => {
      const startIndex = rows.length;
      setRows((prev) => [
        ...prev,
        ...dropped.map((file) => ({ file, status: 'pending' as const, floorId: null, include: true })),
      ]);

      // Sequential rather than parallel. A set is often thirty files, and
      // reading thirty DXFs at once on the main thread makes the list unusable
      // exactly while the user is trying to read it.
      for (let i = 0; i < dropped.length; i++) {
        const index = startIndex + i;
        const file = dropped[i]!;
        setRows((prev) => prev.map((r, j) => (j === index ? { ...r, status: 'reading' } : r)));

        const inspection = await inspectFile(file);

        setRows((prev) => {
          const duplicate = prev.find(
            (r, j) => j !== index && r.inspection?.dedupeKey === inspection.dedupeKey,
          );
          const usable = FORMATS[inspection.format].support !== 'unsupported';
          return prev.map((r, j) =>
            j === index
              ? {
                  ...r,
                  inspection,
                  status: inspection.error ? 'error' : 'ready',
                  include: !duplicate && !inspection.error && usable,
                  ...(duplicate ? { duplicateOf: duplicate.file.name } : {}),
                  floorId: inspection.floorGuess
                    ? (FLOOR_OPTIONS.find((o) => o.value.endsWith(`|${inspection.floorGuess!.level}`))
                        ?.value ?? null)
                    : null,
                }
              : r,
          );
        });
      }
    },
    [rows.length],
  );

  const ready = rows.filter((r) => r.status === 'ready');
  const included = rows.filter((r) => r.include);
  const unmeasurable = ready.filter((r) => r.inspection?.sheet && !r.inspection.sheet.measurable);
  const duplicates = rows.filter((r) => r.duplicateOf);
  const queued = rows.filter((r) => r.inspection && !isReadableHere(r.inspection.format));
  const mismatched = rows.filter((r) => r.inspection?.detection.mismatch);
  const unsupported = rows.filter(
    (r) => r.inspection && FORMATS[r.inspection.format].support === 'unsupported',
  );

  return (
    <Box>
      <PageHeader
        title="העלאת תוכניות"
        description="קודם בוחרים מה מעלים, ואז גוררים את כל הסט בבת אחת. כל קובץ מזוהה לפי תוכנו ולא לפי הסיומת, וקבצי DXF נקראים כאן בדפדפן ומסווגים מיד."
        actions={
          rows.length > 0 ? (
            <Group gap="xs">
              <Button variant="default" onClick={() => setRows([])}>
                ניקוי
              </Button>
              <Button disabled={included.length === 0} leftSection={<IconUpload size={16} />}>
                ייבוא {included.length} קבצים
              </Button>
            </Group>
          ) : null
        }
      />

      {/* ------------------------------------------------- step 1: intent */}
      <Card mb="md">
        <Group gap="sm" mb="xs">
          <Badge variant="filled" size="sm" circle>
            1
          </Badge>
          <Text fw={600}>מה אתה מעלה?</Text>
        </Group>
        <Text size="sm" c="dimmed" mb="md">
          הבחירה הזו לא עוקפת את הזיהוי — היא רק אומרת למערכת מה לצפות. אם קובץ יתגלה כמשהו אחר,
          תופיע התראה על השורה שלו.
        </Text>

        <Radio.Group value={intent} onChange={(v) => setIntent(v as UploadIntent)}>
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="sm">
            {UPLOAD_INTENTS.map((option) => (
              <Card
                key={option.value}
                withBorder
                padding="sm"
                radius="md"
                style={{
                  cursor: 'pointer',
                  borderColor: intent === option.value ? 'var(--mantine-color-ink-5)' : undefined,
                  borderWidth: intent === option.value ? 2 : 1,
                }}
                onClick={() => setIntent(option.value)}
              >
                <Radio
                  value={option.value}
                  label={
                    <Text fw={600} size="sm">
                      {option.label}
                    </Text>
                  }
                  description={option.description}
                  styles={{ description: { marginTop: 4 } }}
                />
              </Card>
            ))}
          </SimpleGrid>
        </Radio.Group>

        <Button
          variant="subtle"
          size="xs"
          color="slate"
          mt="md"
          rightSection={<IconChevronDown size={14} />}
          onClick={formats.toggle}
        >
          {formatsOpen ? 'הסתר פורמטים' : 'אילו פורמטים נתמכים?'}
        </Button>

        <Collapse in={formatsOpen}>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mt="sm">
            {FORMAT_GROUPS.map((group) => (
              <Box key={group.title}>
                <Text fw={600} size="sm" mb={6}>
                  {group.title}
                </Text>
                <Stack gap={8}>
                  {group.formats.map((format) => {
                    const info = FORMATS[format];
                    return (
                      <Group key={format} gap={8} align="flex-start" wrap="nowrap">
                        <Badge
                          size="xs"
                          mt={2}
                          color={
                            info.support === 'client'
                              ? 'verified'
                              : info.support === 'worker'
                                ? 'ink'
                                : 'slate'
                          }
                        >
                          {info.support === 'client'
                            ? 'מיידי'
                            : info.support === 'worker'
                              ? 'עיבוד'
                              : 'עזר'}
                        </Badge>
                        <Box>
                          <Text size="sm" fw={500}>
                            {info.label}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {info.note}
                          </Text>
                        </Box>
                      </Group>
                    );
                  })}
                </Stack>
              </Box>
            ))}
          </SimpleGrid>
        </Collapse>
      </Card>

      {/* --------------------------------------------------- step 2: files */}
      <Group gap="sm" mb="xs">
        <Badge variant="filled" size="sm" circle>
          2
        </Badge>
        <Text fw={600}>הקבצים</Text>
      </Group>

      {/*
        No `accept` filter, and `useFsAccessApi` off, both on purpose.

        Browsers report an empty or generic MIME type for .dxf, .dwg and .ifc,
        so a MIME-based accept list silently drops exactly the files this
        product exists to read — the file simply never appears in the list. And
        react-dropzone prefers Chromium's `showOpenFilePicker`, which is
        Chromium-only and takes that same MIME-typed accept list. The plain
        input behaves identically in every browser; unsupported files get a
        visible row saying so.
      */}
      <Dropzone
        onDrop={addFiles}
        maxSize={500 * 1024 ** 2}
        multiple
        useFsAccessApi={false}
        mb="lg"
        radius="lg"
        className="p2q-grid-bg"
        styles={{ inner: { pointerEvents: 'none' } }}
      >
        <Stack align="center" gap={6} py="xl">
          <Dropzone.Accept>
            <ThemeIcon size={48} radius="xl" variant="light" color="verified">
              <IconUpload size={24} />
            </ThemeIcon>
          </Dropzone.Accept>
          <Dropzone.Reject>
            <ThemeIcon size={48} radius="xl" variant="light" color="alert">
              <IconX size={24} />
            </ThemeIcon>
          </Dropzone.Reject>
          <Dropzone.Idle>
            <ThemeIcon size={48} radius="xl" variant="light" color="slate">
              <IconFileTypeXml size={24} />
            </ThemeIcon>
          </Dropzone.Idle>

          <Text fw={600} size="lg">
            גרור לכאן את כל הגיליונות
          </Text>
          <Text size="sm" c="dimmed" ta="center" maw="56ch">
            אפשר לבחור כמה קבצים יחד. עד 500MB לקובץ, בלי הגבלת כמות. שום קובץ לא נשלח לשרת עד
            שתלחץ ״ייבוא״.
          </Text>
        </Stack>
      </Dropzone>

      {unsupported.length > 0 && (
        <Alert
          variant="light"
          color="alert"
          icon={<IconX size={18} />}
          mb="md"
          title={`${unsupported.length} קבצים לא זוהו`}
        >
          לא ניתן היה לזהות אותם לא לפי הסיומת ולא לפי תוכנם. הם לא סומנו לייבוא.
        </Alert>
      )}

      {mismatched.length > 0 && (
        <Alert
          variant="light"
          color="caution"
          icon={<IconAlertTriangle size={18} />}
          mb="md"
          title={`${mismatched.length} קבצים ששמם לא תואם את תוכנם`}
        >
          הסיומת אומרת דבר אחד והבייטים אומרים דבר אחר. המערכת הולכת לפי התוכן — זה בדרך כלל תקין
          לגמרי, אבל שווה לדעת.
        </Alert>
      )}

      {unmeasurable.length > 0 && (
        <Alert
          variant="light"
          color="caution"
          icon={<IconAlertTriangle size={18} />}
          mb="md"
          title={`${unmeasurable.length} גיליונות סומנו כלא ניתנים למדידה`}
        >
          גיליונות פרטים, חתכים וחזיתות נראים למנוע מדידה בדיוק כמו תוכנית קומה, אבל ההצללות שבהם
          אינן שטחים אמיתיים. הם ייובאו ויוצגו, אך לא ייכנסו לכתב הכמויות עד שתסמן אותם ידנית.
        </Alert>
      )}

      {duplicates.length > 0 && (
        <Alert variant="light" color="slate" icon={<IconInfoCircle size={18} />} mb="md">
          {duplicates.length} קבצים זהים לחלוטין לקבצים אחרים בסט ולא סומנו לייבוא.
        </Alert>
      )}

      {queued.length > 0 && (
        <Alert variant="light" color="slate" icon={<IconInfoCircle size={18} />} mb="md">
          {queued.length} קבצים דורשים עיבוד בשרת. סוג הגיליון וקנה המידה שלהם ייקבעו אחרי הייבוא.
        </Alert>
      )}

      {rows.length > 0 && (
        <Card p={0}>
          <Table.ScrollContainer minWidth={1040}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={44} />
                  <Table.Th>קובץ</Table.Th>
                  <Table.Th w={150}>פורמט</Table.Th>
                  <Table.Th w={150}>סוג גיליון</Table.Th>
                  <Table.Th w={180}>שיוך לקומה</Table.Th>
                  <Table.Th w={130}>קנה מידה</Table.Th>
                  <Table.Th w={80} ta="end">
                    שכבות
                  </Table.Th>
                  <Table.Th w={50} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row, index) => (
                  <FileRow
                    key={`${row.file.name}-${index}`}
                    row={row}
                    intent={intent}
                    onToggle={(include) =>
                      setRows((prev) => prev.map((r, j) => (j === index ? { ...r, include } : r)))
                    }
                    onFloor={(floorId) =>
                      setRows((prev) => prev.map((r, j) => (j === index ? { ...r, floorId } : r)))
                    }
                    onRemove={() => setRows((prev) => prev.filter((_, j) => j !== index))}
                  />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      {rows.length > 0 && (
        <Group justify="space-between" mt="sm">
          <Text size="xs" c="dimmed">
            {ready.length}/{rows.length} נקראו · {included.length} מסומנים לייבוא
          </Text>
          <Progress value={(ready.length / rows.length) * 100} w={200} size="sm" color="verified" />
        </Group>
      )}
    </Box>
  );
}

function FileRow({
  row,
  intent,
  onToggle,
  onFloor,
  onRemove,
}: {
  row: Row;
  intent: UploadIntent;
  onToggle: (include: boolean) => void;
  onFloor: (floorId: string | null) => void;
  onRemove: () => void;
}) {
  const { inspection } = row;
  const sheet = inspection?.sheet;
  const scale = inspection?.plan?.scale;
  const info = inspection ? FORMATS[inspection.format] : null;
  const sheetConflict = intentConflict(intent, sheet);
  const fmtConflict = inspection ? formatConflict(intent, inspection.format) : null;
  const flagged = Boolean(sheetConflict || fmtConflict || (sheet && !sheet.measurable));

  return (
    <Table.Tr className={flagged ? 'p2q-unverified' : undefined}>
      <Table.Td>
        <Checkbox
          checked={row.include}
          disabled={row.status === 'error' || info?.support === 'unsupported'}
          onChange={(e) => onToggle(e.currentTarget.checked)}
          aria-label="לכלול בייבוא"
        />
      </Table.Td>

      <Table.Td>
        <Stack gap={2}>
          <Group gap={8} wrap="nowrap">
            <Text fw={600} size="sm" truncate>
              {row.file.name}
            </Text>
            {row.duplicateOf && (
              <Tooltip label={`זהה ל-${row.duplicateOf}`}>
                <Badge size="xs" color="slate">
                  כפילות
                </Badge>
              </Tooltip>
            )}
          </Group>
          <Group gap={6}>
            <Text size="xs" c="dimmed">
              {formatBytes(row.file.size)}
            </Text>
            {row.status === 'reading' && (
              <Group gap={4}>
                <Loader size={10} />
                <Text size="xs" c="dimmed">
                  קורא…
                </Text>
              </Group>
            )}
            {row.status === 'error' && (
              <Text size="xs" c="alert.6">
                {inspection?.error}
              </Text>
            )}
          </Group>
          {sheetConflict && (
            <Text size="xs" c="caution.7">
              {sheetConflict}
            </Text>
          )}
          {fmtConflict && (
            <Text size="xs" c="caution.7">
              {fmtConflict}
            </Text>
          )}
        </Stack>
      </Table.Td>

      <Table.Td>
        {info && inspection ? (
          <HoverCard width={380} shadow="md" position="left" withArrow>
            <HoverCard.Target>
              <Badge
                size="sm"
                style={{ cursor: 'help' }}
                variant={inspection.detection.mismatch ? 'filled' : 'light'}
                color={
                  info.support === 'unsupported'
                    ? 'alert'
                    : inspection.detection.mismatch
                      ? 'caution'
                      : info.support === 'client'
                        ? 'verified'
                        : 'slate'
                }
              >
                {info.label.split(' — ')[0]}
              </Badge>
            </HoverCard.Target>
            <HoverCard.Dropdown>
              <Text size="sm" fw={600} mb={4}>
                {info.label}
              </Text>
              <Text size="sm" mb={6}>
                {inspection.detection.explanation}
              </Text>
              <Text size="sm" c="dimmed">
                {info.note}
              </Text>
            </HoverCard.Dropdown>
          </HoverCard>
        ) : (
          <Text size="xs" c="dimmed">
            —
          </Text>
        )}
      </Table.Td>

      <Table.Td>
        {sheet ? (
          <HoverCard width={420} shadow="md" position="left" withArrow>
            <HoverCard.Target>
              <Group gap={6} wrap="nowrap" style={{ cursor: 'help' }}>
                <Badge size="sm" color={sheet.measurable ? 'verified' : 'caution'}>
                  {SHEET_KIND_LABEL[sheet.kind]}
                </Badge>
                {!sheet.measurable && (
                  <ThemeIcon size="xs" radius="xl" variant="light" color="caution">
                    <IconBan size={10} />
                  </ThemeIcon>
                )}
              </Group>
            </HoverCard.Target>
            <HoverCard.Dropdown>
              <Text size="sm" fw={600} mb={6}>
                {sheet.measurable ? 'ניתן למדידה' : 'לא ניתן למדידה אוטומטית'}
              </Text>
              <List size="sm" spacing={6}>
                {sheet.reasons.map((reason, i) => (
                  <List.Item
                    key={i}
                    icon={
                      <ThemeIcon
                        size={16}
                        radius="xl"
                        variant="light"
                        color={sheet.measurable ? 'verified' : 'caution'}
                      >
                        {sheet.measurable ? <IconCheck size={10} /> : <IconAlertTriangle size={10} />}
                      </ThemeIcon>
                    }
                  >
                    {reason}
                  </List.Item>
                ))}
              </List>
            </HoverCard.Dropdown>
          </HoverCard>
        ) : (
          <Text size="xs" c="dimmed">
            {row.status === 'reading' ? '—' : 'ייקבע בשרת'}
          </Text>
        )}
      </Table.Td>

      <Table.Td>
        <Select
          size="xs"
          variant="unstyled"
          placeholder="בחר קומה"
          value={row.floorId}
          onChange={onFloor}
          data={FLOOR_OPTIONS}
          searchable
          clearable
        />
        {inspection?.floorGuess && (
          <Text size="xs" c="dimmed">
            זוהה משם הקובץ: {inspection.floorGuess.label}
          </Text>
        )}
      </Table.Td>

      <Table.Td>
        {scale ? (
          <Stack gap={0}>
            <Badge
              size="sm"
              color={scale.confidence >= 0.9 ? 'verified' : scale.confidence > 0 ? 'caution' : 'alert'}
            >
              {scale.source === 'native_units'
                ? `יחידות ${scale.unit}`
                : scale.source === 'dimension_inference'
                  ? 'הוסק ממידות'
                  : 'לא ידוע'}
            </Badge>
            {sheet && sheet.scaleNotations.length > 1 && (
              <Text size="xs" c="caution.7">
                {sheet.scaleNotations.join(', ')}
              </Text>
            )}
          </Stack>
        ) : (
          <Text size="xs" c="dimmed">
            —
          </Text>
        )}
      </Table.Td>

      <Table.Td ta="end">
        <Text size="sm" className="p2q-numeric">
          {inspection?.plan ? inspection.plan.layers.length : '—'}
        </Text>
      </Table.Td>

      <Table.Td>
        <ActionIcon variant="subtle" color="slate" size="sm" onClick={onRemove} aria-label="הסרה">
          <IconTrash size={14} />
        </ActionIcon>
      </Table.Td>
    </Table.Tr>
  );
}
