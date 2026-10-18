import { dayjs } from '@/lib/time';
import { round, weightToDisplay, unitLabels, type UnitSystem } from '@/lib/units';

const MINUS = '−';

/** 1.25 → "+1.3", -0.04 → "0", -2 → "−2" (typographic minus). */
export function formatSigned(value: number, decimals = 1): string {
  const r = round(value, decimals);
  if (r === 0) return '0';
  return `${r > 0 ? '+' : MINUS}${Math.abs(r).toFixed(decimals).replace(/\.0+$/, '')}`;
}

/** Weight difference in kg → "−4.2 lb". */
export const formatWeightDelta = (deltaKg: number, units: UnitSystem) =>
  `${formatSigned(weightToDisplay(deltaKg, units))} ${unitLabels(units).weight}`;

/** "Mar 3 – Apr 20", adding years when they differ from `today`'s; open end → "Mar 3 or later". */
export function formatDateRange(earliest: string, latest: string | null, today: string): string {
  const year = dayjs.utc(today).year();
  const a = dayjs.utc(earliest);
  const b = latest ? dayjs.utc(latest) : null;
  const needsYear = a.year() !== year || (b !== null && b.year() !== year);
  const fmt = needsYear ? 'MMM D, YYYY' : 'MMM D';
  if (!b) return `${a.format(fmt)} or later`;
  if (a.isSame(b, 'day')) return a.format(fmt);
  return `${a.format(fmt)} – ${b.format(fmt)}`;
}

/** "Oct 18" for this year, "Oct 18, 2025" otherwise. */
export function formatShortDate(date: string, today: string): string {
  const d = dayjs.utc(date);
  return d.format(d.year() === dayjs.utc(today).year() ? 'MMM D' : 'MMM D, YYYY');
}

/** Value for <input type="datetime-local"> showing `iso` in `tz`. */
export const toLocalInput = (iso: string, tz: string) => dayjs(iso).tz(tz).format('YYYY-MM-DDTHH:mm');

/** <input type="datetime-local"> value interpreted in `tz` → UTC ISO string. */
export const fromLocalInput = (value: string, tz: string) => dayjs.tz(value, tz).toISOString();
