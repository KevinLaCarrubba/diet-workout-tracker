import { AppShell, Group, Stack, Text } from '@mantine/core';
import { IconBarbell } from '@tabler/icons-react';
import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router';
import { ThemeSync } from '@/app/ThemeSync';
import { ActiveSessionBanner } from '@/features/workouts/session/ActiveSessionBanner';
import classes from './AppLayout.module.css';
import { FullScreenLoader } from './FullScreenLoader';
import { navItems } from './navItems';
import { StatusIndicator } from './StatusIndicator';

export function AppLayout() {
  return (
    <AppShell
      header={{ height: 'calc(var(--app-header-height) + var(--safe-top))' }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: true } }}
      footer={{ height: 'calc(var(--app-nav-height) + var(--safe-bottom))' }}
      padding="md"
    >
      <ThemeSync />
      <AppShell.Header className={classes.header}>
        <Group h="var(--app-header-height)" px="md" justify="space-between" wrap="nowrap">
          <Group gap={6} wrap="nowrap">
            <IconBarbell size={24} color="var(--mantine-primary-color-filled)" aria-hidden />
            <Text fw={800} lts={0.5}>
              FitTrack
            </Text>
          </Group>
          <StatusIndicator />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" aria-label="Main">
        <Stack gap={4}>
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={classes.sideLink}>
              <Icon size={20} aria-hidden />
              {label}
            </NavLink>
          ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main className={classes.main}>
        <Suspense fallback={<FullScreenLoader />}>
          <Outlet />
        </Suspense>
        <ActiveSessionBanner />
      </AppShell.Main>

      <AppShell.Footer className={classes.footer} hiddenFrom="sm" component="nav" aria-label="Main">
        <Group h="var(--app-nav-height)" gap={0} px={4} wrap="nowrap">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={classes.tab}>
              {({ isActive }) => (
                <>
                  <Icon size={24} stroke={isActive ? 2.2 : 1.7} aria-hidden />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </Group>
      </AppShell.Footer>
    </AppShell>
  );
}
