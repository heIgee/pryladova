import { Test } from "@nestjs/testing";
import { SECURE_APP_NAME, SECURE_WINDOW_TITLE, type WindowClassification } from "@pryladova/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassificationService } from "../classification/classification.service.js";
import { AgentBindingService } from "../ingest/agent-binding.service.js";
import { SegmentService } from "../persistence/segment.service.js";
import { SupabaseService } from "../persistence/supabase.service.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { createSegmentServiceMock, createSupabaseServiceMock } from "../test/persistence-mocks.js";
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
      AgentBindingService,
      {
        provide: ClassificationService,
        useValue: {
          classify: classifyImpl ?? vi.fn().mockResolvedValue(classification),
          isGeminiConfigured: vi.fn().mockReturnValue(true),
        },
      },
      {
        provide: RealtimeService,
        useValue: {
          broadcastPanelState: vi.fn(),
          broadcastPanelHost: vi.fn(),
        },
      },
      {
        provide: SegmentService,
        useValue: createSegmentServiceMock(),
      },
      {
        provide: SupabaseService,
        useValue: createSupabaseServiceMock(),
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
    settingsService.applySettings({ classificationEnabled: true });
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
    settingsService.applySettings({ classificationEnabled: true });
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

  it("ingestAgentUpdate publishes full state once for host and telemetry together", async () => {
    const { telemetryService } = await createService();
    const broadcastState = vi.fn();
    const broadcastHost = vi.fn();
    (
      telemetryService as unknown as {
        realtimeService: {
          broadcastPanelState: typeof broadcastState;
          broadcastPanelHost: typeof broadcastHost;
        };
      }
    ).realtimeService = {
      broadcastPanelState: broadcastState,
      broadcastPanelHost: broadcastHost,
    };

    telemetryService.ingestAgentUpdate(
      "test-agent",
      {
        idleMs: 0,
        cpuPercent: 10,
        ramPercent: 20,
        uptimeSec: 100,
        media: null,
        capturedAt: "2026-01-01T12:00:01.000Z",
      },
      telemetryPayload,
    );

    await Promise.resolve();
    expect(broadcastState).toHaveBeenCalledTimes(1);
    expect(broadcastHost).not.toHaveBeenCalled();
    expect(telemetryService.getState()?.host?.cpuPercent).toBe(10);
  });

  it("skips stale close on host tick when focus change shares the ingest", async () => {
    const segmentMock = createSegmentServiceMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TelemetryService,
        SettingsService,
        AgentBindingService,
        {
          provide: ClassificationService,
          useValue: {
            classify: vi.fn().mockResolvedValue(classification),
            isGeminiConfigured: vi.fn().mockReturnValue(true),
          },
        },
        {
          provide: RealtimeService,
          useValue: { broadcastPanelState: vi.fn(), broadcastPanelHost: vi.fn() },
        },
        { provide: SegmentService, useValue: segmentMock },
        { provide: SupabaseService, useValue: createSupabaseServiceMock() },
      ],
    }).compile();
    const telemetryService = moduleRef.get(TelemetryService);

    telemetryService.ingestAgentUpdate(
      "test-agent",
      {
        idleMs: 0,
        cpuPercent: 10,
        ramPercent: 20,
        uptimeSec: 100,
        media: null,
        capturedAt: "2026-01-01T12:00:01.000Z",
      },
      telemetryPayload,
    );

    await vi.waitFor(() => {
      expect(segmentMock.onFocusChange).toHaveBeenCalled();
      expect(segmentMock.onHostTick).toHaveBeenCalled();
    });
    expect(segmentMock.onHostTick).toHaveBeenCalledWith("test-agent", "2026-01-01T12:00:01.000Z", {
      skipStaleClose: true,
      idleMs: 0,
    });
  });

  it("persists focus boundaries before host ticks on ingest", async () => {
    const segmentMock = createSegmentServiceMock();
    const callOrder: string[] = [];
    segmentMock.onFocusChange.mockImplementation(async () => {
      callOrder.push("focus");
      return "seg-1";
    });
    segmentMock.onHostTick.mockImplementation(async () => {
      callOrder.push("host");
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        TelemetryService,
        SettingsService,
        AgentBindingService,
        {
          provide: ClassificationService,
          useValue: {
            classify: vi.fn().mockResolvedValue(classification),
            isGeminiConfigured: vi.fn().mockReturnValue(true),
          },
        },
        {
          provide: RealtimeService,
          useValue: { broadcastPanelState: vi.fn(), broadcastPanelHost: vi.fn() },
        },
        { provide: SegmentService, useValue: segmentMock },
        { provide: SupabaseService, useValue: createSupabaseServiceMock() },
      ],
    }).compile();
    const telemetryService = moduleRef.get(TelemetryService);

    telemetryService.ingestAgentUpdate(
      "test-agent",
      {
        idleMs: 0,
        cpuPercent: 10,
        ramPercent: 20,
        uptimeSec: 100,
        media: null,
        capturedAt: "2026-01-01T12:00:01.000Z",
      },
      telemetryPayload,
    );

    await vi.waitFor(() => {
      expect(callOrder).toEqual(["focus", "host"]);
    });
  });

  it("forwards idleMs on host-only ticks", async () => {
    const segmentMock = createSegmentServiceMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TelemetryService,
        SettingsService,
        AgentBindingService,
        {
          provide: ClassificationService,
          useValue: {
            classify: vi.fn().mockResolvedValue(classification),
            isGeminiConfigured: vi.fn().mockReturnValue(true),
          },
        },
        {
          provide: RealtimeService,
          useValue: { broadcastPanelState: vi.fn(), broadcastPanelHost: vi.fn() },
        },
        { provide: SegmentService, useValue: segmentMock },
        { provide: SupabaseService, useValue: createSupabaseServiceMock() },
      ],
    }).compile();
    const telemetryService = moduleRef.get(TelemetryService);

    telemetryService.ingestAgentUpdate("test-agent", {
      idleMs: 11 * 60 * 60 * 1000,
      cpuPercent: 10,
      ramPercent: 20,
      uptimeSec: 100,
      media: null,
      capturedAt: "2026-08-09T09:00:00.000Z",
    });

    await vi.waitFor(() => {
      expect(segmentMock.onHostTick).toHaveBeenCalled();
    });
    expect(segmentMock.onHostTick).toHaveBeenCalledWith("test-agent", "2026-08-09T09:00:00.000Z", {
      idleMs: 11 * 60 * 60 * 1000,
    });
  });

  it("preserves thumbnail when host post omits it for unchanged track", async () => {
    const { telemetryService } = await createService();
    telemetryService.setState(telemetryPayload);
    telemetryService.setHost({
      idleMs: 0,
      cpuPercent: 10,
      ramPercent: 20,
      uptimeSec: 100,
      media: {
        title: "Track",
        artist: "Artist",
        albumTitle: null,
        appName: "Player",
        playbackStatus: "playing",
        thumbnailDataUrl: "data:image/jpeg;base64,abc",
      },
      capturedAt: "2026-01-01T12:00:01.000Z",
    });
    telemetryService.setHost({
      idleMs: 0,
      cpuPercent: 12,
      ramPercent: 22,
      uptimeSec: 101,
      media: {
        title: "Track",
        artist: "Artist",
        albumTitle: null,
        appName: "Player",
        playbackStatus: "playing",
        thumbnailDataUrl: null,
      },
      capturedAt: "2026-01-01T12:00:02.000Z",
    });
    expect(telemetryService.getState()?.host?.media?.thumbnailDataUrl).toBe(
      "data:image/jpeg;base64,abc",
    );
  });

  it("publishes full state when a thumbnail arrives after the first host post", async () => {
    const { telemetryService } = await createService();
    const broadcastState = vi.fn();
    const broadcastHost = vi.fn();
    (
      telemetryService as unknown as {
        realtimeService: {
          broadcastPanelState: typeof broadcastState;
          broadcastPanelHost: typeof broadcastHost;
        };
      }
    ).realtimeService = {
      broadcastPanelState: broadcastState,
      broadcastPanelHost: broadcastHost,
    };

    telemetryService.setState(telemetryPayload);
    telemetryService.setHost({
      idleMs: 0,
      cpuPercent: 10,
      ramPercent: 20,
      uptimeSec: 100,
      media: {
        title: "Track",
        artist: "Artist",
        albumTitle: null,
        appName: "Player",
        playbackStatus: "playing",
        thumbnailDataUrl: null,
      },
      capturedAt: "2026-01-01T12:00:01.000Z",
    });
    await Promise.resolve();
    broadcastState.mockClear();
    broadcastHost.mockClear();

    telemetryService.setHost({
      idleMs: 0,
      cpuPercent: 12,
      ramPercent: 22,
      uptimeSec: 101,
      media: {
        title: "Track",
        artist: "Artist",
        albumTitle: null,
        appName: "Player",
        playbackStatus: "playing",
        thumbnailDataUrl: "data:image/jpeg;base64,abc",
      },
      capturedAt: "2026-01-01T12:00:02.000Z",
    });

    await Promise.resolve();
    expect(broadcastState).toHaveBeenCalledTimes(1);
    expect(broadcastHost).not.toHaveBeenCalled();
    expect(telemetryService.getState()?.host?.media?.thumbnailDataUrl).toBe(
      "data:image/jpeg;base64,abc",
    );
  });

  it("publishes host-only panel updates without full telemetry", async () => {
    const { telemetryService } = await createService();
    const broadcastState = vi.fn();
    const broadcastHost = vi.fn();
    (
      telemetryService as unknown as {
        realtimeService: {
          broadcastPanelState: typeof broadcastState;
          broadcastPanelHost: typeof broadcastHost;
        };
      }
    ).realtimeService = {
      broadcastPanelState: broadcastState,
      broadcastPanelHost: broadcastHost,
    };

    telemetryService.setState(telemetryPayload);
    await Promise.resolve();
    broadcastState.mockClear();
    broadcastHost.mockClear();

    telemetryService.setHost({
      idleMs: 0,
      cpuPercent: 42,
      ramPercent: 20,
      uptimeSec: 100,
      media: null,
      capturedAt: "2026-01-01T12:00:05.000Z",
    });

    await Promise.resolve();
    expect(broadcastHost).toHaveBeenCalledTimes(1);
    expect(broadcastState).not.toHaveBeenCalled();
  });

  it("marks misconfigured when classification enabled without Gemini key", async () => {
    const classify = vi.fn().mockResolvedValue(null);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TelemetryService,
        AgentBindingService,
        {
          provide: SettingsService,
          useValue: new SettingsService(createSupabaseServiceMock()),
        },
        {
          provide: ClassificationService,
          useValue: {
            classify,
            isGeminiConfigured: vi.fn().mockReturnValue(false),
          },
        },
        {
          provide: RealtimeService,
          useValue: {
            broadcastPanelState: vi.fn(),
            broadcastPanelHost: vi.fn(),
          },
        },
        {
          provide: SegmentService,
          useValue: createSegmentServiceMock(),
        },
      ],
    }).compile();
    const telemetryService = moduleRef.get(TelemetryService);
    const settingsService = moduleRef.get(SettingsService);
    settingsService.applySettings({ classificationEnabled: true });
    telemetryService.setState(telemetryPayload);
    expect(telemetryService.getState()?.classificationStatus).toBe("misconfigured");
    expect(classify).not.toHaveBeenCalled();
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
    settingsService.applySettings({ classificationEnabled: true });

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
    settingsService.applySettings({ classificationEnabled: true });
    telemetryService.reclassifyCurrentWindow();
    expect(telemetryService.getState()?.classificationStatus).toBe("pending");
    await vi.waitFor(() => {
      expect(classify).toHaveBeenCalled();
    });
  });
});
