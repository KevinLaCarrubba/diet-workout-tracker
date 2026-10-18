import { useComputedColorScheme, useMantineTheme } from '@mantine/core';

/** Validated chart colors for the current color scheme (see docs: dataviz palette). */
export function useChartColors() {
  const scheme = useComputedColorScheme('dark');
  const theme = useMantineTheme();
  const dark = scheme === 'dark';
  return {
    series1: dark ? '#7d9e0e' : '#6f8d00',
    series2: dark ? '#3f7fe8' : '#2a6ef9',
    /** De-emphasis gray (theme "dimmed"). */
    muted: dark ? theme.colors.dark[2] : theme.colors.gray[6],
    grid: dark ? theme.colors.dark[4] : theme.colors.gray[3],
    text: dark ? theme.colors.dark[0] : theme.black,
    textDim: dark ? theme.colors.dark[2] : theme.colors.gray[7],
    /** Card surface, used for dot rings and bar gaps. */
    surface: dark ? theme.colors.dark[6] : theme.white,
  };
}

export type ChartColors = ReturnType<typeof useChartColors>;

export const axisTick = (c: ChartColors) => ({ fill: c.textDim, fontSize: 12 });
