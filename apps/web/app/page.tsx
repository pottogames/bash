'use client';

import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  NumberFormatter,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Timeline,
  Title,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconCalculator,
  IconFileUpload,
  IconLayersSubtract,
  IconPackages,
  IconReceipt2,
} from '@tabler/icons-react';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { DataState } from '@/components/DataState';
import { fetchProjects } from '@/lib/queries';
import { useQuery } from '@/lib/use-query';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: 'טיוטה', color: 'slate' },
  takeoff: { label: 'כתב כמויות', color: 'ink' },
  quoting: { label: 'הצעת מחיר', color: 'verified' },
  tendering: { label: 'מכרז קבלנים', color: 'caution' },
  awarded: { label: 'נמסר לביצוע', color: 'verified' },
  in_progress: { label: 'בביצוע', color: 'ink' },
  completed: { label: 'הושלם', color: 'slate' },
  archived: { label: 'בארכיון', color: 'slate' },
};

export default function HomePage() {
  const { data, loading, error } = useQuery(fetchProjects, []);
  const projects = data ?? [];

  return (
    <Box>
      <PageHeader
        title="פרויקטים"
        description="כל פרויקט מתחיל בתוכנית ונגמר בחבילות עבודה, כשכל גורם רואה רק את החלק שלו."
        actions={
          <Button component={Link} href="/upload" leftSection={<IconFileUpload size={16} />}>
            העלאת תוכניות
          </Button>
        }
      />

      <DataState
        loading={loading}
        error={error}
        empty={projects.length === 0}
        emptyTitle="אין עדיין פרויקטים"
        emptyBody="פרויקט נוצר לפני העלאת תוכניות, כדי שיהיה לאן לשייך את הקומות והכמויות. אפשר ליצור אחד דרך seed.sql או ישירות במסד הנתונים."
        emptyAction={{ href: '/upload', label: 'למסך ההעלאה' }}
      >
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" mb="xl">
          {projects.map((project) => {
            const status = STATUS_LABEL[project.status] ?? { label: project.status, color: 'slate' };
            return (
              <Card
                key={project.id}
                component={Link}
                href={`/structure?project=${project.id}`}
                style={{ textDecoration: 'none' }}
              >
                <Group justify="space-between" align="flex-start" mb="xs">
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Text fw={600}>{project.name}</Text>
                    <Text size="xs" c="dimmed">
                      {project.client_name ?? 'ללא לקוח'}
                      {project.city ? ` · ${project.city}` : ''}
                    </Text>
                  </Stack>
                  <Badge color={status.color} size="sm">
                    {status.label}
                  </Badge>
                </Group>

                <Group justify="space-between" mt="sm">
                  <Text size="xs" c="dimmed">
                    {project.code ? `מס׳ עבודה ${project.code}` : '—'}
                    {project.default_storey_height_m ? (
                      <>
                        {' · גובה קומה '}
                        <NumberFormatter value={project.default_storey_height_m} decimalScale={2} />
                        {' מ׳'}
                      </>
                    ) : null}
                  </Text>
                  <Group gap={4}>
                    <Text size="xs" c="dimmed">
                      פתיחה
                    </Text>
                    <IconArrowLeft size={13} />
                  </Group>
                </Group>
              </Card>
            );
          })}
        </SimpleGrid>
      </DataState>

      <Card mt="xl">
        <Title order={3} mb="md">
          איך זה עובד
        </Title>
        <Timeline active={5} bulletSize={26} lineWidth={2}>
          <Timeline.Item bullet={<IconFileUpload size={13} />} title="קריאת התוכנית">
            <Text size="sm" c="dimmed">
              DXF/DWG, PDF וקטורי, IFC או סריקה. השכבות נקראות מטבלת השכבות של הקובץ עצמו, וקנה
              המידה נלקח מהכותרת ומאומת מול המידות שבתוכנית.
            </Text>
          </Timeline.Item>
          <Timeline.Item bullet={<IconLayersSubtract size={13} />} title="סיווג שכבות למקצועות">
            <Text size="sm" c="dimmed">
              מילון מונחים בעברית ובאנגלית, תקני שמות שכבות (AIA/ISO), וראיות מתוכן השכבה. כל סיווג
              מגיע עם המשפט המדויק שגרם לו, וכל תיקון שלך נשמר ככלל ומשמש בייבוא הבא.
            </Text>
          </Timeline.Item>
          <Timeline.Item bullet={<IconCalculator size={13} />} title="כתב כמויות">
            <Text size="sm" c="dimmed">
              שטח, אורך, נפח וספירה — חישוב גאומטרי מדויק, כולל הפחתת פירים וחורים, קשתות אמיתיות
              וזיהוי ישויות כפולות. כל שורה מצביעה על הישויות שהרכיבו אותה.
            </Text>
          </Timeline.Item>
          <Timeline.Item bullet={<IconReceipt2 size={13} />} title="הצעת מחיר">
            <Text size="sm" c="dimmed">
              מחירון, מרווחים וגרסאות. עלויות ומחירי מכירה יושבים בטבלאות נפרדות, כך שהצעה ללקוח
              לא יכולה לחשוף מה אתה משלם לקבלנים.
            </Text>
          </Timeline.Item>
          <Timeline.Item bullet={<IconPackages size={13} />} title="חלוקה לגורמים">
            <Text size="sm" c="dimmed">
              כל גורם מקבל משתמש וסיסמה, ורואה רק את השכבות והכמויות של החבילה שלו — כולל תוכנית
              מסוננת וממותגת בשם החברה שלו, ולא את הקובץ המקורי.
            </Text>
          </Timeline.Item>
        </Timeline>
      </Card>
    </Box>
  );
}
