import type { WindowClassification } from "@pryladova/shared";

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
