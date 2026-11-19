import type { TelemetryState, WindowClassification } from "@pryladova/shared";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLASSIFICATION_LOADING_DELAY_MS,
  getStaleClassification,
  useClassificationDisplay,
} from "./use-classification-display.js";

const readyClassification: WindowClassification = {
  displayAppName: "Code",
  category: "Coding",
  workRelated: "yes",
};

const pendingTelemetry: TelemetryState = {
  appName: "Edge",
  windowTitle: "Inbox",
  capturedAt: "2026-01-01T12:00:00.000Z",
  receivedAt: "2026-01-01T12:00:01.000Z",
  classification: null,
  classificationStatus: "pending",
  host: null,
};

describe("getStaleClassification", () => {
  it("returns last ready classification while pending", () => {
    expect(getStaleClassification(pendingTelemetry, false, readyClassification)).toEqual(
      readyClassification,
    );
  });

  it("returns null once the spinner delay elapsed", () => {
    expect(getStaleClassification(pendingTelemetry, true, readyClassification)).toBeNull();
  });
});

let latestClassification: ReturnType<typeof useClassificationDisplay> | null = null;

const ClassificationProbe = ({
  telemetry,
  enabled,
}: {
  telemetry: TelemetryState;
  enabled: boolean;
}) => {
  latestClassification = useClassificationDisplay(telemetry, enabled);
  return null;
};

describe("useClassificationDisplay", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (telemetry: TelemetryState, enabled = true) => {
    act(() => {
      root.render(createElement(ClassificationProbe, { telemetry, enabled }));
    });
    if (!latestClassification) {
      throw new Error("hook did not render");
    }
    return latestClassification;
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
    latestClassification = null;
    vi.useRealTimers();
  });

  const readyTelemetry: TelemetryState = {
    ...pendingTelemetry,
    appName: "Code",
    classification: readyClassification,
    classificationStatus: "ready",
  };

  it("shows category and work chip for ready classifications", () => {
    expect(render(readyTelemetry)).toMatchObject({
      badgeClassification: readyClassification,
      showCategory: true,
      showWorkChip: true,
      showSpinner: false,
    });
  });

  it("hides the work chip for ambiguous work classification", () => {
    const maybe = { ...readyClassification, workRelated: "maybe" as const };
    expect(render({ ...readyTelemetry, classification: maybe })).toMatchObject({
      showCategory: true,
      showWorkChip: false,
    });
  });

  it("keeps the last ready badge while pending, then spins after the delay", () => {
    render(readyTelemetry);

    expect(render(pendingTelemetry)).toMatchObject({
      badgeClassification: readyClassification,
      showCategory: true,
      showSpinner: false,
    });

    act(() => {
      vi.advanceTimersByTime(CLASSIFICATION_LOADING_DELAY_MS);
    });
    expect(latestClassification).toMatchObject({
      badgeClassification: null,
      showCategory: false,
      showSpinner: true,
    });
  });

  it("reports failed and misconfigured only when enabled", () => {
    expect(render({ ...pendingTelemetry, classificationStatus: "failed" })).toMatchObject({
      isClassificationFailed: true,
      isMisconfigured: false,
    });
    expect(render({ ...pendingTelemetry, classificationStatus: "misconfigured" })).toMatchObject({
      isMisconfigured: true,
    });
    expect(render({ ...pendingTelemetry, classificationStatus: "failed" }, false)).toMatchObject({
      isClassificationFailed: false,
      showCategory: false,
    });
  });

  it("never spins while classification is disabled", () => {
    render(pendingTelemetry, false);
    act(() => {
      vi.advanceTimersByTime(CLASSIFICATION_LOADING_DELAY_MS * 2);
    });
    expect(latestClassification?.showSpinner).toBe(false);
  });
});
