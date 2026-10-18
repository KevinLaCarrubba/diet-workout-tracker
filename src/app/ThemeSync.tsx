import { useMantineColorScheme } from '@mantine/core';
import { useEffect } from 'react';
import { useSettings } from '@/features/profile/api';

/** Applies the theme saved in user_settings (dark-first by default). */
export function ThemeSync() {
  const { data } = useSettings();
  const { setColorScheme } = useMantineColorScheme();
  useEffect(() => {
    if (data?.theme) setColorScheme(data.theme);
  }, [data?.theme, setColorScheme]);
  return null;
}
