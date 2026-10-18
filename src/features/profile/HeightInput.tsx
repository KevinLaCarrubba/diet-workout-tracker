import { Group, NumberInput } from '@mantine/core';
import { cmToIn, inToCm, round, type UnitSystem } from '@/lib/units';

interface Props {
  units: UnitSystem;
  valueCm: number | null;
  onChange: (cm: number | null) => void;
  error?: string;
}

/** Height entry in ft + in (imperial) or cm (metric); always reports centimetres. */
export function HeightInput({ units, valueCm, onChange, error }: Props) {
  if (units === 'metric') {
    return (
      <NumberInput
        label="Height (cm)"
        min={50}
        max={275}
        decimalScale={1}
        inputMode="decimal"
        value={valueCm ?? ''}
        onChange={(v) => onChange(typeof v === 'number' ? v : null)}
        error={error}
      />
    );
  }
  const totalIn = valueCm == null ? null : Math.round(cmToIn(valueCm));
  const feet = totalIn == null ? '' : Math.floor(totalIn / 12);
  const inches = totalIn == null ? '' : totalIn % 12;
  const update = (ft: number | '', inch: number | '') => {
    if (ft === '' && inch === '') return onChange(null);
    onChange(round(inToCm((Number(ft) || 0) * 12 + (Number(inch) || 0)), 1));
  };
  return (
    <Group grow align="flex-start">
      <NumberInput
        label="Height (ft)"
        min={1}
        max={8}
        allowDecimal={false}
        inputMode="numeric"
        value={feet}
        onChange={(v) => update(typeof v === 'number' ? v : '', inches)}
        error={error}
      />
      <NumberInput
        label="(in)"
        min={0}
        max={11}
        allowDecimal={false}
        inputMode="numeric"
        value={inches}
        onChange={(v) => update(feet, typeof v === 'number' ? v : '')}
      />
    </Group>
  );
}
