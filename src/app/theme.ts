import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Electric lime accent (primary) and a restrained blue secondary.
const lime: MantineColorsTuple = [
  '#f7fde4',
  '#eefbc6',
  '#e0f78f',
  '#d2f458',
  '#cbf43f',
  '#c6f432',
  '#aed722',
  '#88a817',
  '#5f760c',
  '#3a4804',
];

const blue: MantineColorsTuple = [
  '#e8f1ff',
  '#cfdfff',
  '#9dbcfd',
  '#6897fb',
  '#4c8dff',
  '#2a6ef9',
  '#1a63f9',
  '#0753de',
  '#0049c7',
  '#003fb0',
];

// Near-black backgrounds and charcoal surfaces. dark[7] is the body, dark[6] cards/inputs.
const dark: MantineColorsTuple = [
  '#eceef1',
  '#c3c7ce',
  '#9aa0a9',
  '#6d747f',
  '#2e333b',
  '#22262d',
  '#16191e',
  '#0b0d10',
  '#08090b',
  '#050607',
];

export const theme = createTheme({
  primaryColor: 'lime',
  primaryShade: { light: 6, dark: 5 },
  colors: { lime, blue, dark },
  autoContrast: true,
  luminanceThreshold: 0.45,
  defaultRadius: 'md',
  cursorType: 'pointer',
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  headings: { fontWeight: '700' },
  focusRing: 'auto',
  components: {
    Button: { defaultProps: { size: 'md', autoContrast: true } },
    ActionIcon: { defaultProps: { size: 'lg', variant: 'subtle', autoContrast: true } },
    Badge: { defaultProps: { autoContrast: true } },
    ThemeIcon: { defaultProps: { autoContrast: true } },
    Checkbox: { defaultProps: { autoContrast: true } },
    Chip: { defaultProps: { autoContrast: true } },
    Pagination: { defaultProps: { autoContrast: true } },
    Stepper: { defaultProps: { autoContrast: true } },
    TextInput: { defaultProps: { size: 'md' } },
    PasswordInput: { defaultProps: { size: 'md' } },
    NumberInput: { defaultProps: { size: 'md' } },
    Select: { defaultProps: { size: 'md' } },
    Textarea: { defaultProps: { size: 'md' } },
    Card: { defaultProps: { radius: 'lg', padding: 'md', withBorder: true } },
    Paper: { defaultProps: { radius: 'lg' } },
  },
});
