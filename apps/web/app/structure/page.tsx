'use client';

import {
  Badge,
  Box,
  Card,
  Group,
  NumberFormatter,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconBuilding, IconCopy, IconLayoutGrid, IconStack2 } from '@tabler/icons-react';
import { PageHeader } from '@/components/PageHeader';
import { DEMO_STRUCTURE } from '@/lib/demo';

const ZONE_LABEL: Record<string, string> = {
  apartment: 'דירה',
  lobby: 'לובי',
  parking: 'חניון',
  core: 'ליבה',
  shaft: 'פיר',
  storage: 'מחסן',
  commercial: 'מסחר',
  technical: 'טכני',
  shelter: 'ממ״ד',
  roof: 'גג',
  outdoor: 'חוץ',
  common: 'משותף',
};

const ZONE_COLOR: Record<string, string> = {
  apartment: 'ink',
  lobby: 'verified',
  parking: 'slate',
  core: 'slate',
  commercial: 'caution',
  technical: 'slate',
  storage: 'slate',
  roof: 'verified',
  common: 'slate',
};

export default function StructurePage() {
  const { project, buildings } = DEMO_STRUCTURE;

  const totalFloors = buildings.reduce(
    (sum, b) => sum + b.floors.reduce((s, f) => s + f.repeatCount, 0),
    0,
  );
  const totalZones = buildings.reduce(
    (sum, b) => sum + b.floors.reduce((s, f) => s + f.zones.length * f.repeatCount, 0),
    0,
  );
  const totalArea = buildings.reduce(
    (sum, b) => sum + b.floors.reduce((s, f) => s + f.grossArea * f.repeatCount, 0),
    0,
  );

  return (
    <Box>
      <PageHeader
        title="מבנה הפרויקט"
        description="כל כמות במערכת נתלית על הרמה העמוקה ביותר שידועה לגביה, ומתגלגלת כלפי מעלה. ככה אותה מדידה עונה גם על ״כמה ריצוף בפרויקט״ וגם על ״כמה ריצוף בדירה B בקומה 5״ — בלי להיספר פעמיים."
      />

      <Card mb="lg">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
          <Stack gap={2}>
            <Title order={3}>{project.name}</Title>
            <Text size="sm" c="dimmed">
              {project.client} · {project.city}
            </Text>
          </Stack>
          <Group gap="xl">
            <Metric label="מבנים" value={buildings.length} />
            <Metric label="קומות" value={totalFloors} />
            <Metric label="אזורים" value={totalZones} />
            <Metric label="שטח ברוטו" value={totalArea} unit="מ״ר" decimals={0} />
            <Metric label="גובה קומה" value={project.storeyHeight} unit="מ׳" decimals={2} />
          </Group>
        </Group>
      </Card>

      {buildings.map((building) => (
        <Box key={building.name} mb="xl">
          <Group gap="sm" mb="md">
            <ThemeIcon variant="light" size="lg" radius="md">
              <IconBuilding size={20} />
            </ThemeIcon>
            <Title order={2}>{building.name}</Title>
          </Group>

          <Stack gap="md">
            {[...building.floors]
              .sort((a, b) => b.level - a.level)
              .map((floor) => (
                <Card key={floor.name} padding="md">
                  <Group justify="space-between" align="flex-start" mb="sm" wrap="wrap">
                    <Group gap="sm">
                      <Paper
                        withBorder
                        radius="md"
                        w={44}
                        h={44}
                        style={{ display: 'grid', placeItems: 'center' }}
                      >
                        <Text fw={700} size="lg" className="p2q-numeric">
                          {floor.level}
                        </Text>
                      </Paper>
                      <Stack gap={2}>
                        <Group gap={8}>
                          <Text fw={600}>{floor.name}</Text>
                          {floor.repeatCount > 1 && (
                            <Badge
                              color="caution"
                              size="sm"
                              leftSection={<IconCopy size={11} />}
                            >
                              קומה טיפוסית ×{floor.repeatCount}
                            </Badge>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {floor.zones.length} אזורים ·{' '}
                          <NumberFormatter value={floor.grossArea} thousandSeparator /> מ״ר ברוטו
                          {floor.repeatCount > 1 && (
                            <>
                              {' '}· סה״כ{' '}
                              <NumberFormatter
                                value={floor.grossArea * floor.repeatCount}
                                thousandSeparator
                              />{' '}
                              מ״ר
                            </>
                          )}
                        </Text>
                      </Stack>
                    </Group>
                  </Group>

                  {floor.repeatCount > 1 && (
                    <Text size="xs" c="dimmed" mb="xs">
                      הקומה נשמרת פעם אחת, והכמויות שלה מוכפלות ב-{floor.repeatCount}. תיקון מדידה
                      כאן מתקן את כל {floor.repeatCount} הקומות — זו כל הסיבה שקומה טיפוסית קיימת
                      כמושג.
                    </Text>
                  )}

                  <Table striped withRowBorders={false}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>אזור</Table.Th>
                        <Table.Th w={110}>סוג</Table.Th>
                        <Table.Th w={110} ta="end">
                          שטח נטו
                        </Table.Th>
                        <Table.Th w={90} ta="end">
                          חדרים
                        </Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {floor.zones.map((zone) => (
                        <Table.Tr key={zone.name}>
                          <Table.Td>
                            <Text size="sm" fw={500}>
                              {zone.name}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge size="sm" variant="light" color={ZONE_COLOR[zone.kind] ?? 'slate'}>
                              {ZONE_LABEL[zone.kind] ?? zone.kind}
                            </Badge>
                          </Table.Td>
                          <Table.Td ta="end">
                            <Text size="sm" className="p2q-numeric">
                              <NumberFormatter value={zone.netArea} thousandSeparator /> מ״ר
                            </Text>
                          </Table.Td>
                          <Table.Td ta="end">
                            <Text size="sm" className="p2q-numeric" c={zone.roomCount ? undefined : 'dimmed'}>
                              {zone.roomCount ?? '—'}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Card>
              ))}
          </Stack>
        </Box>
      ))}

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <HelpCard
          icon={<IconStack2 size={18} />}
          title="למה קומה ולא רק פרויקט"
          body="קבלן מוזמן לקומה בשבוע מסוים, לא לפרויקט. חבילת עבודה שנשלחת אליו חייבת להיות מוגבלת לקומות שהוא באמת עובד בהן, אחרת הוא מתמחר עבודה שלא יבצע."
        />
        <HelpCard
          icon={<IconLayoutGrid size={18} />}
          title="למה אזור ולא רק קומה"
          body="לקוח שואל ״כמה עולה דירה B״, ולא ״כמה עולה קומה 5״. אזור הוא היחידה שנמסרת ללקוח, ולכן הרמה שבה הצעת מחיר צריכה לדעת לסכם."
        />
        <HelpCard
          icon={<IconCopy size={18} />}
          title="למה חלל הוא אופציונלי"
          body="פירוט לפי חדר משתלם רק כשהגמר משתנה בין חדר לחדר. בפרויקט עם מפרט אחיד הוא מוסיף מאות שורות בלי להוסיף שום מידע."
        />
      </SimpleGrid>
    </Box>
  );
}

function Metric({
  label,
  value,
  unit,
  decimals = 0,
}: {
  label: string;
  value: number;
  unit?: string;
  decimals?: number;
}) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Group gap={4} align="baseline">
        <Text fw={700} size="xl" className="p2q-numeric">
          <NumberFormatter value={value} decimalScale={decimals} thousandSeparator />
        </Text>
        {unit ? (
          <Text size="xs" c="dimmed">
            {unit}
          </Text>
        ) : null}
      </Group>
    </Stack>
  );
}

function HelpCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card padding="md">
      <Group gap="sm" mb={6}>
        <ThemeIcon variant="light" color="slate" size="md" radius="md">
          {icon}
        </ThemeIcon>
        <Text fw={600} size="sm">
          {title}
        </Text>
      </Group>
      <Text size="sm" c="dimmed">
        {body}
      </Text>
    </Card>
  );
}
