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
  const lastSettledRef = useRef<SettledFocusSnapshot | null>(null);
  const hasEverSettledRef = useRef(false);
  const [delayElapsed, setDelayElapsed] = useState(false);

  if (!options.enabled || !options.isPending) {
    lastSettledRef.current = { focusKey, ...settledDisplay };
    hasEverSettledRef.current = true;
  }

  const isUnsettled = options.enabled && lastSettledRef.current?.focusKey !== focusKey;
  const showImmediateSkeleton = shouldShowImmediateFocusSkeleton(
    hasEverSettledRef.current,
    isUnsettled,
  );
  const needsSkeletonDelay = isUnsettled && !showImmediateSkeleton;

  useEffect(() => {
    if (!needsSkeletonDelay) {
      return;
    }

    setDelayElapsed(false);
    const timer = setTimeout(() => setDelayElapsed(true), CLASSIFICATION_LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [needsSkeletonDelay]);

  const showSkeleton = isUnsettled && (showImmediateSkeleton || delayElapsed);

  return resolveDebouncedFocusDisplay({
    enabled: options.enabled,
    isUnsettled,
    showSkeleton,
    hasEverSettled: hasEverSettledRef.current,
    lastSettled: lastSettledRef.current,
    settledDisplay,
    skeletonDisplay,
  });
};
