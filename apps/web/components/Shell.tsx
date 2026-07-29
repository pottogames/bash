'use client';

import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Burger,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBuildingCommunity,
  IconChevronDown,
  IconClipboardList,
  IconCloudUpload,
  IconFileInvoice,
  IconLayersIntersect,
  IconLogout,
  IconMoon,
  IconPackages,
  IconShieldLock,
  IconSun,
} from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase/client';
import { fetchSession } from '@/lib/queries';
import { useQuery } from '@/lib/use-query';

interface NavItem {
  href: string;
  label: string;
  icon: typeof IconBuildingCommunity;
  /** Screens that are scheduled but not in this milestone. */
  disabled?: boolean;
}

const NAV: NavItem[] = [
  { href: '/', label: 'פרויקטים', icon: IconBuildingCommunity },
  { href: '/upload', label: 'העלאת תוכניות', icon: IconCloudUpload },
  { href: '/structure', label: 'מבנה הפרויקט', icon: IconLayersIntersect },
  { href: '/layers', label: 'ניהול שכבות', icon: IconClipboardList },
  { href: '/quantities', label: 'כתב כמויות', icon: IconFileInvoice, disabled: true },
  { href: '/packages', label: 'חבילות עבודה', icon: IconPackages, disabled: true },
  { href: '/admin', label: 'משתמשים והרשאות', icon: IconShieldLock },
];

/** Screens that render their own full-page frame and must not be wrapped. */
const BARE_ROUTES = ['/login', '/register', '/pending', '/setup'];

export function Shell({ children }: { children: React.ReactNode }) {
  const [opened, { toggle }] = useDisclosure();
  const pathname = usePathname();
  const router = useRouter();
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: true });

  const bare = BARE_ROUTES.some((route) => pathname.startsWith(route));
  const session = useQuery(fetchSession, [pathname === '/' ? 'home' : 'other']);

  if (bare) return <>{children}</>;

  const signOut = async () => {
    await getSupabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  const initials = (session.data?.fullName ?? session.data?.email ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 248, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Group gap={8} wrap="nowrap">
              <Text fw={700} size="lg" style={{ letterSpacing: '-0.02em' }}>
                plan2quote
              </Text>
              {session.data?.orgName ? (
                <Badge size="xs" variant="light" color="slate" visibleFrom="sm">
                  {session.data.orgName}
                </Badge>
              ) : null}
            </Group>
          </Group>

          <Group gap="xs" wrap="nowrap">
            <ActionIcon
              variant="subtle"
              color="slate"
              size="lg"
              aria-label="החלפת ערכת צבעים"
              onClick={() => setColorScheme(computed === 'dark' ? 'light' : 'dark')}
            >
              {computed === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>

            <Menu position="bottom-end" width={230} shadow="md">
              <Menu.Target>
                <UnstyledButton>
                  <Group gap={8} wrap="nowrap">
                    <Avatar size={30} radius="xl" color="ink">
                      {initials}
                    </Avatar>
                    <Stack gap={0} visibleFrom="sm">
                      {session.loading ? (
                        <Skeleton height={10} width={90} />
                      ) : (
                        <>
                          <Text size="xs" fw={600} lh={1.2}>
                            {session.data?.fullName ?? session.data?.email ?? 'לא מחובר'}
                          </Text>
                          <Text size="10px" c="dimmed" lh={1.3}>
                            {session.data?.roleName ?? '—'}
                          </Text>
                        </>
                      )}
                    </Stack>
                    <IconChevronDown size={14} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>{session.data?.email ?? ''}</Menu.Label>
                <Menu.Item
                  color="alert"
                  leftSection={<IconLogout size={15} />}
                  onClick={() => void signOut()}
                >
                  יציאה
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <ScrollArea type="scroll">
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              component={Link}
              href={item.disabled ? '#' : item.href}
              label={item.label}
              leftSection={<item.icon size={18} stroke={1.6} />}
              active={pathname === item.href}
              disabled={item.disabled ?? false}
              variant="light"
              mb={2}
              styles={{ root: { borderRadius: 'var(--mantine-radius-md)' } }}
            />
          ))}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
