import { afterEach, describe, expect, it, vi } from "vitest";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_url: string) {
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.onopen?.();
    });
  }

  close = vi.fn(() => {
    this.onclose?.();
  });

  send = vi.fn();
}

describe("panel stream store", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    MockWebSocket.instances = [];
  });

  it("reuses one store across snapshot reads", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { getPanelPollSnapshot, subscribePanelPoll } = await import("./panel-poll.js");

    const unsubscribe = subscribePanelPoll(() => {});
    const first = getPanelPollSnapshot();
    const second = getPanelPollSnapshot();

    expect(first).toBe(second);
    expect(first.panel).toBe(second.panel);

    unsubscribe();
  });

  it("applies websocket state messages", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { getPanelPollSnapshot, subscribePanelPoll } = await import("./panel-poll.js");
    const states: string[] = [];
    const unsubscribe = subscribePanelPoll(() => {
      states.push(getPanelPollSnapshot().panel.status);
    });

    const socket = MockWebSocket.instances[0];
    socket.onmessage?.({
      data: JSON.stringify({
        type: "state",
        telemetry: {
          appName: "Code",
          windowTitle: "app.tsx",
          capturedAt: "2026-01-01T12:00:00.000Z",
          receivedAt: "2026-01-01T12:00:01.000Z",
          classification: null,
          classificationStatus: "disabled",
          host: null,
        },
      }),
    } as MessageEvent<string>);

    expect(getPanelPollSnapshot().panel).toEqual({
      status: "ready",
      telemetry: expect.objectContaining({ appName: "Code" }),
    });

    unsubscribe();
    expect(states).toContain("ready");
  });

  it("merges host-only websocket messages into existing panel state", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { getPanelPollSnapshot, subscribePanelPoll } = await import("./panel-poll.js");
    const unsubscribe = subscribePanelPoll(() => {});

    const socket = MockWebSocket.instances[0];
    socket.onmessage?.({
      data: JSON.stringify({
        type: "state",
        telemetry: {
          appName: "Code",
          windowTitle: "app.tsx",
          capturedAt: "2026-01-01T12:00:00.000Z",
          receivedAt: "2026-01-01T12:00:01.000Z",
          classification: null,
          classificationStatus: "disabled",
          host: {
            idleMs: 0,
            cpuPercent: 10,
            ramPercent: 20,
            uptimeSec: 100,
            media: null,
            capturedAt: "2026-01-01T12:00:02.000Z",
          },
        },
      }),
    } as MessageEvent<string>);

    socket.onmessage?.({
      data: JSON.stringify({
        type: "host",
        host: {
          idleMs: 0,
          cpuPercent: 42,
          ramPercent: 20,
          uptimeSec: 100,
          media: null,
          capturedAt: "2026-01-01T12:00:05.000Z",
        },
      }),
    } as MessageEvent<string>);

    expect(getPanelPollSnapshot().panel).toEqual({
      status: "ready",
      telemetry: expect.objectContaining({
        appName: "Code",
        host: expect.objectContaining({ cpuPercent: 42 }),
      }),
    });

    unsubscribe();
  });

  it("ignores host-only websocket messages before the first state message", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { getPanelPollSnapshot, subscribePanelPoll } = await import("./panel-poll.js");
    const unsubscribe = subscribePanelPoll(() => {});

    expect(getPanelPollSnapshot().panel).toEqual({ status: "loading" });

    const socket = MockWebSocket.instances[0];
    socket.onmessage?.({
      data: JSON.stringify({
        type: "host",
        host: {
          idleMs: 0,
          cpuPercent: 42,
          ramPercent: 20,
          uptimeSec: 100,
          media: null,
          capturedAt: "2026-01-01T12:00:05.000Z",
        },
      }),
    } as MessageEvent<string>);

    expect(getPanelPollSnapshot().panel).toEqual({ status: "loading" });

    unsubscribe();
  });

  it("preserves ready panel state when the websocket closes", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { getPanelPollSnapshot, subscribePanelPoll } = await import("./panel-poll.js");
    const unsubscribe = subscribePanelPoll(() => {});

    const socket = MockWebSocket.instances[0];
    socket.onmessage?.({
      data: JSON.stringify({
        type: "state",
        telemetry: {
          appName: "Code",
          windowTitle: "app.tsx",
          capturedAt: "2026-01-01T12:00:00.000Z",
          receivedAt: "2026-01-01T12:00:01.000Z",
          classification: null,
          classificationStatus: "disabled",
          host: null,
        },
      }),
    } as MessageEvent<string>);

    expect(getPanelPollSnapshot().panel.status).toBe("ready");

    socket.close();

    expect(getPanelPollSnapshot().panel.status).toBe("ready");
    expect(getPanelPollSnapshot().streamConnected).toBe(false);

    unsubscribe();
  });

  it("closes the socket when the last listener unsubscribes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { subscribePanelPoll } = await import("./panel-poll.js");
    const unsubscribe = subscribePanelPoll(() => {});
    const socket = MockWebSocket.instances[0];

    unsubscribe();
    expect(socket.close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);

    expect(socket.close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
