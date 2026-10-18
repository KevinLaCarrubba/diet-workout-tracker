import { describe, expect, it } from 'vitest';
import {
  activityName,
  buildCardioRow,
  distanceToMeters,
  emptyCardioForm,
  formatCardioDuration,
  formatPace,
  fromLocalInput,
  groupByWeek,
  kphToSpeed,
  mergeCardio,
  metersToDistance,
  mondayOf,
  numOrNull,
  paceSecondsPerKm,
  payloadToRow,
  removeFromPages,
  rowToForm,
  speedToKph,
  toLocalInput,
  upsertIntoPages,
  validateCardio,
  weekLabel,
  type CardioFormValues,
  type CardioItem,
  type CardioRow,
} from './cardioModel';

const TZ = 'America/New_York';

const row = (id: string, occurred_at: string, extra: Partial<CardioRow> = {}): CardioRow =>
  payloadToRow(
    { id, user_id: 'u1', activity_type: 'walking', occurred_at, duration_seconds: 1800, ...extra },
    '2026-10-01T00:00:00Z',
  );

describe('conversions', () => {
  it('converts distance and speed to metric and back', () => {
    expect(distanceToMeters(1, 'imperial')).toBe(1609.3);
    expect(distanceToMeters(5, 'metric')).toBe(5000);
    expect(metersToDistance(1609.3, 'imperial')).toBe(1);
    expect(speedToKph(3.5, 'imperial')).toBe(5.63);
    expect(speedToKph(10, 'metric')).toBe(10);
    expect(kphToSpeed(5.63, 'imperial')).toBe(3.5);
  });

  it('computes and formats pace', () => {
    expect(paceSecondsPerKm(1800, 5000)).toBe(360);
    expect(paceSecondsPerKm(1800, null)).toBeNull();
    expect(paceSecondsPerKm(1800, 0)).toBeNull();
    expect(formatPace(360, 'metric')).toBe('6:00 /km');
    expect(formatPace(360, 'imperial')).toBe('9:39 /mi');
    expect(formatPace(null, 'metric')).toBeNull();
  });

  it('parses number inputs', () => {
    expect(numOrNull('')).toBeNull();
    expect(numOrNull('2,5')).toBe(2.5);
    expect(numOrNull(3)).toBe(3);
    expect(numOrNull('abc')).toBeNull();
  });

  it('formats durations', () => {
    expect(formatCardioDuration(45)).toBe('45s');
    expect(formatCardioDuration(1800)).toBe('30 min');
    expect(formatCardioDuration(1925)).toBe('32m 05s');
    expect(formatCardioDuration(3900)).toBe('1h 05m');
  });

  it('round-trips local date-times in the user timezone', () => {
    expect(toLocalInput('2026-10-18T14:30:00Z', TZ)).toBe('2026-10-18T10:30');
    expect(fromLocalInput('2026-10-18T10:30', TZ)).toBe('2026-10-18T14:30:00.000Z');
  });
});

describe('form ⇄ row', () => {
  const base: CardioFormValues = { ...emptyCardioForm(TZ, new Date('2026-10-18T14:30:00Z')) };

  it('defaults to now in the user timezone', () => {
    expect(base.occurred_local).toBe('2026-10-18T10:30');
  });

  it('builds a metric insert row with only granted columns', () => {
    const r = buildCardioRow(
      {
        ...base,
        activity_type: 'running',
        minutes: 30,
        seconds: 15,
        distance: 3,
        speed: 6,
        incline: 1.5,
        avg_hr: 150,
        max_hr: '172',
        notes: '  easy  ',
      },
      { id: 'id1', userId: 'u1', units: 'imperial', timezone: TZ },
    );
    expect(r).toEqual({
      id: 'id1',
      user_id: 'u1',
      activity_type: 'running',
      custom_name: null,
      occurred_at: '2026-10-18T14:30:00.000Z',
      duration_seconds: 1815,
      distance_meters: 4828,
      pace_seconds_per_km: 376,
      incline_percent: 1.5,
      speed_kph: 9.66,
      resistance_level: null,
      avg_heart_rate: 150,
      max_heart_rate: 172,
      notes: 'easy',
    });
  });

  it('keeps custom names only for custom activities and survives an edit round-trip', () => {
    const custom = buildCardioRow(
      { ...base, activity_type: 'custom', custom_name: ' Swimming ', minutes: 20 },
      { id: 'id2', userId: 'u1', units: 'metric', timezone: TZ },
    );
    expect(custom.custom_name).toBe('Swimming');
    expect(custom.distance_meters).toBeNull();
    expect(custom.pace_seconds_per_km).toBeNull();
    const form = rowToForm(payloadToRow(custom), 'metric', TZ);
    expect(form).toMatchObject({
      activity_type: 'custom',
      custom_name: 'Swimming',
      minutes: 20,
      seconds: 0,
      distance: '',
    });
    expect(activityName(payloadToRow(custom))).toBe('Swimming');
    expect(activityName(row('x', '2026-10-01T00:00:00Z', { activity_type: 'stairmaster' }))).toBe(
      'StairMaster',
    );
  });

  it('validates required and ranged fields', () => {
    expect(validateCardio(base).minutes).toBeDefined();
    const errors = validateCardio({
      ...base,
      minutes: 10,
      activity_type: 'custom',
      avg_hr: 160,
      max_hr: 150,
      incline: 50,
      seconds: 75,
    });
    expect(Object.keys(errors).sort()).toEqual(['custom_name', 'incline', 'max_hr', 'seconds']);
    expect(validateCardio({ ...base, minutes: 10 })).toEqual({});
  });
});

