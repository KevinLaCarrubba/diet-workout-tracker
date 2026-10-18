// Reminder job, run every 5 minutes by pg_cron (x-cron-secret header), and the
// "send me a test notification" action for signed-in users.
//
// Guarantees:
//  * Idempotent: each reminder occurrence has a unique key in notification_logs;
//    the row is claimed before sending, so overlapping runs never double-send.
//  * Status-checked: missed-workout alerts only for workouts still "scheduled"
//    with no session started; meal follow-ups only while the meal is pending.
//  * Respects opt-in toggles, quiet hours and each user's IANA timezone.
import webpush from 'npm:web-push@3.6.7';
import { serviceClient, userFromRequest } from '../_shared/clients.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { inQuietHours, isDueNow, localClock, waterBehind, weekStart } from './schedule.ts';

type ReminderType =
  | 'meal_due'
  | 'meal_followup'
  | 'workout_upcoming'
  | 'workout_missed'
  | 'weigh_in'
  | 'water'
  | 'weekly_summary';

interface Candidate {
  userId: string;
  type: ReminderType;
  key: string;
  title: string;
  body: string;
  url: string;
  relatedId?: string;
}

interface Subscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
}

const WINDOW_MIN = 10;
const MEAL_FOLLOWUP_MIN = 45;

type Admin = ReturnType<typeof serviceClient>;

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function secret(admin: Admin, name: string): Promise<string | null> {
  const { data } = await admin.rpc('app_secret', { p_name: name });
  return (data as string | null) ?? null;
}

/**
 * VAPID keys and the cron secret live in Supabase Vault. If they don't exist
 * yet they are generated here, so no private key is ever handled by a person.
 * Env vars (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / CRON_SECRET) override.
 */
async function ensurePushConfig(admin: Admin, { create }: { create: boolean }) {
  let pub = Deno.env.get('VAPID_PUBLIC_KEY') ?? (await secret(admin, 'fittrack_vapid_public'));
  let priv = Deno.env.get('VAPID_PRIVATE_KEY') ?? (await secret(admin, 'fittrack_vapid_private'));
  if ((!pub || !priv) && create) {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const raw = new Uint8Array([4, ...fromB64url(jwk.x!), ...fromB64url(jwk.y!)]);
    pub = b64url(raw);
    priv = jwk.d!;
    await admin.rpc('set_app_secret', { p_name: 'fittrack_vapid_private', p_value: priv });
    await admin.rpc('set_app_secret', { p_name: 'fittrack_vapid_public', p_value: pub });
  }
  if (create && !Deno.env.get('CRON_SECRET') && !(await secret(admin, 'fittrack_cron_secret'))) {
    await admin.rpc('set_app_secret', {
      p_name: 'fittrack_cron_secret',
      p_value: b64url(crypto.getRandomValues(new Uint8Array(32))),
    });
  }
  if (!pub || !priv) throw new HttpError(503, 'Push is not set up yet');
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:push@fittrack.app', pub, priv);
  return { publicKey: pub };
}

const fmtTime = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

async function sendToDevices(
  admin: Admin,
  subs: Subscription[],
  payload: { title: string; body: string; url: string; tag: string },
) {
  let delivered = 0;
  let lastError: string | null = null;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60, urgency: 'normal' },
      );
      delivered += 1;
      await admin
        .from('push_subscriptions')
        .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
        .eq('id', sub.id);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      lastError = status ? `http_${status}` : 'send_failed';
      // 404/410: the browser unsubscribed or the subscription expired.
      const gone = status === 404 || status === 410;
      await admin
        .from('push_subscriptions')
        .update({
          failure_count: sub.failure_count + 1,
          ...(gone || sub.failure_count + 1 >= 5 ? { revoked_at: new Date().toISOString() } : {}),
        })
        .eq('id', sub.id);
    }
  }
  return { delivered, lastError };
}

