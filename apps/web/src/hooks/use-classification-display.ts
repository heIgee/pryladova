import type { TelemetryState, WindowClassification } from "@pryladova/shared";
import { useEffect, useRef, useState } from "react";

const CLASSIFICATION_SPINNER_DELAY_MS = 2_000;

export const getStaleClassification = (
  telemetry: TelemetryState,
  showSpinner: boolean,
  lastReady: WindowClassification | null,
): WindowClassification | null => {
  if (telemetry.classificationStatus !== "pending" || showSpinner || !lastReady) {
    return null;
  }

  return lastReady;
};

export const useClassificationDisplay = (
  telemetry: TelemetryState,
  classificationEnabled: boolean,
): {
  badgeClassification: WindowClassification | null;
  showCategory: boolean;
  showWorkChip: boolean;
  showSpinner: boolean;
  isClassificationFailed: boolean;
  isMisconfigured: boolean;
} => {
  const status = telemetry.classificationStatus;
  const lastReadyRef = useRef<WindowClassification | null>(null);
  const [showSpinner, setShowSpinner] = useState(false);

  if (status === "ready" && telemetry.classification) {
    lastReadyRef.current = telemetry.classification;
  }

  useEffect(() => {
    if (status === "ready") {
      setShowSpinner(false);
      return;
    }

    if (status !== "pending" || !classificationEnabled) {
      setShowSpinner(false);
      return;
    }

    setShowSpinner(false);
    const timer = setTimeout(() => setShowSpinner(true), CLASSIFICATION_SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, classificationEnabled]);

  const stale = getStaleClassification(telemetry, showSpinner, lastReadyRef.current);
  const badgeClassification = telemetry.classification ?? stale;
  const showingStale = stale !== null;

  const showCategory =
    classificationEnabled && badgeClassification !== null && (status === "ready" || showingStale);
  const showWorkChip =
    classificationEnabled &&
    badgeClassification !== null &&
    badgeClassification.workRelated !== "maybe" &&
    (status === "ready" || showingStale);

  return {
    badgeClassification,
    showCategory,
    showWorkChip,
    showSpinner: classificationEnabled && status === "pending" && showSpinner,
    isClassificationFailed: classificationEnabled && status === "failed",
    isMisconfigured: classificationEnabled && status === "misconfigured",
  };
};
