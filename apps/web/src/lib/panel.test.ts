import { describe, expect, it, vi } from "vitest";
import { fetchTelemetry, getAgentLastSeenMs, type PanelState } from "./panel.js";

const readyTelemetry = {
  appName: "Code",
  windowTitle: "app.tsx",
  capturedAt: "2026-01-01T12:00:00.000Z",
  receivedAt: "2026-01-01T12:00:01.000Z",
  classification: null,
  classificationStatus: "disabled" as const,
  host: {
    idleMs: 0,
    cpuPercent: 10,
    ramPercent: 20,
    uptimeSec: 100,
    media: null,
    capturedAt: "2026-01-01T12:00:02.000Z",
  },
};

describe("fetchTelemetry", () => {
  it("returns empty on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
      }),
    );

    await expect(fetchTelemetry()).resolves.toEqual({ status: "empty" });
    vi.unstubAllGlobals();
  });

  it("returns ready state for valid telemetry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => readyTelemetry,
      }),
    );

    await expect(fetchTelemetry()).resolves.toEqual({
      status: "ready",
      telemetry: readyTelemetry,
    });
    vi.unstubAllGlobals();
  });

  it("returns error on failed response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
      }),
    );

    await expect(fetchTelemetry()).resolves.toEqual({
      status: "error",
      message: "API error (500)",
    });
    vi.unstubAllGlobals();
  });
});

describe("getAgentLastSeenMs", () => {
  it("returns null for non-ready panels", () => {
    const panel: PanelState = { status: "empty" };
    expect(getAgentLastSeenMs(panel)).toBeNull();
  });

  it("returns latest timestamp from telemetry and host", () => {
    const panel: PanelState = { status: "ready", telemetry: readyTelemetry };
    expect(getAgentLastSeenMs(panel)).toBe(Date.parse("2026-01-01T12:00:02.000Z"));
  });
});
