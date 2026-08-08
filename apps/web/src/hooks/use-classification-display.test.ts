import type { TelemetryState, WindowClassification } from "@pryladova/shared";
import { describe, expect, it } from "vitest";
import { getStaleClassification } from "./use-classification-display.js";

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
