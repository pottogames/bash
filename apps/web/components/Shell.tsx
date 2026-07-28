'use client';

import {
  ActionIcon,
  AppShell,
  Badge,
  Burger,
  Group,
  NavLink,
  ScrollArea,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBuildingCommunity,
  IconClipboardList,
  IconCloudUpload,
  IconFileInvoice,
  IconLayersIntersect,
  IconMoon,
  IconPackages,
  IconShieldLock,
  IconSun,
} from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

export function Shell({ children }: { children: React.ReactNode }) {
  const [opened, { toggle }] = useDisclosure();
  const pathname = usePathname();
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: true });

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
              <Badge size="xs" variant="light" color="slate">
                בטא
              </Badge>
            </Group>
          </Group>

          <Group gap="xs" wrap="nowrap">
            {/* Stated plainly in the chrome, because it is the product's main
                claim and the reason the numbers are reproducible. */}
            <Tooltip label="כל הסיווגים והמדידות נעשים בקוד דטרמיניסטי. אין מודל שפה בתהליך.">
              <Badge variant="light" color="verified" visibleFrom="md">
                ללא AI · חישוב דטרמיניסטי
              </Badge>
            </Tooltip>

            <ActionIcon
              variant="subtle"
              color="slate"
              size="lg"
              aria-label="החלפת ערכת צבעים"
              onClick={() => setColorScheme(computed === 'dark' ? 'light' : 'dark')}
            >
              {computed === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <ScrollArea type="scroll">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <NavLink
                key={item.href}
                component={Link}
                href={item.disabled ? '#' : item.href}
                label={item.label}
                leftSection={<item.icon size={18} stroke={1.6} />}
                active={active}
                disabled={item.disabled ?? false}
                variant="light"
                mb={2}
                styles={{ root: { borderRadius: 'var(--mantine-radius-md)' } }}
              />
            );
          })}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
