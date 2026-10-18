// Pure helpers for deciding which reminders are due. No I/O, unit-testable.

export interface LocalClock {
  date: string; // YYYY-MM-DD in the user's timezone
  minutes: number; // minutes since local midnight
  isoWeekday: number; // 1 = Monday
}

export function localClock(now: Date, timeZone: string): LocalClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const hour = Number(parts.hour) % 24;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
    isoWeekday: weekdays[parts.weekday as string] ?? 1,
  };
}

export const timeToMinutes = (t: string) => {
  const [h = '0', m = '0'] = t.split(':');
  return Number(h) * 60 + Number(m);
};

/** Quiet hours may wrap past midnight (e.g. 22:00–07:00). */
export function inQuietHours(minutes: number, start: string, end: string): boolean {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === e) return false;
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}

/** True when a wall-clock time fell within the last `windowMinutes` (the job runs every 5 minutes). */
export function isDueNow(clockMinutes: number, target: string, windowMinutes = 10): boolean {
  const diff = clockMinutes - timeToMinutes(target);
  return diff >= 0 && diff < windowMinutes;
}

/** Monday of the ISO week containing `date` (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

export const minutesBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;

/**
 * Water nudge only when meaningfully behind a linear pace toward the target
 * between 08:00 and 20:00 — never a generic "drink more".
 */
export function waterBehind(totalMl: number, goalMl: number, minutes: number): boolean {
  const start = 8 * 60;
  const end = 20 * 60;
  if (minutes <= start) return false;
  const expected = goalMl * Math.min(1, (minutes - start) / (end - start));
  return totalMl < expected * 0.75;
}
