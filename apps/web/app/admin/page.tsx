'use client';

import { useMemo, useState } from 'react';
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
import { DataState } from '@/components/DataState';
import {
  approveMembership,
  createInvitation,
  fetchInvitations,
  fetchMembers,
  fetchRolePermissions,
  fetchRoles,
  fetchSession,
  revokeInvitation,
  revokeMembership,
  suspendMembership,
  type InvitationRow,
  type MemberRow,
} from '@/lib/queries';
import { useQuery } from '@/lib/use-query';
import type { Role } from '@/lib/supabase/types';

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

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active: { label: 'פעיל', color: 'verified' },
  suspended: { label: 'מושעה', color: 'alert' },
  expired: { label: 'פג תוקף', color: 'slate' },
  revoked: { label: 'נשלל', color: 'alert' },
};

const INVITATION_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: 'ממתין', color: 'caution' },
  redeemed: { label: 'מומש', color: 'verified' },
  expired: { label: 'פג תוקף', color: 'slate' },
  revoked: { label: 'בוטל', color: 'alert' },
};

export default function AdminPage() {
  const [inviteOpen, invite] = useDisclosure(false);
  const [approveTarget, setApproveTarget] = useState<MemberRow | null>(null);

  const session = useQuery(fetchSession, []);
  const members = useQuery(fetchMembers, []);
  const invitations = useQuery(fetchInvitations, []);
  const roles = useQuery(fetchRoles, []);

  const pending = (members.data ?? []).filter((m) => m.status === 'pending_approval');
  const active = (members.data ?? []).filter((m) => m.status !== 'pending_approval');

  const reload = () => {
    members.reload();
    invitations.reload();
  };

  const reject = async (membershipId: string) => {
    await revokeMembership(membershipId);
    reload();
  };

  const toggleSuspend = async (member: MemberRow) => {
    await suspendMembership(member.id);
    reload();
  };

  return (
    <Box>
      <PageHeader
        title="משתמשים והרשאות"
        description="חשבון חדש נוצר רק מול קוד הזמנה שהונפק כאן, והוא לא פעיל עד שמנהל בדק ואישר את התפקיד וההרשאות שלו. שני השלבים נאכפים במסד הנתונים ולא בממשק."
        actions={
          <Button
            leftSection={<IconUserPlus size={16} />}
            onClick={invite.open}
            disabled={!session.data?.orgId}
          >
            הנפקת קוד הזמנה
          </Button>
        }
      />

      {pending.length > 0 && (
        <Alert
          variant="light"
          color="caution"
          icon={<IconAlertTriangle size={18} />}
          mb="md"
          title={`${pending.length} חשבונות ממתינים לאישור`}
        >
          המשתמשים האלה נרשמו עם קוד תקין ואינם רואים שום מידע עד לאישור. לפני אישור — ודא שהתפקיד
          וההרשאות מתאימים לגורם. אישור חושף בפניו מידע.
        </Alert>
      )}

      <Tabs defaultValue="pending" variant="outline">
        <Tabs.List mb="md">
          <Tabs.Tab value="pending" leftSection={<IconShieldCheck size={16} />}>
            ממתינים לאישור ({pending.length})
          </Tabs.Tab>
          <Tabs.Tab value="active" leftSection={<IconCheck size={16} />}>
            משתמשים פעילים
          </Tabs.Tab>
          <Tabs.Tab value="invitations" leftSection={<IconKey size={16} />}>
            קודי הזמנה
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="pending">
          <DataState
            loading={members.loading}
            error={members.error}
            empty={pending.length === 0}
            emptyTitle="אין חשבונות ממתינים"
            emptyBody="ברגע שמישהו נרשם עם קוד הזמנה תקין, הבקשה שלו תופיע כאן לבדיקה ואישור."
          >
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
                  {pending.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td>
                        <Stack gap={1}>
                          <Text fw={600} size="sm">
                            {p.profile?.full_name ?? p.profile?.email ?? '—'}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {p.profile?.email} {p.profile?.company_name ? `· ${p.profile.company_name}` : ''}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="slate">
                          {p.role?.name_he ?? '—'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          {new Date(p.created_at).toLocaleDateString('he-IL')}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" justify="flex-end">
                          <Button
                            size="xs"
                            variant="light"
                            color="alert"
                            leftSection={<IconX size={14} />}
                            onClick={() => void reject(p.id)}
                          >
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
          </DataState>
        </Tabs.Panel>

        <Tabs.Panel value="active">
          <DataState
            loading={members.loading}
            error={members.error}
            empty={active.length === 0}
            emptyTitle="אין עדיין משתמשים פעילים"
            emptyBody="אחרי אישור בקשה בלשונית ״ממתינים לאישור״, המשתמש יופיע כאן."
          >
            <Card p={0}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>משתמש</Table.Th>
                    <Table.Th w={180}>תפקיד</Table.Th>
                    <Table.Th w={110}>סטטוס</Table.Th>
                    <Table.Th w={150}>תוקף גישה</Table.Th>
                    <Table.Th w={110} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {active.map((u) => {
                    const status = STATUS_LABEL[u.status] ?? { label: u.status, color: 'slate' };
                    return (
                      <Table.Tr key={u.id}>
                        <Table.Td>
                          <Stack gap={1}>
                            <Text fw={600} size="sm">
                              {u.profile?.full_name ?? u.profile?.email ?? '—'}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {u.profile?.email}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" color="slate">
                            {u.role?.name_he ?? '—'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={status.color} size="sm">
                            {status.label}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c={u.access_expires_at ? undefined : 'dimmed'}>
                            {u.access_expires_at
                              ? new Date(u.access_expires_at).toLocaleDateString('he-IL')
                              : 'ללא הגבלה'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {u.status === 'active' && (
                            <Button size="xs" variant="subtle" color="alert" onClick={() => void toggleSuspend(u)}>
                              השעיה
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Card>
          </DataState>
        </Tabs.Panel>

        <Tabs.Panel value="invitations">
          <DataState
            loading={invitations.loading}
            error={invitations.error}
            empty={(invitations.data ?? []).length === 0}
            emptyTitle="לא הונפקו קודי הזמנה"
            emptyBody="קוד הזמנה נדרש לפני שמישהו יכול להירשם בכלל. הנפקה נשלחת במייל וכאן נשמר רק רמז אליה."
          >
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
                    <Table.Th w={90} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(invitations.data ?? []).map((inv: InvitationRow) => {
                    const status = INVITATION_STATUS_LABEL[inv.status] ?? { label: inv.status, color: 'slate' };
                    return (
                      <Table.Tr key={inv.id}>
                        <Table.Td>
                          <Text size="sm">{inv.email}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text className="p2q-source-name">{inv.code_hint}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" color="slate">
                            {inv.role_name ?? '—'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {new Date(inv.expires_at).toLocaleDateString('he-IL')}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={status.color} size="sm">
                            {status.label}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          {inv.status === 'pending' && (
                            <Button
                              size="xs"
                              variant="subtle"
                              color="alert"
                              onClick={() => void revokeInvitation(inv.id).then(() => invitations.reload())}
                            >
                              ביטול
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Card>
          </DataState>
        </Tabs.Panel>
      </Tabs>

      <InviteModal
        opened={inviteOpen}
        onClose={invite.close}
        orgId={session.data?.orgId ?? null}
        roles={roles.data ?? []}
        onIssued={() => invitations.reload()}
      />
      <ApprovalModal
        target={approveTarget}
        roles={roles.data ?? []}
        onClose={() => setApproveTarget(null)}
        onApproved={() => {
          setApproveTarget(null);
          reload();
        }}
      />
    </Box>
  );
}

function InviteModal({
  opened,
  onClose,
  orgId,
  roles,
  onIssued,
}: {
  opened: boolean;
  onClose: () => void;
  orgId: string | null;
  roles: Role[];
  onIssued: () => void;
}) {
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState<string | null>(null);
  const [validForDays, setValidForDays] = useState<string | null>('7');
  const [accessUntil, setAccessUntil] = useState('');
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    setEmail('');
    setRoleId(null);
    setIssued(null);
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!orgId || !roleId || !email) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createInvitation({
        orgId,
        email,
        roleId,
        validForDays: Number(validForDays ?? '7'),
        accessUntil: accessUntil || null,
      });
      setIssued(result.code);
      onIssued();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'הנפקת הקוד נכשלה.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={close} title="הנפקת קוד הזמנה" size="lg">
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
          <Button onClick={close}>סגירה</Button>
        </Stack>
      ) : (
        <Stack>
          {error && (
            <Alert variant="light" color="alert" icon={<IconAlertTriangle size={18} />}>
              {error}
            </Alert>
          )}
          <TextInput
            label="כתובת מייל"
            description="הקוד ייקשר לכתובת הזו בלבד. העברה שלו לאדם אחר לא תאפשר לו להירשם."
            placeholder="name@company.co.il"
            leftSection={<IconMail size={16} />}
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            required
          />
          <Select
            label="תפקיד"
            data={roles.map((r) => ({ value: r.id, label: r.name_he }))}
            value={roleId}
            onChange={setRoleId}
            allowDeselect={false}
            required
            placeholder="בחר תפקיד"
          />
          <Select
            label="תוקף הקוד"
            data={[
              { value: '2', label: 'יומיים' },
              { value: '7', label: 'שבוע' },
              { value: '30', label: '30 יום' },
            ]}
            value={validForDays}
            onChange={setValidForDays}
            allowDeselect={false}
          />
          <TextInput
            label="תוקף הגישה עצמה"
            description="לאחר התאריך הזה הכניסה נחסמת אוטומטית. מומלץ למלא עבור קבלנים וספקים — אחרי סגירת המכרז אין סיבה שהגישה תישאר פתוחה."
            type="date"
            value={accessUntil}
            onChange={(e) => setAccessUntil(e.currentTarget.value)}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={close}>
              ביטול
            </Button>
            <Button loading={submitting} disabled={!email || !roleId} onClick={() => void submit()}>
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
  roles,
  onClose,
  onApproved,
}: {
  target: MemberRow | null;
  roles: Role[];
  onClose: () => void;
  onApproved: () => void;
}) {
  const rolePermissions = useQuery(fetchRolePermissions, []);
  const [roleId, setRoleId] = useState<string | null>(target?.role_id ?? null);
  const [granted, setGranted] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveRoleId = roleId ?? target?.role_id ?? null;
  const defaults = useMemo(
    () => (effectiveRoleId ? (rolePermissions.data?.get(effectiveRoleId) ?? []) : []),
    [effectiveRoleId, rolePermissions.data],
  );

  const submit = async () => {
    if (!target || !effectiveRoleId) return;
    setSubmitting(true);
    setError(null);
    try {
      await approveMembership({
        membershipId: target.id,
        confirmRoleId: effectiveRoleId,
        grant: granted.filter((g) => !g.startsWith('!')),
        revoke: granted.filter((g) => g.startsWith('!')).map((g) => g.slice(1)),
      });
      onApproved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'האישור נכשל.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={target !== null}
      onClose={onClose}
      title={`בדיקה ואישור — ${target?.profile?.full_name ?? target?.profile?.email ?? ''}`}
      size="xl"
    >
      {target && (
        <Stack>
          {error && (
            <Alert variant="light" color="alert" icon={<IconAlertTriangle size={18} />}>
              {error}
            </Alert>
          )}
          <Card withBorder padding="sm" radius="md">
            <Group gap="xl">
              <Stack gap={1}>
                <Text size="xs" c="dimmed">
                  מייל
                </Text>
                <Text size="sm" fw={600}>
                  {target.profile?.email}
                </Text>
              </Stack>
              <Stack gap={1}>
                <Text size="xs" c="dimmed">
                  חברה
                </Text>
                <Text size="sm" fw={600}>
                  {target.profile?.company_name ?? '—'}
                </Text>
              </Stack>
            </Group>
          </Card>

          <Select
            label="תפקיד"
            description="שינוי התפקיד כאן מעדכן את ברירות המחדל של ההרשאות למטה."
            data={roles.map((r) => ({ value: r.id, label: r.name_he }))}
            value={effectiveRoleId}
            onChange={(v) => {
              setRoleId(v);
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
                      const checked = granted.includes(item.key)
                        ? true
                        : isDefault && !granted.includes(`!${item.key}`);
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
            <Button
              disabled={!confirmed}
              loading={submitting}
              onClick={() => void submit()}
              leftSection={<IconShieldCheck size={16} />}
            >
              אישור והפעלת החשבון
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
