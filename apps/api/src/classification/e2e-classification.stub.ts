import type { WindowClassification } from "@pryladova/shared";

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
