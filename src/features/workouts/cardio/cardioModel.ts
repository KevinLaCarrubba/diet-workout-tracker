import { dayjs, localDate } from '@/lib/time';
import { metersToMiles, milesToMeters, round, type UnitSystem } from '@/lib/units';
import type { CardioPayload } from '@/offline/handlers';
import type { OutboxItem } from '@/offline/types';
import type { Enums, Tables } from '@/types/database';

export type CardioActivity = Enums<'cardio_activity'>;
export type CardioRow = Tables<'cardio_sessions'>;
export type CardioItem = CardioRow & { pending: boolean };

export const ACTIVITY_OPTIONS: { value: CardioActivity; label: string }[] = [
  { value: 'walking', label: 'Walking' },
  { value: 'running', label: 'Running' },
  { value: 'stairmaster', label: 'StairMaster' },
  { value: 'cycling', label: 'Cycling' },
  { value: 'elliptical', label: 'Elliptical' },
  { value: 'rowing', label: 'Rowing' },
  { value: 'custom', label: 'Other' },
];

export const activityName = (row: Pick<CardioRow, 'activity_type' | 'custom_name'>) =>
  row.activity_type === 'custom'
    ? row.custom_name || 'Cardio'
    : (ACTIVITY_OPTIONS.find((o) => o.value === row.activity_type)?.label ?? 'Cardio');

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

const KM_PER_MI = 1.609344;

