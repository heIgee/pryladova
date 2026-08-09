export const IDLE_ACTIVE_THRESHOLD_MS = 30_000;

export const formatDuration = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
};

export const formatPlaytimeMinutes = (totalMinutes: number): string =>
  formatDuration(Math.max(0, Math.floor(totalMinutes)) * 60);

export const formatPresence = (idleMs: number): string => {
  if (idleMs < IDLE_ACTIVE_THRESHOLD_MS) {
    return "Active";
  }
  return `Away ${formatDuration(idleMs / 1000)}`;
};

export const formatPercent = (value: number): string => `${Math.round(value)}%`;

export const formatPlaybackStatus = (
  status: "playing" | "paused" | "stopped" | "unknown",
): string => {
  if (status === "playing") return "Playing";
  if (status === "paused") return "Paused";
  if (status === "stopped") return "Stopped";
  return "Unknown";
};
