'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  CopyButton,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconKey,
  IconLock,
  IconMail,
  IconShieldCheck,
  IconUserPlus,
  IconX,
} from '@tabler/icons-react';
import { PageHeader } from '@/components/PageHeader';

/**
 * Administration.
 *
 * The screen is arranged around the sequence the customer specified, because
 * the sequence is the security property:
 *
 *   invite code issued → person registers → **admin reviews role and
 *   permissions** → account becomes usable
 *
 * The middle step cannot be skipped from here, and it cannot be skipped from
 * the database either — `memberships` has no policy that lets a client write
 * `active`. See `supabase/migrations/*_rls.sql` and the tests in
 * `supabase/tests/10_rls.test.sql`.
 */

const ROLES = [
  { value: 'owner', label: 'בעלים' },
  { value: 'admin', label: 'מנהל מערכת' },
  { value: 'project_manager', label: 'מנהל פרויקט' },
  { value: 'estimator', label: 'מודד כמויות' },
  { value: 'viewer', label: 'צופה' },
  { value: 'subcontractor', label: 'קבלן משנה' },
  { value: 'supplier', label: 'ספק' },
  { value: 'client', label: 'לקוח / יזם' },
  { value: 'architect', label: 'אדריכל' },
];

const PERMISSION_GROUPS = [
  {
    group: 'ניהול ארגון',
    items: [
      { key: 'org.members.invite', label: 'הנפקת קודי הזמנה' },
      { key: 'org.members.approve', label: 'אישור חשבונות חדשים' },
      { key: 'org.members.manage', label: 'ניהול והשעיית משתמשים' },
      { key: 'org.audit.read', label: 'צפייה ביומן ביקורת' },
    ],
  },
  {
    group: 'תוכניות וכמויות',
    items: [
      { key: 'plan.upload', label: 'העלאת תוכניות' },
      { key: 'plan.download_source', label: 'הורדת הקובץ המקורי' },
      { key: 'layer.update', label: 'עריכת שכבות' },
      { key: 'quantity.update', label: 'עריכת כמויות' },
      { key: 'quantity.approve', label: 'אישור כמויות' },
    ],
  },
  {
    group: 'כספים',
    sensitive: true,
    items: [
      { key: 'price.cost.read', label: 'צפייה במחירי עלות', critical: true },
      { key: 'price.update', label: 'עריכת מחירון' },
      { key: 'quote.create', label: 'יצירת הצעות מחיר' },
      { key: 'quote.send', label: 'שליחת הצעה ללקוח' },
    ],
  },
  {
    group: 'חבילות עבודה',
    items: [
      { key: 'package.create', label: 'יצירת חבילות' },
      { key: 'package.send', label: 'שליחה לגורמים' },
      { key: 'bid.read', label: 'צפייה בהצעות קבלנים' },
      { key: 'bid.award', label: 'קביעת זוכה' },
    ],
  },
] as const;

/** Defaults per role. Mirrors the seed migration; the database is authoritative. */
const ROLE_DEFAULTS: Record<string, string[]> = {
  project_manager: [
    'plan.upload', 'plan.download_source', 'layer.update', 'quantity.update', 'quantity.approve',
    'price.cost.read', 'price.update', 'quote.create', 'quote.send',
    'package.create', 'package.send', 'bid.read', 'bid.award',
  ],
  estimator: [
    'plan.upload', 'layer.update', 'quantity.update', 'quantity.approve',
    'price.cost.read', 'price.update', 'quote.create', 'bid.read',
  ],
  viewer: [],
  subcontractor: [],
  supplier: [],
  client: [],
  architect: ['plan.upload', 'plan.download_source', 'layer.update'],
  admin: PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key)),
  owner: PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key)),
};