/** Number input value ('' or a number/string) → finite number or null. */
export function numOrNull(v: number | string | null | undefined): number | null {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export const toSeconds = (minutes: number | null, seconds: number | null) =>
  Math.round((minutes ?? 0) * 60 + (seconds ?? 0));

export const splitSeconds = (total: number) => ({ minutes: Math.floor(total / 60), seconds: total % 60 });

/** Display distance (mi or km) → meters, 0.1 m precision. */
export const distanceToMeters = (value: number, units: UnitSystem) =>
  round(units === 'imperial' ? milesToMeters(value) : value * 1000, 1);

export const metersToDistance = (m: number, units: UnitSystem) =>
  round(units === 'imperial' ? metersToMiles(m) : m / 1000, 2);

/** Display speed (mph or kph) → kph. */
export const speedToKph = (value: number, units: UnitSystem) =>
  round(units === 'imperial' ? value * KM_PER_MI : value, 2);

export const kphToSpeed = (kph: number, units: UnitSystem) =>
  round(units === 'imperial' ? kph / KM_PER_MI : kph, 1);

export const speedUnit = (units: UnitSystem) => (units === 'imperial' ? 'mph' : 'km/h');
export const distanceUnit = (units: UnitSystem) => (units === 'imperial' ? 'mi' : 'km');

/** Whole seconds per km, or null without a usable distance. */
export function paceSecondsPerKm(durationSeconds: number, distanceMeters: number | null): number | null {
  if (!distanceMeters || distanceMeters <= 0 || durationSeconds <= 0) return null;
  return Math.max(1, Math.round(durationSeconds / (distanceMeters / 1000)));
}

/** "9:41 /mi" or "6:01 /km". */
export function formatPace(secondsPerKm: number | null, units: UnitSystem): string | null {
  if (!secondsPerKm) return null;
  const perUnit = Math.round(units === 'imperial' ? secondsPerKm * KM_PER_MI : secondsPerKm);
  const m = Math.floor(perUnit / 60);
  const s = perUnit % 60;
  return `${m}:${String(s).padStart(2, '0')} /${distanceUnit(units)}`;
}

/** 1h 05m, 32m 10s, 45s */
export function formatCardioDuration(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return s ? `${m}m ${String(s).padStart(2, '0')}s` : `${m} min`;
  return `${s}s`;
}

// ---------------------------------------------------------------------------
// Form ⇄ row
// ---------------------------------------------------------------------------

export interface CardioFormValues {
  activity_type: CardioActivity;
  custom_name: string;
  /** datetime-local value in the user's timezone: YYYY-MM-DDTHH:mm */
  occurred_local: string;
  minutes: number | string;
  seconds: number | string;
  distance: number | string;
  incline: number | string;
  speed: number | string;
  resistance: number | string;
  avg_hr: number | string;
  max_hr: number | string;
  notes: string;
}

export const toLocalInput = (iso: string | Date, tz: string) => dayjs(iso).tz(tz).format('YYYY-MM-DDTHH:mm');
export const fromLocalInput = (value: string, tz: string) =>
  dayjs.tz(value.length === 16 ? `${value}:00` : value, tz).toISOString();

export function emptyCardioForm(tz: string, now: Date = new Date()): CardioFormValues {
  return {
    activity_type: 'walking',
    custom_name: '',
    occurred_local: toLocalInput(now, tz),
    minutes: '',
    seconds: '',
    distance: '',
    incline: '',
    speed: '',
    resistance: '',
    avg_hr: '',
    max_hr: '',
    notes: '',
  };
}

export function rowToForm(row: CardioRow, units: UnitSystem, tz: string): CardioFormValues {
  const { minutes, seconds } = splitSeconds(row.duration_seconds);
  const opt = (v: number | null, f: (n: number) => number = (n) => n) => (v == null ? '' : f(Number(v)));
  return {
    activity_type: row.activity_type,
    custom_name: row.custom_name ?? '',
    occurred_local: toLocalInput(row.occurred_at, tz),
    minutes,
    seconds,
    distance: opt(row.distance_meters, (m) => metersToDistance(m, units)),
    incline: opt(row.incline_percent),
    speed: opt(row.speed_kph, (k) => kphToSpeed(k, units)),
    resistance: opt(row.resistance_level),
    avg_hr: opt(row.avg_heart_rate),
    max_hr: opt(row.max_heart_rate),
    notes: row.notes ?? '',
  };
}

/** Form-level validation; returns field → message. */
export function validateCardio(v: CardioFormValues): Partial<Record<keyof CardioFormValues, string>> {
  const errors: Partial<Record<keyof CardioFormValues, string>> = {};
  const duration = toSeconds(numOrNull(v.minutes), numOrNull(v.seconds));
  if (duration < 1) errors.minutes = 'Enter how long you went';
  else if (duration > 86400) errors.minutes = 'Must be under 24 hours';
  const sec = numOrNull(v.seconds);
  if (sec != null && (sec < 0 || sec > 59)) errors.seconds = '0–59';
  if (v.activity_type === 'custom' && !v.custom_name.trim()) errors.custom_name = 'Name the activity';
  if (v.custom_name.trim().length > 60) errors.custom_name = 'Keep it under 60 characters';
  if (!v.occurred_local || !dayjs(v.occurred_local).isValid()) errors.occurred_local = 'Pick a date and time';
  const range = (key: keyof CardioFormValues, min: number, max: number, msg: string) => {
    const n = numOrNull(v[key] as number | string);
    if (n != null && (n < min || n > max)) errors[key] = msg;
  };
  range('distance', 0, 1000, 'Check the distance');
  range('incline', -10, 40, '−10 to 40%');
  range('speed', 0, 60, 'Check the speed');
  range('resistance', 0, 100, '0–100');
  range('avg_hr', 30, 250, '30–250 bpm');
  range('max_hr', 30, 250, '30–250 bpm');
  const avg = numOrNull(v.avg_hr);
  const max = numOrNull(v.max_hr);
  if (avg != null && max != null && max < avg && !errors.max_hr)
    errors.max_hr = 'Max should be at least the average';
  if (v.notes.length > 1000) errors.notes = 'Keep notes under 1000 characters';
  return errors;
}

/** Builds a cardio_sessions insert row (granted columns only, metric units). */
export function buildCardioRow(
  v: CardioFormValues,
  ctx: { id: string; userId: string; units: UnitSystem; timezone: string },
): CardioPayload {
  const duration = toSeconds(numOrNull(v.minutes), numOrNull(v.seconds));
  const distance = numOrNull(v.distance);
  const distance_meters = distance != null && distance > 0 ? distanceToMeters(distance, ctx.units) : null;
  const speed = numOrNull(v.speed);
  const int = (x: number | string) => {
    const n = numOrNull(x);
    return n == null ? null : Math.round(n);
  };
  const dec1 = (x: number | string) => {
    const n = numOrNull(x);
    return n == null ? null : round(n, 1);
  };
  return {
    id: ctx.id,
    user_id: ctx.userId,
    activity_type: v.activity_type,
    custom_name: v.activity_type === 'custom' ? v.custom_name.trim() : null,
    occurred_at: fromLocalInput(v.occurred_local, ctx.timezone),
    duration_seconds: duration,
    distance_meters,
    pace_seconds_per_km: paceSecondsPerKm(duration, distance_meters),
    incline_percent: dec1(v.incline),
    speed_kph: speed == null ? null : speedToKph(speed, ctx.units),
    resistance_level: dec1(v.resistance),
    avg_heart_rate: int(v.avg_hr),
    max_heart_rate: int(v.max_hr),
    notes: v.notes.trim() || null,
  };
}

/** A payload shaped like a server row (for showing it before it syncs). */
export function payloadToRow(p: CardioPayload, now = new Date().toISOString()): CardioRow {
  return {
    custom_name: null,
    distance_meters: null,
    pace_seconds_per_km: null,
    incline_percent: null,
    speed_kph: null,
    resistance_level: null,
    avg_heart_rate: null,
    max_heart_rate: null,
    notes: null,
    created_at: now,
    updated_at: now,
    ...p,
  } as CardioRow;
}

// ---------------------------------------------------------------------------
// Merging server rows with the device outbox
// ---------------------------------------------------------------------------

/**
 * Server rows + queued (unsynced) saves and deletes. A queued save replaces
 * the server copy; a queued delete hides the row. Newest first.
 */
export function mergeCardio(
  server: CardioRow[],
  outbox: Pick<OutboxItem, 'kind' | 'payload'>[],
): CardioItem[] {
  const byId = new Map<string, CardioItem>(server.map((r) => [r.id, { ...r, pending: false }]));
  const deleted = new Set<string>();
  for (const item of outbox) {
    if (item.kind === 'cardio_session') {
      const row = payloadToRow(item.payload as CardioPayload);
      const existing = byId.get(row.id);
      byId.set(row.id, { ...row, created_at: existing?.created_at ?? row.created_at, pending: true });
    } else if (item.kind === 'delete_cardio_session') {
      deleted.add((item.payload as { id: string }).id);
    }
  }
  return [...byId.values()]
    .filter((r) => !deleted.has(r.id))
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
}

// ---------------------------------------------------------------------------
// Weekly grouping
// ---------------------------------------------------------------------------

export interface CardioWeek {
  /** Monday of the week, YYYY-MM-DD in the user's timezone. */
  weekStart: string;
  items: CardioItem[];
  totalSeconds: number;
  totalMeters: number;
}

/** Monday (YYYY-MM-DD) of the week containing a local date. */
export function mondayOf(date: string): string {
  const d = dayjs(date);
  const offset = (d.day() + 6) % 7;
  return d.subtract(offset, 'day').format('YYYY-MM-DD');
}

/** Groups (already newest-first) sessions into Monday-start weeks, newest week first. */
export function groupByWeek(items: CardioItem[], tz: string): CardioWeek[] {
  const weeks = new Map<string, CardioWeek>();
  for (const item of items) {
    const key = mondayOf(localDate(tz, item.occurred_at));
    let week = weeks.get(key);
    if (!week) {
      week = { weekStart: key, items: [], totalSeconds: 0, totalMeters: 0 };
      weeks.set(key, week);
    }
    week.items.push(item);
    week.totalSeconds += item.duration_seconds;
    week.totalMeters += Number(item.distance_meters ?? 0);
  }
  return [...weeks.values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export function weekLabel(weekStart: string, today: string): string {
  const thisWeek = mondayOf(today);
  if (weekStart === thisWeek) return 'This week';
  if (weekStart === dayjs(thisWeek).subtract(7, 'day').format('YYYY-MM-DD')) return 'Last week';
  const d = dayjs(weekStart);
  return `Week of ${d.format(d.year() === dayjs(today).year() ? 'MMM D' : 'MMM D, YYYY')}`;
}

// ---------------------------------------------------------------------------
// Optimistic cache edits (infinite query pages)
// ---------------------------------------------------------------------------

export interface Pages<T> {
  pages: T[][];
  pageParams: unknown[];
}

export function upsertIntoPages(
  data: Pages<CardioRow> | undefined,
  row: CardioRow,
): Pages<CardioRow> | undefined {
  if (!data) return data;
  const exists = data.pages.some((p) => p.some((r) => r.id === row.id));
  const pages = exists
    ? data.pages.map((p) => p.map((r) => (r.id === row.id ? { ...row, created_at: r.created_at } : r)))
    : data.pages.map((p, i) => (i === 0 ? [row, ...p] : p));
  return { ...data, pages };
}

export function removeFromPages(
  data: Pages<CardioRow> | undefined,
  id: string,
): Pages<CardioRow> | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map((p) => p.filter((r) => r.id !== id)) };
}
