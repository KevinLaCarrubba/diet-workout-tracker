import { IconBarbell, IconChartLine, IconHome, IconSettings, IconToolsKitchen2 } from '@tabler/icons-react';

export const navItems = [
  { to: '/', label: 'Home', icon: IconHome, end: true },
  { to: '/workouts', label: 'Workouts', icon: IconBarbell, end: false },
  { to: '/meals', label: 'Meals', icon: IconToolsKitchen2, end: false },
  { to: '/progress', label: 'Progress', icon: IconChartLine, end: false },
  { to: '/settings', label: 'Settings', icon: IconSettings, end: false },
] as const;
