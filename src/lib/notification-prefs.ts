import { useCallback, useEffect, useState } from "react";

const SOUND_KEY = "teamsync.notify.sound";
const BANNER_KEY = "teamsync.notify.bannerDismissed";

function read(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  return raw === null ? fallback : raw === "true";
}

function useBoolPref(key: string, fallback: boolean) {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    setValue(read(key, fallback));
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) setValue(read(key, fallback));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, fallback]);

  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      window.localStorage.setItem(key, String(next));
      window.dispatchEvent(new StorageEvent("storage", { key }));
    },
    [key],
  );

  return [value, update] as const;
}

/** Whether the arrival chime plays for incoming messages. Defaults to on. */
export function useSoundEnabled() {
  return useBoolPref(SOUND_KEY, true);
}

/** Whether the "notifications blocked" banner was dismissed by the user. */
export function useBannerDismissed() {
  return useBoolPref(BANNER_KEY, false);
}

export function soundEnabled() {
  return read(SOUND_KEY, true);
}

let audioContext: AudioContext | null = null;

/** Short two-note chime synthesised in the browser, no asset download. */
export function playMessageChime() {
  if (typeof window === "undefined" || !soundEnabled()) return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioContext ??= new Ctor();
    const ctx = audioContext;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    [880, 1174.66].forEach((frequency, index) => {
      const start = now + index * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  } catch {
    // Audio is a nice-to-have; never break message delivery over it.
  }
}
