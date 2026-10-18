import { dayjs } from '@/lib/time';

/** One weight per local calendar day. */
export interface DailyWeight {
  /** YYYY-MM-DD in the user's timezone. */
  date: string;
  weightKg: number;
}

export interface TrendPoint extends DailyWeight {
  /** Mean of the daily weights in [date − 6 days, date], rounded to 2 decimals (matches SQL). */
  avg7d: number;
  /** How many daily weights went into avg7d. */
  entries7d: number;
}

interface WeighIn {
  weight_kg: number;
  measured_at: string;
}

const dayNumber = (date: string) => Math.round(dayjs.utc(date).valueOf() / 86_400_000);

/**
 * Collapses weigh-ins to the last one of each local day, ascending by date.
 * Mirrors `distinct on (local date) … order by measured_at desc` in weight_trend().
 */
export function dailyWeights(logs: WeighIn[], timezone: string): DailyWeight[] {
  const byDay = new Map<string, { at: number; kg: number }>();
  for (const log of logs) {
    const date = dayjs(log.measured_at).tz(timezone).format('YYYY-MM-DD');
    const at = dayjs(log.measured_at).valueOf();
    const prev = byDay.get(date);
    if (!prev || at > prev.at) byDay.set(date, { at, kg: Number(log.weight_kg) });
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, v]) => ({ date, weightKg: v.kg }));
}

/**
 * Trailing seven-calendar-day average of daily weights: for each day with a
 * weigh-in, the mean of all daily weights dated within the previous six days
 * and that day. Same definition as `range between interval '6 days' preceding
 * and current row` in weight_trend(). Gaps are not filled.
 */
export function trailingAverage(daily: DailyWeight[]): TrendPoint[] {
  const sorted = [...daily].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const days = sorted.map((d) => dayNumber(d.date));
  // Weights are numeric(5,2) in Postgres; sum exact hundredths so rounding matches SQL.
  const cents = sorted.map((d) => Math.round(d.weightKg * 100));
  let start = 0;
  let sum = 0;
  return sorted.map((point, i) => {
    sum += cents[i]!;
    while (days[start]! < days[i]! - 6) sum -= cents[start++]!;
    const n = i - start + 1;
    return { ...point, avg7d: Math.round(sum / n) / 100, entries7d: n };
  });
}

export interface Regression {
  /** kg per day */
  slope: number;
  intercept: number;
  /** Standard error of the slope (kg per day). */
  slopeSe: number;
  n: number;
  /** Days between the first and last point. */
  spanDays: number;
  /** Fitted weight at the last point. */
  fittedLatest: number;
  lastDate: string;
}

/** Ordinary least squares of weight on day number. Needs ≥ 3 points over ≥ 1 day. */
export function linearRegression(points: DailyWeight[]): Regression | null {
  const n = points.length;
  if (n < 3) return null;
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const x0 = dayNumber(sorted[0]!.date);
  const xs = sorted.map((p) => dayNumber(p.date) - x0);
  const ys = sorted.map((p) => p.weightKg);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - meanX) ** 2;
    sxy += (xs[i]! - meanX) * (ys[i]! - meanY);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i]! - (intercept + slope * xs[i]!)) ** 2;
  const slopeSe = Math.sqrt(sse / (n - 2) / sxx);
  const spanDays = xs[n - 1]!;
  return {
    slope,
    intercept,
    slopeSe,
    n,
    spanDays,
    fittedLatest: intercept + slope * spanDays,
    lastDate: sorted[n - 1]!.date,
  };
}

/** Daily weights in the trailing `days`-day window ending on `today` (inclusive). */
export function lastNDays(daily: DailyWeight[], today: string, days: number): DailyWeight[] {
  const end = dayNumber(today);
  return daily.filter((d) => {
    const n = dayNumber(d.date);
    return n <= end && n > end - days;
  });
}

export const MIN_WEIGH_INS = 10;
export const MIN_SPAN_DAYS = 14;
/** Estimates further out than this are not shown as a date. */
const MAX_HORIZON_DAYS = 730;

export type GoalEstimate =
  | { kind: 'insufficient'; weighIns: number; spanDays: number }
  | { kind: 'reached' }
  | { kind: 'not-toward-goal' }
  | {
      kind: 'range';
      /** Earliest plausible date (faster pace). */
      earliest: string;
      /** Latest plausible date (slower pace); null when the slow end never reaches the goal. */
      latest: string | null;
    };

/**
 * Goal-date estimate with uncertainty. Uses the regression slope ± one standard
 * error to bound the pace, so the answer is always a range, never a single date.
 */
export function estimateGoalDate(daily28: DailyWeight[], targetKg: number, startKg: number): GoalEstimate {
  const sorted = [...daily28].sort((a, b) => (a.date < b.date ? -1 : 1));
  const spanDays =
    sorted.length > 1 ? dayNumber(sorted[sorted.length - 1]!.date) - dayNumber(sorted[0]!.date) : 0;
  const reg = linearRegression(sorted);
  if (!reg || sorted.length < MIN_WEIGH_INS || spanDays < MIN_SPAN_DAYS) {
    return { kind: 'insufficient', weighIns: sorted.length, spanDays };
  }
  // Direction the user is trying to go: losing if goal is below start.
  const direction = targetKg < startKg ? -1 : targetKg > startKg ? 1 : 0;
  const remaining = targetKg - reg.fittedLatest;
  if (direction === 0 || remaining * direction <= 0) return { kind: 'reached' };

  const towardPace = reg.slope * direction; // kg/day toward the goal (positive = good)
  if (towardPace <= 0) return { kind: 'not-toward-goal' };

  const fast = towardPace + reg.slopeSe;
  const slow = towardPace - reg.slopeSe;
  const distance = Math.abs(remaining);
  const earliestDays = Math.ceil(distance / fast);
  if (earliestDays > MAX_HORIZON_DAYS) return { kind: 'not-toward-goal' };
  const latestDays = slow > 0 ? Math.ceil(distance / slow) : null;
  const base = dayjs.utc(reg.lastDate);
  return {
    kind: 'range',
    earliest: base.add(earliestDays, 'day').format('YYYY-MM-DD'),
    latest:
      latestDays !== null && latestDays <= MAX_HORIZON_DAYS
        ? base.add(latestDays, 'day').format('YYYY-MM-DD')
        : null,
  };
}

/** Share of the way from start to goal, clamped to [0, 1]. */
export function goalProgress(startKg: number, targetKg: number, currentKg: number): number {
  const total = startKg - targetKg;
  if (total === 0) return 1;
  const done = (startKg - currentKg) / total;
  return Math.min(1, Math.max(0, done));
}
