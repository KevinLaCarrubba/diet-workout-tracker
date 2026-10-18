import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

export { dayjs };

export const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timezoneOptions = (): string[] => {
  const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(
    'timeZone',
  );
  return list && list.length > 0
    ? list
    : ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles'];
};

/** Today's calendar date (YYYY-MM-DD) in the given IANA timezone. */
export const localDate = (tz: string, at: Date | string = new Date()) =>
  dayjs(at).tz(tz).format('YYYY-MM-DD');

/** ISO weekday 1 (Mon) … 7 (Sun) for a local YYYY-MM-DD date. */
export const isoWeekday = (date: string) => {
  const d = dayjs(date).day();
  return d === 0 ? 7 : d;
};

/** Combines a local date and HH:mm[:ss] time in `tz` into a UTC ISO timestamp. */
export const zonedToUtc = (date: string, time: string, tz: string) =>
  dayjs.tz(`${date} ${time.length === 5 ? `${time}:00` : time}`, tz).toISOString();

/** 13:30:00 → 1:30 PM */
export function formatLocalTime(time: string) {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  return h > 0 ? `${h}:${mm}:${String(sec).padStart(2, '0')}` : `${mm}:${String(sec).padStart(2, '0')}`;
}
