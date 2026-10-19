import type { TelemetryState } from "@pryladova/shared";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHistory } from "./use-history.js";

const telemetry = (appName: string, capturedAt: string): TelemetryState => ({
  appName,
  windowTitle: "window",
  capturedAt,
  receivedAt: capturedAt,
  classification: null,
  classificationStatus: "disabled",
  host: null,
});

const jsonResponse = (entries: { appName: string; durationSec: number }[]) => ({
  ok: true,
  json: async () => ({ entries }),
});

describe("useHistory", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const renderHistory = () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    let api: ReturnType<typeof useHistory> | null = null;
    let setTelemetry: (next: TelemetryState) => void = () => {};

    const Probe = () => {
      const [current, setCurrent] = useState(telemetry("Edge", "2026-10-19T12:00:00.000Z"));
      setTelemetry = setCurrent;
      api = useHistory(true, current, null);
      return createElement("p", { "data-testid": "entries" }, JSON.stringify(api.history));
    };

    return {
      probe: Probe,
      read: () => {
        if (!api) {
          throw new Error("history hook did not render");
        }
        return api;
      },
      setTelemetry: (next: TelemetryState) => {
        setTelemetry(next);
      },
    };
  };

  it("does not apply telemetry updates on a past day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const from = new URL(String(input), "http://localhost").searchParams.get("from");
      const fromDate = from ? new Date(from) : null;
      if (fromDate?.getDate() === 18) {
        return jsonResponse([{ appName: "Notes", durationSec: 40 }]);
      }
      return jsonResponse([{ appName: "Code", durationSec: 100 }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = renderHistory();
    await act(async () => {
      root.render(createElement(harness.probe));
    });

    expect(harness.read().isToday).toBe(true);
    expect(harness.read().canStepForward).toBe(false);

    await act(async () => {
      harness.read().stepDay(-1);
    });

    expect(harness.read().isToday).toBe(false);
    expect(harness.read().canStepForward).toBe(true);
    expect(harness.read().history).toEqual({
      status: "ready",
      label: harness.read().dayLabel,
      entries: [{ appName: "Notes", durationSec: 40 }],
      spans: [],
    });

    vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 5));
    await act(async () => {
      harness.setTelemetry(telemetry("Edge", "2026-10-19T12:00:05.000Z"));
    });

    expect(harness.read().history).toEqual({
      status: "ready",
      label: harness.read().dayLabel,
      entries: [{ appName: "Notes", durationSec: 40 }],
      spans: [],
    });
  });

  it("does not apply telemetry to the previous day while today is loading", async () => {
    let releaseToday: (() => void) | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const from = new URL(String(input), "http://localhost").searchParams.get("from");
        const fromDate = from ? new Date(from) : null;
        if (fromDate?.getDate() === 18) {
          return jsonResponse([{ appName: "Notes", durationSec: 40 }]);
        }
        if (releaseToday) {
          await new Promise<void>((resolve) => {
            releaseToday = resolve;
          });
        } else {
          releaseToday = () => {};
        }
        return jsonResponse([{ appName: "Code", durationSec: 100 }]);
      }),
    );

    const harness = renderHistory();
    await act(async () => {
      root.render(createElement(harness.probe));
    });

    await act(async () => {
      harness.read().stepDay(-1);
    });
    expect(harness.read().history).toMatchObject({
      status: "ready",
      entries: [{ appName: "Notes", durationSec: 40 }],
    });

    await act(async () => {
      harness.read().stepDay(1);
    });
    expect(harness.read().history.status).toBe("loading");

    await act(async () => {
      harness.setTelemetry(telemetry("Edge", "2026-10-19T12:00:05.000Z"));
    });
    expect(harness.read().history.status).toBe("loading");

    await act(async () => {
      releaseToday?.();
    });
    expect(harness.read().history).toMatchObject({
      status: "ready",
      entries: [{ appName: "Code", durationSec: 100 }],
    });
  });
});
