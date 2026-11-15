import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLASSIFICATION_LOADING_DELAY_MS } from "./use-classification-display.js";
import {
  type FocusDisplaySnapshot,
  resolveDebouncedFocusDisplay,
  shouldShowImmediateFocusSkeleton,
  useDebouncedFocusLoading,
} from "./use-settled-focus-key.js";

const codeDisplay = {
  layoutName: "Code",
  windowSubtitle: "app.tsx — pryladova",
  showSubtitleSlot: true,
} as const;

const deadlockSkeletonDisplay = {
  layoutName: "deadlock.exe",
  windowSubtitle: "Deadlock — Main Menu",
  showSubtitleSlot: true,
} as const;

describe("shouldShowImmediateFocusSkeleton", () => {
  it("is true only before any focus has settled", () => {
    expect(shouldShowImmediateFocusSkeleton(false, true)).toBe(true);
    expect(shouldShowImmediateFocusSkeleton(true, true)).toBe(false);
    expect(shouldShowImmediateFocusSkeleton(false, false)).toBe(false);
  });
});

describe("resolveDebouncedFocusDisplay", () => {
  it("returns settled display when focus is settled", () => {
    expect(
      resolveDebouncedFocusDisplay({
        enabled: true,
        isUnsettled: false,
        showSkeleton: false,
        hasEverSettled: true,
        lastSettled: { focusKey: "focus-a", ...codeDisplay },
        settledDisplay: codeDisplay,
        skeletonDisplay: deadlockSkeletonDisplay,
      }),
    ).toEqual({ showSkeleton: false, display: codeDisplay });
  });

  it("shows skeleton immediately on the first pending focus", () => {
    expect(
      resolveDebouncedFocusDisplay({
        enabled: true,
        isUnsettled: true,
        showSkeleton: false,
        hasEverSettled: false,
        lastSettled: null,
        settledDisplay: codeDisplay,
        skeletonDisplay: deadlockSkeletonDisplay,
      }),
    ).toEqual({ showSkeleton: true, display: deadlockSkeletonDisplay });
  });

  it("lingers the prior display until skeleton is requested", () => {
    expect(
      resolveDebouncedFocusDisplay({
        enabled: true,
        isUnsettled: true,
        showSkeleton: false,
        hasEverSettled: true,
        lastSettled: { focusKey: "focus-a", ...codeDisplay },
        settledDisplay: codeDisplay,
        skeletonDisplay: deadlockSkeletonDisplay,
      }),
    ).toEqual({ showSkeleton: false, display: codeDisplay });
  });

  it("returns settled display while disabled", () => {
    expect(
      resolveDebouncedFocusDisplay({
        enabled: false,
        isUnsettled: true,
        showSkeleton: true,
        hasEverSettled: false,
        lastSettled: null,
        settledDisplay: codeDisplay,
        skeletonDisplay: deadlockSkeletonDisplay,
      }),
    ).toEqual({ showSkeleton: false, display: codeDisplay });
  });

  it("switches to skeleton display after the delay elapses", () => {
    expect(
      resolveDebouncedFocusDisplay({
        enabled: true,
        isUnsettled: true,
        showSkeleton: true,
        hasEverSettled: true,
        lastSettled: { focusKey: "focus-a", ...codeDisplay },
        settledDisplay: codeDisplay,
        skeletonDisplay: deadlockSkeletonDisplay,
      }),
    ).toEqual({ showSkeleton: true, display: deadlockSkeletonDisplay });
  });
});

describe("useDebouncedFocusLoading", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: { showSkeleton: boolean; display: FocusDisplaySnapshot } | null = null;

  const Probe = (props: {
    focusKey: string;
    settled: FocusDisplaySnapshot;
    isPending: boolean;
    enabled?: boolean;
  }) => {
    latest = useDebouncedFocusLoading(props.focusKey, props.settled, deadlockSkeletonDisplay, {
      enabled: props.enabled ?? true,
      isPending: props.isPending,
    });
    return null;
  };

  const render = (props: Parameters<typeof Probe>[0]) => {
    act(() => {
      root.render(createElement(Probe, props));
    });
    return latest;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    latest = null;
    vi.useRealTimers();
  });

  it("shows the skeleton immediately for the very first pending focus", () => {
    expect(render({ focusKey: "a", settled: codeDisplay, isPending: true })).toEqual({
      showSkeleton: true,
      display: deadlockSkeletonDisplay,
    });

    expect(render({ focusKey: "a", settled: codeDisplay, isPending: false })).toEqual({
      showSkeleton: false,
      display: codeDisplay,
    });
  });

  it("lingers the previous display until the delay, then shows the skeleton", () => {
    render({ focusKey: "a", settled: codeDisplay, isPending: false });

    const next = { layoutName: "Edge", windowSubtitle: "Inbox", showSubtitleSlot: true };
    expect(render({ focusKey: "b", settled: next, isPending: true })).toEqual({
      showSkeleton: false,
      display: codeDisplay,
    });

    act(() => {
      vi.advanceTimersByTime(CLASSIFICATION_LOADING_DELAY_MS);
    });
    expect(latest).toEqual({ showSkeleton: true, display: deadlockSkeletonDisplay });

    expect(render({ focusKey: "b", settled: next, isPending: false })).toEqual({
      showSkeleton: false,
      display: next,
    });
  });

  it("never debounces while disabled", () => {
    expect(
      render({ focusKey: "a", settled: codeDisplay, isPending: true, enabled: false }),
    ).toEqual({ showSkeleton: false, display: codeDisplay });
  });
});
