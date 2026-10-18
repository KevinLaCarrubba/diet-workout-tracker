import { canVibrate } from './platform';

let audioCtx: AudioContext | null = null;

/** Must be called from a user gesture once so iOS allows later sounds. */
export function unlockAudio() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

/** Short two-tone chime for the end of a rest period (only while the app is open). */
export function playChime() {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const start = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = start + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch {
    // Audio unavailable (e.g. no user gesture yet); vibration/visual cue still fire.
  }
}

export function vibrate(pattern: number | number[] = [200, 100, 200]) {
  if (canVibrate()) navigator.vibrate(pattern);
}
