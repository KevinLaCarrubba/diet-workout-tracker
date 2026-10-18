import { NumberInput, type NumberInputProps } from '@mantine/core';

/** Numeric weight field tuned for phones (decimal keypad, one decimal place). */
export function WeightInput(props: NumberInputProps) {
  return <NumberInput min={20} max={900} decimalScale={1} inputMode="decimal" hideControls {...props} />;
}
