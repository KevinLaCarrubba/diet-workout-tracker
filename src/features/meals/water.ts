import { dayjs } from '@/lib/time';
import { ozToMl, type UnitSystem } from '@/lib/units';

export interface WaterEntry {
  id: string;
  user_id: string;
  amount_ml: number;
  occurred_at: string;
  /** True while the change is still waiting in the device's outbox. */
  pending?: boolean;
}

export interface WaterPreset {
  label: string;
  ml: number;
}

const IMPERIAL_OZ = [8, 12, 16, 24];
const METRIC_ML = [250, 350, 500, 700];

/** Quick-add buttons in the user's units (stored as whole millilitres). */
export function quickAddPresets(units: UnitSystem): WaterPreset[] {
  return units === 'imperial'
    ? IMPERIAL_OZ.map((oz) => ({ label: `${oz} oz`, ml: Math.round(ozToMl(oz)) }))
    : METRIC_ML.map((ml) => ({ label: `${ml} ml`, ml }));
}

export const WATER_MIN_ML = 1;
export const WATER_MAX_ML = 5000;
export const isValidAmount = (ml: number) => Number.isFinite(ml) && ml >= WATER_MIN_ML && ml <= WATER_MAX_ML;

export interface PendingWaterOps {
  upserts: WaterEntry[];
  deletes: string[];
}

/** Outbox items (water_log / delete_water_log) → pending upserts and deletions for one user. */
export function pendingWaterOps(
  items: { kind: string; user_id: string; payload: unknown; updated_at: number }[],
  userId: string,
): PendingWaterOps {
  const upserts: WaterEntry[] = [];
  const deletes: string[] = [];
  for (const item of [...items].sort((a, b) => a.updated_at - b.updated_at)) {
    if (item.user_id !== userId) continue;
    const p = item.payload as Partial<WaterEntry> | null;
    if (!p?.id) continue;
    if (item.kind === 'water_log' && typeof p.amount_ml === 'number' && p.occurred_at) {
      upserts.push({
        id: p.id,
        user_id: userId,
        amount_ml: p.amount_ml,
        occurred_at: p.occurred_at,
        pending: true,
      });
    } else if (item.kind === 'delete_water_log') {
      deletes.push(p.id);
    }
  }
  return { upserts, deletes };
}

/**
 * Server rows overlaid with unsynced device changes: queued upserts replace or
 * add rows by id; queued deletions hide them. Newest first.
 */
export function mergeWaterEntries(server: WaterEntry[], pending: PendingWaterOps): WaterEntry[] {
  const byId = new Map<string, WaterEntry>();
  for (const row of server) byId.set(row.id, row);
  for (const row of pending.upserts) byId.set(row.id, row);
  for (const id of pending.deletes) byId.delete(id);
  return [...byId.values()].sort((a, b) => dayjs(b.occurred_at).valueOf() - dayjs(a.occurred_at).valueOf());
}

/** Entries whose time falls on `date` (YYYY-MM-DD) in the user's timezone. */
export const entriesOnDate = (entries: WaterEntry[], date: string, tz: string) =>
  entries.filter((e) => dayjs(e.occurred_at).tz(tz).format('YYYY-MM-DD') === date);

export const totalMl = (entries: Pick<WaterEntry, 'amount_ml'>[]) =>
  entries.reduce((sum, e) => sum + e.amount_ml, 0);

/** Share of the goal reached, 0–100 (capped for progress bars). */
export function goalPercent(total: number, goal: number | null | undefined) {
  if (!goal || goal <= 0) return 0;
  return Math.min(100, Math.round((total / goal) * 100));
}

/** UTC bounds of a local calendar day, for querying occurred_at. */
export function localDayBounds(date: string, tz: string) {
  const start = dayjs.tz(`${date} 00:00:00`, tz);
  return { from: start.toISOString(), to: start.add(1, 'day').toISOString() };
}

export interface DailyTotal {
  local_date: string;
  total_ml: number;
}

/** One point per day in [from, to] (inclusive), zero-filled. */
export function fillDailyTotals(rows: DailyTotal[], from: string, to: string): DailyTotal[] {
  const map = new Map(rows.map((r) => [r.local_date, r.total_ml]));
  const out: DailyTotal[] = [];
  for (let d = dayjs(from); !d.isAfter(dayjs(to), 'day'); d = d.add(1, 'day')) {
    const key = d.format('YYYY-MM-DD');
    out.push({ local_date: key, total_ml: map.get(key) ?? 0 });
  }
  return out;
}

/** Replaces one day's total (e.g. today's, including unsynced entries). */
export const withDayTotal = (rows: DailyTotal[], date: string, total: number) =>
  rows.map((r) => (r.local_date === date ? { ...r, total_ml: total } : r));
