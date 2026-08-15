const SWIPE_HINT_KEY = "sunu-swipe-hint-seen";

export function hasSeenSwipeHint(): boolean {
  try {
    return localStorage.getItem(SWIPE_HINT_KEY) === "1";
  } catch {
    return true;
  }
}

export function markSwipeHintSeen(): void {
  try {
    localStorage.setItem(SWIPE_HINT_KEY, "1");
  } catch {
    // ignore
  }
}