async function deliver(
  admin: ReturnType<typeof serviceClient>,
  c: Candidate,
  subs: Subscription[],
  quiet: boolean,
) {
  // Claim the occurrence first; a duplicate key means it was already handled.
  const { data: claimed, error } = await admin
    .from('notification_logs')
    .upsert(
      {
        user_id: c.userId,
        reminder_type: c.type,
        related_entity_id: c.relatedId ?? null,
        occurrence_key: c.key,
        status: quiet ? 'skipped' : 'failed',
        error_code: quiet ? 'quiet_hours' : 'pending',
        title: c.title,
        body: c.body,
      },
      { onConflict: 'occurrence_key', ignoreDuplicates: true },
    )
    .select('id');
  if (error) throw error;
  if (!claimed || claimed.length === 0 || quiet) return 'skipped';

  const { delivered, lastError } = await sendToDevices(admin, subs, {
    title: c.title,
    body: c.body,
    url: c.url,
    tag: c.key,
  });
  await admin
    .from('notification_logs')
    .update({
      status: delivered > 0 ? 'sent' : 'failed',
      delivered_at: delivered > 0 ? new Date().toISOString() : null,
      error_code: delivered > 0 ? null : lastError,
      devices_attempted: subs.length,
      devices_delivered: delivered,
    })
    .eq('id', claimed[0]!.id);
  return delivered > 0 ? 'sent' : 'failed';
}

