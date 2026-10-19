import { describe, expect, it } from "vitest";
import {
  resolveDebouncedFocusDisplay,
  shouldShowImmediateFocusSkeleton,
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
