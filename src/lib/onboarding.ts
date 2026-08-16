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

const CARNET_PAGE_HINT_KEY = "sunu-carnet-page-hint-seen";

export function hasSeenCarnetPageHint(): boolean {
  try {
    return localStorage.getItem(CARNET_PAGE_HINT_KEY) === "1";
  } catch {
    return true;
  }
}

export function markCarnetPageHintSeen(): void {
  try {
    localStorage.setItem(CARNET_PAGE_HINT_KEY, "1");
  } catch {
    // ignore
  }
}
