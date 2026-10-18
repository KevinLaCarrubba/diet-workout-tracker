import { describe, expect, it } from 'vitest';
import { dayjs } from '@/lib/time';
import {
  dailyWeights,
  estimateGoalDate,
  goalProgress,
  lastNDays,
  linearRegression,
  trailingAverage,
  type DailyWeight,
} from './trend';

const NY = 'America/New_York';
const log = (weight_kg: number, measured_at: string) => ({ weight_kg, measured_at });

describe('7-day average (matches SQL weight_trend)', () => {
  // Same fixture and expectations as tests/db/body_progress.test.ts, which runs the real SQL.
  const logs = [
    log(100, '2030-07-01T12:00:00Z'),
    log(99, '2030-07-02T12:00:00Z'),
    log(98.6, '2030-07-03T11:00:00Z'),
    log(98, '2030-07-03T23:30:00Z'), // still Jul 3 in New York; last of the day wins
    log(97, '2030-07-06T12:00:00Z'),
    log(96, '2030-07-07T12:00:00Z'),
    log(95, '2030-07-08T12:00:00Z'),
    log(94, '2030-07-09T12:00:00Z'),
  ];

  it('keeps the last weigh-in per local day', () => {
    expect(dailyWeights(logs, NY).map((d) => [d.date, d.weightKg])).toEqual([
      ['2030-07-01', 100],
      ['2030-07-02', 99],
      ['2030-07-03', 98],
      ['2030-07-06', 97],
      ['2030-07-07', 96],
      ['2030-07-08', 95],
      ['2030-07-09', 94],
    ]);
  });

  it('averages the trailing seven calendar days, with gaps not filled', () => {
    const trend = trailingAverage(dailyWeights(logs, NY)).filter((p) => p.date >= '2030-07-03');
    expect(trend.map((p) => [p.weightKg, p.avg7d, p.entries7d])).toEqual([
      [98, 99, 3],
      [97, 98.5, 4],
      [96, 98, 5],
      [95, 97, 5],
      [94, 96, 5],
    ]);
  });

  it('uses the user timezone, not UTC, for the day boundary', () => {
    const late = [log(80, '2030-07-02T03:00:00Z'), log(81, '2030-07-01T20:00:00Z')];
    // 03:00Z is still Jul 1 in New York, so it's the later weigh-in of Jul 1.
    expect(dailyWeights(late, NY)).toEqual([{ date: '2030-07-01', weightKg: 80 }]);
    expect(dailyWeights(late, 'UTC')).toHaveLength(2);
  });

  it('matches a brute-force definition on irregular data', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const daily: DailyWeight[] = [];
    let d = dayjs.utc('2031-01-01');
    for (let i = 0; i < 120; i++) {
      d = d.add(1 + Math.floor(rand() * 3), 'day');
      daily.push({ date: d.format('YYYY-MM-DD'), weightKg: Math.round((90 + rand() * 5) * 100) / 100 });
    }
    const trend = trailingAverage(daily);
    for (const p of trend) {
      const lo = dayjs.utc(p.date).subtract(6, 'day').format('YYYY-MM-DD');
      const window = daily.filter((x) => x.date >= lo && x.date <= p.date);
      // Exact numeric arithmetic in hundredths, like Postgres numeric + round(avg, 2).
      const cents = window.reduce((s, x) => s + Math.round(x.weightKg * 100), 0);
      expect(p.entries7d).toBe(window.length);
      expect(p.avg7d).toBe(Math.round(cents / window.length) / 100);
    }
  });
});

const series = (start: string, kgs: number[], everyDays = 1): DailyWeight[] =>
  kgs.map((kg, i) => ({
    date: dayjs
      .utc(start)
      .add(i * everyDays, 'day')
      .format('YYYY-MM-DD'),
    weightKg: kg,
  }));

