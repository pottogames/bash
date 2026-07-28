'use client';

import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Progress,
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
import { DEMO_STRUCTURE } from '@/lib/demo';

const PROJECTS = [
  { name: 'מגדל הרצל 42', client: 'יזמות ש. לוי בע״מ', status: 'כתב כמויות', progress: 62, plans: 14, color: 'ink' },
  { name: 'שיפוץ משרדים — רוטשילד', client: 'א.ב. נכסים', status: 'הצעת מחיר', progress: 88, plans: 6, color: 'verified' },
  { name: 'בית פרטי — רמת השרון', client: 'משפחת אדלר', status: 'מכרז קבלנים', progress: 40, plans: 9, color: 'caution' },
];

export default function HomePage() {
  return (
    <Box>
      <PageHeader
        title="פרויקטים"
        description={`${DEMO_STRUCTURE.project.name} ועוד. כל פרויקט מתחיל בתוכנית ונגמר בחבילות עבודה שכל גורם רואה רק את החלק שלו.`}
        actions={
          <Button leftSection={<IconFileUpload size={16} />}>העלאת תוכנית</Button>
        }
      />

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" mb="xl">
        {PROJECTS.map((p) => (
          <Card key={p.name} component={Link} href="/structure" style={{ textDecoration: 'none' }}>
            <Group justify="space-between" align="flex-start" mb="xs">
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Text fw={600}>{p.name}</Text>
                <Text size="xs" c="dimmed">
                  {p.client}
                </Text>
              </Stack>
              <Badge color={p.color} size="sm">
                {p.status}
              </Badge>
            </Group>
            <Progress value={p.progress} size="sm" color={p.color} mb="xs" />
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                {p.plans} תוכניות
              </Text>
              <Group gap={4}>
                <Text size="xs" c="dimmed">
                  המשך
                </Text>
                <IconArrowLeft size={13} />
              </Group>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <Card>
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
                מנוע חוקים: מילון מונחים בעברית ובאנגלית, תקני שמות שכבות (AIA/ISO), וראיות מתוכן
                השכבה. כל סיווג מגיע עם המשפט המדויק שגרם לו.
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

        <Stack gap="md">
          <Card>
            <Group gap="sm" mb="xs">
              <ThemeIcon variant="light" color="verified" radius="md">
                <IconCalculator size={16} />
              </ThemeIcon>
              <Title order={4}>למה בלי AI</Title>
            </Group>
            <Text size="sm" c="dimmed">
              לא רק בגלל העלות. מודל שנותן ‎97 מ״ר‎ לא יכול להראות לך איזה קווים הוא סכם, ולא יבטיח
              שמחר הוא ייתן את אותו מספר. כאן כל מספר הוא סכימה של קואורדינטות מהקובץ, וכל סיווג
              הוא כלל שכתוב במפורש וניתן לתיקון בלחיצה — והתיקון נשמר ומשמש בייבוא הבא.
            </Text>
          </Card>

          <Card>
            <Group gap="sm" mb="xs">
              <ThemeIcon variant="light" color="slate" radius="md">
                <IconLayersSubtract size={16} />
              </ThemeIcon>
              <Title order={4}>המערכת לומדת בלי מודל</Title>
            </Group>
            <Text size="sm" c="dimmed">
              כשמישהו מתקן שיוך של שכבה, התיקון נשמר ככלל ארגוני ונבדק ראשון בייבוא הבא. אחרי כמה
              פרויקטים המערכת מכירה את מוסכמות השמות של המשרדים שאתה עובד איתם — בעלות אפס, ובלי
              שאף החלטה תהפוך לקופסה שחורה.
            </Text>
          </Card>
        </Stack>
      </SimpleGrid>
    </Box>
  );
}
