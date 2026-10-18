import { env } from '@/lib/env';
import { isIos, isStandalone } from '@/lib/platform';
import { supabase } from '@/lib/supabase';

export type PushSupport =
  { supported: true } | { supported: false; reason: 'no-sw' | 'no-push' | 'ios-not-installed' };

export function pushSupport(): PushSupport {
  if (!('serviceWorker' in navigator)) return { supported: false, reason: 'no-sw' };
  // iOS/iPadOS only exposes Web Push to apps added to the Home Screen.
  if (isIos() && !isStandalone()) return { supported: false, reason: 'ios-not-installed' };
  if (!('PushManager' in window) || !('Notification' in window))
    return { supported: false, reason: 'no-push' };
  return { supported: true };
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function deviceLabel(ua = navigator.userAgent): string {
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : 'Device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : '';
  return [os, browser].filter(Boolean).join(' · ');
}

async function registration() {
  if (!(await navigator.serviceWorker.getRegistration())) {
    throw new Error('The app needs to finish installing its offline support first. Reload and try again.');
  }
  return navigator.serviceWorker.ready;
}

/** Build-time key if provided, otherwise the server's key (created on first use). */
async function vapidPublicKey(): Promise<string> {
  if (env.VITE_VAPID_PUBLIC_KEY) return env.VITE_VAPID_PUBLIC_KEY;
  const { data } = await supabase.rpc('vapid_public_key');
  if (data) return data;
  const init = await supabase.functions.invoke<{ publicKey: string }>('send-reminders', {
    body: { action: 'init' },
  });
  if (init.error || !init.data?.publicKey) throw new Error('Push notifications are not available right now.');
  return init.data.publicKey;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Asks for permission (must be called from a tap) and stores this device's subscription. */
export async function enablePush(): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for FitTrack. Allow them in your browser or system settings, then try again.'
        : 'Notification permission was not granted.',
    );
  }
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(await vapidPublicKey()),
    }));
  await saveSubscription(sub);
  return sub;
}

export async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_device_label: deviceLabel(),
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
}

/** Unsubscribes this browser and marks the server record revoked. */
export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase
    .from('push_subscriptions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export async function sendTestNotification(): Promise<{ delivered: number; devices: number }> {
  const { data, error } = await supabase.functions.invoke<{ delivered: number; devices: number }>(
    'send-reminders',
    {
      body: { action: 'test' },
    },
  );
  if (error) throw error;
  return data ?? { delivered: 0, devices: 0 };
}