describe('linear regression', () => {
  it('recovers an exact line with zero standard error', () => {
    const reg = linearRegression(series('2030-01-01', [100, 99.9, 99.8, 99.7, 99.6]));
    expect(reg!.slope).toBeCloseTo(-0.1, 10);
    expect(reg!.slopeSe).toBeCloseTo(0, 10);
    expect(reg!.fittedLatest).toBeCloseTo(99.6, 10);
    expect(reg!.spanDays).toBe(4);
  });

  it('computes the slope standard error', () => {
    // x = 0..4, y = 1, 3, 2, 5, 4 → slope 0.8, SSE 3.6, Sxx 10 → SE = sqrt(1.2 / 10)
    const reg = linearRegression(series('2030-01-01', [1, 3, 2, 5, 4]));
    expect(reg!.slope).toBeCloseTo(0.8, 10);
    expect(reg!.slopeSe).toBeCloseTo(Math.sqrt(0.12), 10);
  });

  it('needs at least three points', () => {
    expect(linearRegression(series('2030-01-01', [1, 2]))).toBeNull();
  });
});

describe('lastNDays', () => {
  it('keeps the trailing window including today', () => {
    const daily = series('2030-01-01', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(lastNDays(daily, '2030-01-10', 3).map((d) => d.weightKg)).toEqual([8, 9, 10]);
  });
});

describe('estimateGoalDate', () => {
  it('needs at least 10 weigh-ins', () => {
    const daily = series('2030-01-01', [100, 99.8, 99.6, 99.4, 99.2, 99, 98.8, 98.6, 98.4], 2);
    expect(estimateGoalDate(daily, 90, 100)).toMatchObject({ kind: 'insufficient', weighIns: 9 });
  });

  it('needs the weigh-ins to span at least 14 days', () => {
    const daily = series(
      '2030-01-01',
      Array.from({ length: 12 }, (_, i) => 100 - i * 0.1),
    );
    expect(estimateGoalDate(daily, 90, 100)).toMatchObject({ kind: 'insufficient', spanDays: 11 });
  });

  it('says so when the trend is moving away from the goal', () => {
    const daily = series(
      '2030-01-01',
      Array.from({ length: 15 }, (_, i) => 95 + i * 0.1),
    );
    expect(estimateGoalDate(daily, 90, 100)).toEqual({ kind: 'not-toward-goal' });
  });

  it('returns a range that brackets the point estimate', () => {
    // Losing ~0.1 kg/day with noise, ~5 kg still to go.
    const noise = [
      0.3, -0.2, 0.1, -0.3, 0.2, 0, -0.1, 0.3, -0.2, 0.1, -0.1, 0.2, -0.3, 0.1, 0, 0.2, -0.2, 0.1, -0.1, 0,
    ];
    const daily = series(
      '2030-03-01',
      noise.map((n, i) => 100 - i * 0.1 + n),
    );
    const est = estimateGoalDate(daily, 93, 100);
    expect(est.kind).toBe('range');
    if (est.kind !== 'range') return;
    const reg = linearRegression(daily)!;
    const point = dayjs
      .utc(reg.lastDate)
      .add((93 - reg.fittedLatest) / reg.slope, 'day')
      .format('YYYY-MM-DD');
    expect(est.earliest < point).toBe(true);
    expect(est.latest).not.toBeNull();
    expect(est.latest! > point).toBe(true);
  });

  it('leaves the late end open when the slow pace never reaches the goal', () => {
    const noisy = [100, 98, 100.5, 97.5, 100, 98.5, 99.5, 97, 100, 98, 99, 97.5, 99.5, 98, 98.5];
    // slope ≈ −0.068 kg/day, SE ≈ 0.066: the slow end is ~0 kg/day.
    const est = estimateGoalDate(series('2030-03-01', noisy), 90, 102);
    expect(est).toEqual({ kind: 'range', earliest: '2030-05-17', latest: null });
  });

  it('handles gaining goals', () => {
    const daily = series(
      '2030-01-01',
      Array.from({ length: 15 }, (_, i) => 60 + i * 0.05),
    );
    const est = estimateGoalDate(daily, 65, 60);
    expect(est.kind).toBe('range');
  });

  it('reports a reached goal', () => {
    const daily = series(
      '2030-01-01',
      Array.from({ length: 15 }, (_, i) => 92 - i * 0.2),
    );
    expect(estimateGoalDate(daily, 90, 100)).toEqual({ kind: 'reached' });
  });
});

describe('goalProgress', () => {
  it('works for losing and gaining and clamps', () => {
    expect(goalProgress(100, 90, 95)).toBeCloseTo(0.5);
    expect(goalProgress(60, 70, 65)).toBeCloseTo(0.5);
    expect(goalProgress(100, 90, 102)).toBe(0);
    expect(goalProgress(100, 90, 85)).toBe(1);
  });
});