describe('mergeCardio', () => {
  it('overlays queued saves, hides queued deletes and sorts newest first', () => {
    const server = [
      row('a', '2026-10-10T10:00:00Z'),
      row('b', '2026-10-12T10:00:00Z'),
      row('c', '2026-10-11T10:00:00Z'),
    ];
    const merged = mergeCardio(server, [
      {
        kind: 'cardio_session',
        payload: {
          id: 'a',
          user_id: 'u1',
          activity_type: 'running',
          occurred_at: '2026-10-10T10:00:00Z',
          duration_seconds: 600,
        },
      },
      {
        kind: 'cardio_session',
        payload: {
          id: 'new',
          user_id: 'u1',
          activity_type: 'rowing',
          occurred_at: '2026-10-13T10:00:00Z',
          duration_seconds: 900,
        },
      },
      { kind: 'delete_cardio_session', payload: { id: 'c' } },
      { kind: 'water_log', payload: { id: 'w' } },
    ]);
    expect(merged.map((m) => [m.id, m.pending])).toEqual([
      ['new', true],
      ['b', false],
      ['a', true],
    ]);
    expect(merged.find((m) => m.id === 'a')).toMatchObject({
      activity_type: 'running',
      duration_seconds: 600,
    });
  });
});

describe('weekly grouping', () => {
  it('finds Monday', () => {
    expect(mondayOf('2026-10-18')).toBe('2026-10-12'); // Sunday
    expect(mondayOf('2026-10-12')).toBe('2026-10-12');
    expect(mondayOf('2026-10-14')).toBe('2026-10-12');
  });

  it('groups by local week with totals', () => {
    const items: CardioItem[] = [
      // Monday 01:00 UTC is still Sunday evening in New York.
      { ...row('late', '2026-10-19T01:00:00Z', { distance_meters: 1000 }), pending: false },
      { ...row('mid', '2026-10-14T12:00:00Z', { distance_meters: 2500 }), pending: false },
      { ...row('prev', '2026-10-07T12:00:00Z'), pending: true },
    ];
    const weeks = groupByWeek(items, TZ);
    expect(weeks.map((w) => [w.weekStart, w.items.length, w.totalSeconds, w.totalMeters])).toEqual([
      ['2026-10-12', 2, 3600, 3500],
      ['2026-10-05', 1, 1800, 0],
    ]);
  });

  it('labels weeks relative to today', () => {
    expect(weekLabel('2026-10-12', '2026-10-18')).toBe('This week');
    expect(weekLabel('2026-10-05', '2026-10-18')).toBe('Last week');
    expect(weekLabel('2026-09-28', '2026-10-18')).toBe('Week of Sep 28');
    expect(weekLabel('2025-12-29', '2026-10-18')).toBe('Week of Dec 29, 2025');
  });
});

describe('optimistic page edits', () => {
  const data = {
    pages: [[row('a', '2026-10-10T10:00:00Z')], [row('b', '2026-10-01T10:00:00Z')]],
    pageParams: [0, 1],
  };

  it('inserts new rows at the top and replaces existing ones in place', () => {
    const added = upsertIntoPages(data, row('n', '2026-10-11T10:00:00Z'))!;
    expect(added.pages[0]!.map((r) => r.id)).toEqual(['n', 'a']);
    const edited = upsertIntoPages(data, row('b', '2026-10-01T10:00:00Z', { duration_seconds: 60 }))!;
    expect(edited.pages[1]![0]!.duration_seconds).toBe(60);
    expect(upsertIntoPages(undefined, row('x', '2026-10-01T10:00:00Z'))).toBeUndefined();
  });

  it('removes rows', () => {
    expect(removeFromPages(data, 'a')!.pages[0]).toEqual([]);
  });
});
