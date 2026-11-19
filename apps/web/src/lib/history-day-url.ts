import { clampHistoryDayOffset } from "@/lib/history";

export const HISTORY_DAY_SEARCH_PARAM = "historyDay";

const listeners = new Set<() => void>();
let offsetSnapshot = 0;

const notify = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const readHistoryDayOffsetFromUrl = (): number => {
  if (typeof window === "undefined") {
    return 0;
  }
  try {
    const raw = new URL(window.location.href).searchParams.get(HISTORY_DAY_SEARCH_PARAM);
    if (raw === null || raw === "") {
      offsetSnapshot = 0;
      return 0;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return offsetSnapshot;
    }
    offsetSnapshot = clampHistoryDayOffset(parsed);
    return offsetSnapshot;
  } catch {
    return offsetSnapshot;
  }
};

export const writeHistoryDayOffsetToUrl = (offset: number): void => {
  if (typeof window === "undefined") {
    return;
  }
  const clamped = clampHistoryDayOffset(offset);
  offsetSnapshot = clamped;
  try {
    const url = new URL(window.location.href);
    if (clamped === 0) {
      url.searchParams.delete(HISTORY_DAY_SEARCH_PARAM);
    } else {
      url.searchParams.set(HISTORY_DAY_SEARCH_PARAM, String(clamped));
    }
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    // jsdom may not support full navigation; offsetSnapshot still drives the hook.
  }
  notify();
};

export const subscribeHistoryDayOffset = (onStoreChange: () => void): (() => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }
  const onPopState = (): void => {
    onStoreChange();
  };
  listeners.add(onStoreChange);
  window.addEventListener("popstate", onPopState);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("popstate", onPopState);
  };
};

export const getHistoryDayOffsetServerSnapshot = (): number => 0;

export const resetHistoryDayOffsetStore = (): void => {
  offsetSnapshot = 0;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(HISTORY_DAY_SEARCH_PARAM);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    // Test environments may not support navigation writes.
  }
  notify();
};
