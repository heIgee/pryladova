import { useEffect, useRef, useState } from "react";
import { CLASSIFICATION_LOADING_DELAY_MS } from "./use-classification-display.js";

export type FocusDisplaySnapshot = {
  layoutName: string;
  windowSubtitle: string | null;
  showSubtitleSlot: boolean;
};

type SettledFocusSnapshot = FocusDisplaySnapshot & { focusKey: string };

export const shouldShowImmediateFocusSkeleton = (
  hasEverSettled: boolean,
  isUnsettled: boolean,
): boolean => isUnsettled && !hasEverSettled;

export const resolveDebouncedFocusDisplay = ({
  enabled,
  isUnsettled,
  showSkeleton,
  hasEverSettled,
  lastSettled,
  settledDisplay,
  skeletonDisplay,
}: {
  enabled: boolean;
  isUnsettled: boolean;
  showSkeleton: boolean;
  hasEverSettled: boolean;
  lastSettled: SettledFocusSnapshot | null;
  settledDisplay: FocusDisplaySnapshot;
  skeletonDisplay: FocusDisplaySnapshot;
}): { showSkeleton: boolean; display: FocusDisplaySnapshot } => {
  if (!enabled || !isUnsettled) {
    return { showSkeleton: false, display: settledDisplay };
  }

  if (showSkeleton || shouldShowImmediateFocusSkeleton(hasEverSettled, isUnsettled)) {
    return { showSkeleton: true, display: skeletonDisplay };
  }

  if (lastSettled === null) {
    return { showSkeleton: true, display: skeletonDisplay };
  }

  const { focusKey: _focusKey, ...display } = lastSettled;
  return { showSkeleton: false, display };
};

/** Debounced skeleton on focus change; lingers prior display until the delay elapses. */
export const useDebouncedFocusLoading = (
  focusKey: string,
  settledDisplay: FocusDisplaySnapshot,
  skeletonDisplay: FocusDisplaySnapshot,
  options: { enabled: boolean; isPending: boolean },
): { showSkeleton: boolean; display: FocusDisplaySnapshot } => {
  const [lastSettled, setLastSettled] = useState<SettledFocusSnapshot | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const hasEverSettledRef = useRef(false);
  const settledDisplayRef = useRef(settledDisplay);
  settledDisplayRef.current = settledDisplay;

  useEffect(() => {
    if (!options.enabled) {
      setLastSettled({ focusKey, ...settledDisplayRef.current });
      hasEverSettledRef.current = true;
      setShowSkeleton(false);
      return;
    }

    if (!options.isPending) {
      setLastSettled({ focusKey, ...settledDisplayRef.current });
      hasEverSettledRef.current = true;
      setShowSkeleton(false);
    }
  }, [focusKey, options.enabled, options.isPending]);

  const isUnsettled = options.enabled && lastSettled?.focusKey !== focusKey;

  useEffect(() => {
    if (!isUnsettled) {
      setShowSkeleton(false);
      return;
    }

    if (shouldShowImmediateFocusSkeleton(hasEverSettledRef.current, isUnsettled)) {
      setShowSkeleton(true);
      return;
    }

    setShowSkeleton(false);
    const timer = setTimeout(() => setShowSkeleton(true), CLASSIFICATION_LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isUnsettled]);

  return resolveDebouncedFocusDisplay({
    enabled: options.enabled,
    isUnsettled,
    showSkeleton,
    hasEverSettled: hasEverSettledRef.current,
    lastSettled,
    settledDisplay,
    skeletonDisplay,
  });
};