const PENDING = [
  { id: '1', name: 'דוד כהן', email: 'david@cohen-electric.co.il', company: 'כהן חשמל בע״מ', role: 'subcontractor', registeredAt: 'לפני 2 שעות' },
  { id: '2', name: 'מיכל אברהם', email: 'michal@example.com', company: 'אברהם אדריכלים', role: 'architect', registeredAt: 'אתמול' },
  { id: '3', name: 'יוסי לוי', email: 'yossi@levi-plumbing.co.il', company: 'לוי אינסטלציה', role: 'subcontractor', registeredAt: 'לפני 3 ימים' },
];

const ACTIVE = [
  { name: 'רון שמעוני', email: 'ron@office.co.il', role: 'owner', status: 'פעיל', expires: null },
  { name: 'נועה ברק', email: 'noa@office.co.il', role: 'estimator', status: 'פעיל', expires: null },
  { name: 'כהן חשמל בע״מ', email: 'david@cohen-electric.co.il', role: 'subcontractor', status: 'פעיל', expires: '31.08.2026' },
  { name: 'שיש ואבן ג. מזרחי', email: 'g@mizrahi-stone.co.il', role: 'supplier', status: 'מושעה', expires: null },
];

export default function AdminPage() {
  const [inviteOpen, invite] = useDisclosure(false);
  const [approveTarget, setApproveTarget] = useState<(typeof PENDING)[number] | null>(null);

  return (
    <Box>
      <PageHeader
        title="משתמשים והרשאות"
        description="חשבון חדש נוצר רק מול קוד הזמנה שהונפק כאן, והוא לא פעיל עד שמנהל בדק ואישר את התפקיד וההרשאות שלו. שני השלבים נאכפים במסד הנתונים ולא בממשק."
        actions={
          <Button leftSection={<IconUserPlus size={16} />} onClick={invite.open}>
            הנפקת קוד הזמנה
          </Button>
        }
      />

      {PENDING.length > 0 && (
        <Alert
          variant="light"
          color="caution"
          icon={<IconAlertTriangle size={18} />}
          mb="md"
          title={`${PENDING.length} חשבונות ממתינים לאישור`}
        >
          המשתמשים האלה נרשמו עם קוד תקין ואינם רואים שום מידע עד לאישור. לפני אישור — ודא שהתפקיד
          וההרשאות מתאימים לגורם. אישור חושף בפניו מידע.
        </Alert>
      )}

      <Tabs defaultValue="pending" variant="outline">
        <Tabs.List mb="md">
          <Tabs.Tab value="pending" leftSection={<IconShieldCheck size={16} />}>
            ממתינים לאישור ({PENDING.length})
          </Tabs.Tab>
          <Tabs.Tab value="active" leftSection={<IconCheck size={16} />}>
            משתמשים פעילים
          </Tabs.Tab>
          <Tabs.Tab value="invitations" leftSection={<IconKey size={16} />}>
            קודי הזמנה
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="pending">
          <Card p={0}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>משתמש</Table.Th>
                  <Table.Th w={180}>תפקיד מבוקש</Table.Th>
                  <Table.Th w={130}>נרשם</Table.Th>
                  <Table.Th w={220} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {PENDING.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>
                      <Stack gap={1}>
                        <Text fw={600} size="sm">{p.name}</Text>
                        <Text size="xs" c="dimmed">{p.email} · {p.company}</Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color="slate">
                        {ROLES.find((r) => r.value === p.role)?.label}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">{p.registeredAt}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" justify="flex-end">
                        <Button size="xs" variant="light" color="alert" leftSection={<IconX size={14} />}>
                          דחייה
                        </Button>
                        <Button size="xs" onClick={() => setApproveTarget(p)}>
                          בדיקה ואישור
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="active">
          <Card p={0}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>משתמש</Table.Th>
                  <Table.Th w={180}>תפקיד</Table.Th>
                  <Table.Th w={110}>סטטוס</Table.Th>
                  <Table.Th w={150}>תוקף גישה</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {ACTIVE.map((u) => (
                  <Table.Tr key={u.email}>
                    <Table.Td>
                      <Stack gap={1}>
                        <Text fw={600} size="sm">{u.name}</Text>
                        <Text size="xs" c="dimmed">{u.email}</Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color="slate">
                        {ROLES.find((r) => r.value === u.role)?.label}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={u.status === 'פעיל' ? 'verified' : 'alert'} size="sm">
                        {u.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={u.expires ? undefined : 'dimmed'}>
                        {u.expires ?? 'ללא הגבלה'}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="invitations">
          <Card>
            <Group gap="sm" mb="sm">
              <ThemeIcon variant="light" color="slate" radius="xl">
                <IconLock size={16} />
              </ThemeIcon>
              <Text size="sm">
                הקוד עצמו אינו נשמר במסד הנתונים — נשמר רק גיבוב SHA-256 שלו ורמז בן ארבעה תווים.
                אם הקוד אבד, מנפיקים חדש; אין דרך לשחזר אותו, וזה מכוון.
              </Text>
            </Group>
            <Divider my="sm" />
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>נשלח אל</Table.Th>
                  <Table.Th w={140}>רמז לקוד</Table.Th>
                  <Table.Th w={160}>תפקיד</Table.Th>
                  <Table.Th w={120}>תוקף</Table.Th>
                  <Table.Th w={110}>סטטוס</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td><Text size="sm">david@cohen-electric.co.il</Text></Table.Td>
                  <Table.Td><Text className="p2q-source-name">7K3M…QP94</Text></Table.Td>
                  <Table.Td><Badge variant="light" color="slate">קבלן משנה</Badge></Table.Td>
                  <Table.Td><Text size="sm" c="dimmed">04.08.2026</Text></Table.Td>
                  <Table.Td><Badge color="verified" size="sm">מומש</Badge></Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td><Text size="sm">office@mizrahi-stone.co.il</Text></Table.Td>
                  <Table.Td><Text className="p2q-source-name">R2FT…8XHN</Text></Table.Td>
                  <Table.Td><Badge variant="light" color="slate">ספק</Badge></Table.Td>
                  <Table.Td><Text size="sm" c="dimmed">02.08.2026</Text></Table.Td>
                  <Table.Td><Badge color="caution" size="sm">ממתין</Badge></Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          </Card>
        </Tabs.Panel>
      </Tabs>

      <InviteModal opened={inviteOpen} onClose={invite.close} />
      <ApprovalModal target={approveTarget} onClose={() => setApproveTarget(null)} />
    </Box>
  );
}

function InviteModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [role, setRole] = useState<string | null>('subcontractor');
  const [issued, setIssued] = useState<string | null>(null);

  return (
    <Modal opened={opened} onClose={onClose} title="הנפקת קוד הזמנה" size="lg">
      {issued ? (
        <Stack>
          <Alert variant="light" color="caution" icon={<IconAlertTriangle size={18} />}>
            זו הפעם היחידה שהקוד מוצג. הוא נשלח במייל לכתובת שהזנת, ובמסד הנתונים נשמר רק גיבוב שלו.
          </Alert>
          <Group gap="xs">
            <Text className="p2q-source-name" size="lg" fw={700}>
              {issued}
            </Text>
            <CopyButton value={issued}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'הועתק' : 'העתקה'}>
                  <ActionIcon variant="light" onClick={copy}>
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          <Button onClick={onClose}>סגירה</Button>
        </Stack>
      ) : (
        <Stack>
          <TextInput
            label="כתובת מייל"
            description="הקוד ייקשר לכתובת הזו בלבד. העברה שלו לאדם אחר לא תאפשר לו להירשם."
            placeholder="name@company.co.il"
            leftSection={<IconMail size={16} />}
            required
          />
          <Select label="תפקיד" data={ROLES} value={role} onChange={setRole} allowDeselect={false} required />
          <Select
            label="תוקף הקוד"
            data={[
              { value: '2', label: 'יומיים' },
              { value: '7', label: 'שבוע' },
              { value: '30', label: '30 יום' },
            ]}
            defaultValue="7"
            allowDeselect={false}
          />
          <TextInput
            label="תוקף הגישה עצמה"
            description="לאחר התאריך הזה הכניסה נחסמת אוטומטית. מומלץ למלא עבור קבלנים וספקים — אחרי סגירת המכרז אין סיבה שהגישה תישאר פתוחה."
            type="date"
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>
              ביטול
            </Button>
            <Button onClick={() => setIssued('7K3M-QW82-LH4D-N9TR-B6VC-XZ21-FG55-QP94')}>
              הנפקה ושליחה במייל
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function ApprovalModal({
  target,
  onClose,
}: {
  target: { name: string; email: string; company: string; role: string } | null;
  onClose: () => void;
}) {
  const [role, setRole] = useState<string | null>(target?.role ?? null);
  const [granted, setGranted] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const effectiveRole = role ?? target?.role ?? 'viewer';
  const defaults = ROLE_DEFAULTS[effectiveRole] ?? [];

  return (
    <Modal
      opened={target !== null}
      onClose={onClose}
      title={`בדיקה ואישור — ${target?.name ?? ''}`}
      size="xl"
    >
      {target && (
        <Stack>
          <Card withBorder padding="sm" radius="md">
            <Group gap="xl">
              <Stack gap={1}>
                <Text size="xs" c="dimmed">מייל</Text>
                <Text size="sm" fw={600}>{target.email}</Text>
              </Stack>
              <Stack gap={1}>
                <Text size="xs" c="dimmed">חברה</Text>
                <Text size="sm" fw={600}>{target.company}</Text>
              </Stack>
            </Group>
          </Card>

          <Select
            label="תפקיד"
            description="שינוי התפקיד כאן מעדכן את ברירות המחדל של ההרשאות למטה."
            data={ROLES}
            value={effectiveRole}
            onChange={(v) => {
              setRole(v);
              setGranted([]);
              setConfirmed(false);
            }}
            allowDeselect={false}
          />

          <Box>
            <Title order={4} mb={4}>
              הרשאות בפועל
            </Title>
            <Text size="sm" c="dimmed" mb="sm">
              מסומן = ההרשאה תינתן. הרשאות שהתפקיד נותן מסומנות מראש; אפשר להוסיף או לשלול נקודתית,
              ושלילה נקודתית תמיד גוברת על התפקיד.
            </Text>

            <Stack gap="md">
              {PERMISSION_GROUPS.map((group) => (
                <Card key={group.group} withBorder padding="sm" radius="md">
                  <Group gap={8} mb="xs">
                    <Text fw={600} size="sm">
                      {group.group}
                    </Text>
                    {'sensitive' in group && group.sensitive && (
                      <Badge color="alert" size="xs">
                        רגיש
                      </Badge>
                    )}
                  </Group>
                  <Stack gap={6}>
                    {group.items.map((item) => {
                      const isDefault = defaults.includes(item.key);
                      const checked = granted.includes(item.key) ? true : isDefault && !granted.includes(`!${item.key}`);
                      return (
                        <Checkbox
                          key={item.key}
                          size="sm"
                          checked={checked}
                          onChange={(e) => {
                            setConfirmed(false);
                            setGranted((prev) =>
                              e.currentTarget.checked
                                ? [...prev.filter((p) => p !== `!${item.key}`), item.key]
                                : [...prev.filter((p) => p !== item.key), `!${item.key}`],
                            );
                          }}
                          label={
                            <Group gap={6}>
                              <Text size="sm">{item.label}</Text>
                              {'critical' in item && item.critical && checked && (
                                <Badge color="alert" size="xs" variant="filled">
                                  חושף כמה אתה משלם לקבלנים אחרים
                                </Badge>
                              )}
                            </Group>
                          }
                        />
                      );
                    })}
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Box>

          <Checkbox
            checked={confirmed}
            onChange={(e) => setConfirmed(e.currentTarget.checked)}
            label="בדקתי את התפקיד ואת ההרשאות למעלה והם מתאימים לגורם הזה"
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              ביטול
            </Button>
            <Button disabled={!confirmed} onClick={onClose} leftSection={<IconShieldCheck size={16} />}>
              אישור והפעלת החשבון
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
