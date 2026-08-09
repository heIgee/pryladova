import type { WindowClassification } from "@pryladova/shared";

export const readE2eClassificationDelayMs = (): number | null => {
  if (process.env.NODE_ENV !== "test") {
    return null;
  }

  const raw = process.env.E2E_CLASSIFICATION_DELAY_MS;
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const readE2eClassificationEnabled = (): boolean =>
  process.env.NODE_ENV === "test" && process.env.E2E_CLASSIFICATION_ENABLED === "1";

export const e2eClassificationStub = (
  appName: string,
  _windowTitle: string,
): WindowClassification => {
  const normalized = appName.trim();
  const displayAppName = /deadlock/i.test(normalized)
    ? "Deadlock"
    : normalized.replace(/\.exe$/i, "") || normalized;

  return {
    category: displayAppName === "Deadlock" ? "Gaming" : "Coding",
    displayAppName,
    workRelated: displayAppName === "Deadlock" ? "no" : "yes",
  };
};