async function collectForUser(
  admin: ReturnType<typeof serviceClient>,
  now: Date,
  profile: { id: string; timezone: string },
  s: Record<string, unknown> & {
    notify_meals: boolean;
    notify_meal_followup: boolean;
    notify_workouts: boolean;
    notify_missed_workouts: boolean;
    missed_workout_grace_minutes: number;
    notify_weigh_in: boolean;
    notify_water: boolean;
    notify_weekly_summary: boolean;
    water_goal_ml: number;
    weigh_in_time: string;
    water_reminder_times: string[];
    workout_reminder_minutes: number;
    weekly_summary_weekday: number;
    weekly_summary_time: string;
  },
): Promise<Candidate[]> {
  const userId = profile.id;
  const clock = localClock(now, profile.timezone);
  const out: Candidate[] = [];
  const iso = (ms: number) => new Date(ms).toISOString();
  const t = now.getTime();

  // Make sure today's meals/workouts exist even if the app wasn't opened today.
  await Promise.all([
    admin.rpc('materialize_meal_occurrences', { p_user: userId, p_from: clock.date, p_to: clock.date }),
    admin.rpc('materialize_scheduled_workouts', { p_user: userId, p_from: clock.date, p_to: clock.date }),
  ]);

  if (s.notify_meals || s.notify_meal_followup) {
    const { data: meals } = await admin
      .from('meal_occurrences')
      .select(
        'id, label_snapshot, description_snapshot, local_time, scheduled_at, snoozed_until, schedule:meal_schedules(relative_event, relative_offset_minutes)',
      )
      .eq('user_id', userId)
      .eq('status', 'pending')
      .eq('local_date', clock.date);

    // A workout finished today drives "after training" meals (e.g. the post-workout meal).
    const { data: finished } = await admin
      .from('workout_sessions')
      .select('ended_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('ended_at', iso(t - 6 * 3600_000))
      .order('ended_at', { ascending: false })
      .limit(1);
    const workoutEnd = finished?.[0]?.ended_at ? Date.parse(finished[0].ended_at) : null;

    for (const m of meals ?? []) {
      const name = [m.label_snapshot, m.description_snapshot].filter(Boolean).join(' — ');
      const rule = m.schedule as unknown as {
        relative_event: string | null;
        relative_offset_minutes: number | null;
      } | null;
      const snoozedUntil = m.snoozed_until ? Date.parse(m.snoozed_until) : null;
      const snoozed = snoozedUntil != null && snoozedUntil > t;
      let due = Date.parse(m.scheduled_at);
      if (rule?.relative_event === 'workout_end' && workoutEnd != null) {
        due = Math.min(due, workoutEnd + (rule.relative_offset_minutes ?? 0) * 60_000);
      }
      const late = (t - due) / 60_000;

      if (s.notify_meals && !snoozed && late >= 0 && late < WINDOW_MIN) {
        out.push({
          userId,
          type: 'meal_due',
          key: `meal:${m.id}:due`,
          relatedId: m.id,
          title: name,
          body:
            rule?.relative_event === 'workout_end' &&
            workoutEnd != null &&
            due === workoutEnd + (rule.relative_offset_minutes ?? 0) * 60_000
              ? 'Workout done — time for your post-workout meal.'
              : `Scheduled for ${fmtTime(m.local_time)}. Tap to mark it eaten, skip or snooze.`,
          url: '/meals',
        });
      }
      // Snoozed: one reminder when the snooze ends.
      if (
        s.notify_meals &&
        snoozedUntil != null &&
        t >= snoozedUntil &&
        t - snoozedUntil < WINDOW_MIN * 60_000
      ) {
        out.push({
          userId,
          type: 'meal_due',
          key: `meal:${m.id}:snooze:${m.snoozed_until}`,
          relatedId: m.id,
          title: name,
          body: 'Snooze is over — mark it eaten or skipped when you can.',
          url: '/meals',
        });
      }
      if (
        s.notify_meal_followup &&
        !snoozed &&
        late >= MEAL_FOLLOWUP_MIN &&
        late < MEAL_FOLLOWUP_MIN + WINDOW_MIN
      ) {
        out.push({
          userId,
          type: 'meal_followup',
          key: `meal:${m.id}:followup`,
          relatedId: m.id,
          title: `${m.label_snapshot} is still open`,
          body: 'Mark it eaten, skipped or move it — no worries either way.',
          url: '/meals',
        });
      }
    }
  }

  if (s.notify_workouts || s.notify_missed_workouts) {
    const lead = s.workout_reminder_minutes;
    const grace = s.missed_workout_grace_minutes;
    const { data: workouts } = await admin
      .from('scheduled_workouts')
      .select('id, local_time, scheduled_at, status, template:workout_templates(title)')
      .eq('user_id', userId)
      .eq('status', 'scheduled')
      .eq('is_rest', false)
      .not('scheduled_at', 'is', null)
      .gte('scheduled_at', iso(t - (grace + 60) * 60_000))
      .lte('scheduled_at', iso(t + (lead + WINDOW_MIN) * 60_000));
    for (const w of workouts ?? []) {
      const title = (w.template as unknown as { title: string } | null)?.title ?? 'Workout';
      const at = Date.parse(w.scheduled_at as string);
      const untilStart = (at - t) / 60_000;
      if (s.notify_workouts && untilStart <= lead && untilStart > lead - WINDOW_MIN) {
        out.push({
          userId,
          type: 'workout_upcoming',
          key: `workout:${w.id}:upcoming`,
          relatedId: w.id,
          title: `${title} at ${fmtTime(w.local_time as string)}`,
          body: lead > 0 ? `Starts in about ${lead} minutes.` : 'Time to train.',
          url: '/workouts',
        });
      }
      const overdue = (t - at) / 60_000 - grace;
      if (s.notify_missed_workouts && overdue >= 0 && overdue < 60) {
        // Re-check: anything started (even unfinished) means it isn't missed.
        const { count } = await admin
          .from('workout_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('scheduled_workout_id', w.id);
        if ((count ?? 0) === 0) {
          out.push({
            userId,
            type: 'workout_missed',
            key: `workout:${w.id}:missed`,
            relatedId: w.id,
            title: `Still planning on ${title}?`,
            body: 'Start it now, move it to another day, or mark it skipped.',
            url: '/workouts/schedule',
          });
        }
      }
    }
  }

  const since = iso(t - 26 * 3600_000);
  if (s.notify_weigh_in && isDueNow(clock.minutes, s.weigh_in_time, WINDOW_MIN)) {
    const { data: logs } = await admin
      .from('weight_logs')
      .select('measured_at')
      .eq('user_id', userId)
      .gte('measured_at', since);
    const loggedToday = (logs ?? []).some(
      (l) => localClock(new Date(l.measured_at), profile.timezone).date === clock.date,
    );
    if (!loggedToday) {
      out.push({
        userId,
        type: 'weigh_in',
        key: `weigh_in:${userId}:${clock.date}`,
        title: 'Morning weigh-in',
        body: 'A quick weigh-in keeps your 7-day average accurate.',
        url: '/progress',
      });
    }
  }

  if (s.notify_water) {
    for (const time of s.water_reminder_times ?? []) {
      if (!isDueNow(clock.minutes, time, WINDOW_MIN)) continue;
      const { data: logs } = await admin
        .from('water_logs')
        .select('amount_ml, occurred_at')
        .eq('user_id', userId)
        .gte('occurred_at', since);
      const total = (logs ?? [])
        .filter((l) => localClock(new Date(l.occurred_at), profile.timezone).date === clock.date)
        .reduce((sum, l) => sum + l.amount_ml, 0);
      if (waterBehind(total, s.water_goal_ml, clock.minutes)) {
        out.push({
          userId,
          type: 'water',
          key: `water:${userId}:${clock.date}:${time.slice(0, 5)}`,
          title: 'Water check-in',
          body: 'You set a daily water target — tap to log a glass.',
          url: '/meals?tab=water',
        });
      }
    }
  }

  if (
    s.notify_weekly_summary &&
    clock.isoWeekday === s.weekly_summary_weekday &&
    isDueNow(clock.minutes, s.weekly_summary_time, WINDOW_MIN)
  ) {
    const start = weekStart(clock.date);
    const { data: summary } = await admin.rpc('weekly_summary_for', { p_user: userId, p_week_start: start });
    const sm = (summary ?? {}) as Record<string, number | null>;
    out.push({
      userId,
      type: 'weekly_summary',
      key: `weekly:${userId}:${start}`,
      title: 'Your week in FitTrack',
      body: `${sm.workouts_completed ?? 0} workouts · ${sm.cardio_minutes ?? 0} cardio min · water target hit ${sm.water_days_on_target ?? 0}/7 days`,
      url: '/progress',
    });
  }

  return out;
}

async function runJob(admin: Admin) {
  await ensurePushConfig(admin, { create: false });
  const now = new Date();
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, failure_count')
    .is('revoked_at', null);
  if (error) throw error;
  const byUser = new Map<string, Subscription[]>();
  for (const sub of subs ?? []) byUser.set(sub.user_id, [...(byUser.get(sub.user_id) ?? []), sub]);
  if (byUser.size === 0) return { users: 0, sent: 0, skipped: 0, failed: 0 };

  const userIds = [...byUser.keys()];
  const [{ data: profiles }, { data: settings }] = await Promise.all([
    admin.from('profiles').select('id, timezone').in('id', userIds),
    admin.from('user_settings').select('*').in('user_id', userIds),
  ]);
  const totals = { users: userIds.length, sent: 0, skipped: 0, failed: 0 };

  for (const profile of profiles ?? []) {
    const s = settings?.find((x) => x.user_id === profile.id);
    if (!s) continue;
    try {
      const clock = localClock(now, profile.timezone);
      const quiet =
        s.quiet_hours_enabled && inQuietHours(clock.minutes, s.quiet_hours_start, s.quiet_hours_end);
      const candidates = await collectForUser(admin, now, profile, s);
      for (const c of candidates) {
        const result = await deliver(admin, c, byUser.get(profile.id) ?? [], quiet);
        totals[result] += 1;
      }
    } catch (e) {
      // One user's failure never blocks reminders for the others.
      console.error('reminders failed for user', profile.id, e);
      totals.failed += 1;
    }
  }
  return totals;
}

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const admin = serviceClient();

    // pg_cron: shared secret in a header.
    const provided = req.headers.get('x-cron-secret');
    if (provided) {
      const expected = Deno.env.get('CRON_SECRET') ?? (await secret(admin, 'fittrack_cron_secret'));
      if (!expected || provided !== expected) throw new HttpError(401, 'Bad cron secret');
      return json(await runJob(admin));
    }

    // Otherwise a signed-in member: set up push (first time) or send a test.
    const { user } = await userFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const { publicKey } = await ensurePushConfig(admin, { create: true });
    if (body.action === 'init') return json({ publicKey });

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, failure_count')
      .eq('user_id', user.id)
      .is('revoked_at', null);
    if (!subs || subs.length === 0) throw new HttpError(404, 'No devices are subscribed');
    const { delivered, lastError } = await sendToDevices(admin, subs, {
      title: 'FitTrack notifications are on',
      body: 'This is a test. Reminders will arrive like this.',
      url: '/settings',
      tag: `test:${user.id}`,
    });
    return json({ delivered, devices: subs.length, error: delivered ? null : lastError });
  }),
);
