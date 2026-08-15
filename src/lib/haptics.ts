export function haptic(pattern: number | number[] = 8): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore — vibration not supported/allowed
  }
}
