const LIVE_TICK_MS = 1_000;
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | undefined;
let snapshot: number | undefined;

const publish = (): void => {
  const next = Date.now();
  if (next === snapshot) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
};

const ensureInterval = (): void => {
  if (intervalId !== undefined || listeners.size === 0) {
    return;
  }
  intervalId = setInterval(publish, LIVE_TICK_MS);
};

const clearIntervalIfIdle = (): void => {
  if (listeners.size === 0 && intervalId !== undefined) {
    clearInterval(intervalId);
    intervalId = undefined;
    snapshot = undefined;
  }
};

export const subscribeWallClock = (onStoreChange: () => void): (() => void) => {
  listeners.add(onStoreChange);
  ensureInterval();
  return () => {
    listeners.delete(onStoreChange);
    clearIntervalIfIdle();
  };
};

export const getWallClockMs = (): number => {
  snapshot ??= Date.now();
  return snapshot;
};

export const getWallClockServerMs = (): number => 0;
