import { Test } from "@nestjs/testing";
import { SECURE_APP_NAME, SECURE_WINDOW_TITLE, type WindowClassification } from "@pryladova/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassificationService } from "../classification/classification.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { TelemetryService } from "./telemetry.service.js";

const telemetryPayload = {
  appName: "Code",
  windowTitle: "app.tsx",
  capturedAt: "2026-01-01T12:00:00.000Z",
};

const classification: WindowClassification = {
  category: "Coding",
  displayAppName: "Code",
  workRelated: "yes",
};

const createService = async (classifyImpl?: ClassificationService["classify"]) => {
  const moduleRef = await Test.createTestingModule({
    providers: [
      TelemetryService,
      SettingsService,
      {
        provide: ClassificationService,
        useValue: {
          classify: classifyImpl ?? vi.fn().mockResolvedValue(classification),
        },
      },
    ],
  }).compile();

  return {
    telemetryService: moduleRef.get(TelemetryService),
    settingsService: moduleRef.get(SettingsService),
    classify: moduleRef.get(ClassificationService).classify as ReturnType<typeof vi.fn>,
  };
};

describe("TelemetryService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("roundtrips telemetry state", async () => {
    const { telemetryService, classify } = await createService();
    telemetryService.setState(telemetryPayload);
    const state = telemetryService.getState();
    expect(state?.appName).toBe("Code");
    expect(state?.classificationStatus).toBe("disabled");
    expect(classify).not.toHaveBeenCalled();
  });

  it("marks redacted payloads ready without classification", async () => {
    const { telemetryService, settingsService, classify } = await createService();
    settingsService.setSettings({ classificationEnabled: true });
    telemetryService.setState({
      ...telemetryPayload,
      appName: SECURE_APP_NAME,
      windowTitle: SECURE_WINDOW_TITLE,
    });
    expect(telemetryService.getState()?.classificationStatus).toBe("ready");
    expect(classify).not.toHaveBeenCalled();
  });

  it("queues classification when enabled", async () => {
    const { telemetryService, settingsService, classify } = await createService();
    settingsService.setSettings({ classificationEnabled: true });
    telemetryService.setState(telemetryPayload);
    await vi.waitFor(() => {
      expect(classify).toHaveBeenCalledWith("Code", "app.tsx");
    });
    await vi.waitFor(() => {
      expect(telemetryService.getState()?.classificationStatus).toBe("ready");
    });
  });

  it("merges pending host on first telemetry ingest", async () => {
    const { telemetryService } = await createService();
    telemetryService.setHost({
      idleMs: 0,
      cpuPercent: 10,
      ramPercent: 20,
      uptimeSec: 100,
      media: null,
      capturedAt: "2026-01-01T12:00:00.000Z",
    });
    telemetryService.setState(telemetryPayload);
    expect(telemetryService.getState()?.host?.cpuPercent).toBe(10);
  });

  it("discards stale classification results", async () => {
    let resolveFirst: (value: WindowClassification | null) => void = () => {};
    const firstPromise = new Promise<WindowClassification | null>((resolve) => {
      resolveFirst = resolve;
    });

    const classify = vi.fn().mockReturnValueOnce(firstPromise).mockResolvedValueOnce({
      category: "Browsing",
      displayAppName: "Firefox",
      workRelated: "no",
    });

    const { telemetryService, settingsService } = await createService(classify);
    settingsService.setSettings({ classificationEnabled: true });

    telemetryService.setState(telemetryPayload);
    telemetryService.setState({
      ...telemetryPayload,
      appName: "Firefox",
      windowTitle: "Example",
    });

    resolveFirst(classification);
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    const state = telemetryService.getState();
    expect(state?.appName).toBe("Firefox");
    expect(state?.classification?.displayAppName).toBe("Firefox");
  });

  it("reclassifies current window when toggled on", async () => {
    const { telemetryService, settingsService, classify } = await createService();
    telemetryService.setState(telemetryPayload);
    settingsService.setSettings({ classificationEnabled: true });
    telemetryService.reclassifyCurrentWindow();
    expect(telemetryService.getState()?.classificationStatus).toBe("pending");
    await vi.waitFor(() => {
      expect(classify).toHaveBeenCalled();
    });
  });
});
