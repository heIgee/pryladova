import { afterEach, describe, expect, it, vi } from "vitest";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event?: { code?: number }) => void) | null = null;
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

const requireSocket = (): MockWebSocket => {
  const socket = MockWebSocket.instances[0];
  if (socket === undefined) {
    throw new Error("Expected a panel WebSocket");
  }
  return socket;
};

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

    const socket = requireSocket();
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

    socket.onmessage?.({ data: "not-json" } as MessageEvent<string>);
    expect(getPanelPollSnapshot().panel.status).toBe("ready");

    unsubscribe();
    expect(states).toContain("ready");
  });

  it("merges host-only websocket messages into existing panel state", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { getPanelPollSnapshot, subscribePanelPoll } = await import("./panel-poll.js");
    const unsubscribe = subscribePanelPoll(() => {});

    const socket = requireSocket();
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

    const socket = requireSocket();
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

    const socket = requireSocket();
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

  it("does not mark the stream connected until a frame arrives", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { getPanelPollSnapshot, subscribePanelPoll } = await import("./panel-poll.js");
    const unsubscribe = subscribePanelPoll(() => {});
    await Promise.resolve();

    expect(getPanelPollSnapshot().streamConnected).toBe(false);
    expect(getPanelPollSnapshot().connectFailed).toBe(false);

    const socket = requireSocket();
    socket?.onmessage?.({ data: JSON.stringify({ type: "empty" }) } as MessageEvent<string>);

    expect(getPanelPollSnapshot().streamConnected).toBe(true);
    expect(getPanelPollSnapshot().panel).toEqual({ status: "empty" });

    unsubscribe();
  });

  it("keeps a failed connect on the error after the socket opens again", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { getPanelPollSnapshot, subscribePanelPoll } = await import("./panel-poll.js");
    const unsubscribe = subscribePanelPoll(() => {});
    await Promise.resolve();

    const first = MockWebSocket.instances[0];
    if (!first) {
      throw new Error("missing socket");
    }
    first.readyState = 3;
    first.close();

    expect(getPanelPollSnapshot().connectFailed).toBe(true);
    expect(getPanelPollSnapshot().streamConnected).toBe(false);
    expect(getPanelPollSnapshot().panel.status).toBe("loading");

    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();

    expect(getPanelPollSnapshot().connectFailed).toBe(true);
    expect(getPanelPollSnapshot().streamConnected).toBe(false);

    unsubscribe();
    vi.useRealTimers();
  });

  it("stops reconnecting when the panel rejects the session", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { getPanelPollSnapshot, subscribePanelPoll, subscribePanelSessionLost } = await import(
      "./panel-poll.js"
    );
    const lost = vi.fn();
    const unsubscribeLost = subscribePanelSessionLost(lost);
    const unsubscribe = subscribePanelPoll(() => {});
    await Promise.resolve();

    const socket = requireSocket();
    socket?.onclose?.({ code: 4401 });

    await vi.advanceTimersByTimeAsync(8_000);

    expect(lost).toHaveBeenCalledOnce();
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(getPanelPollSnapshot().streamConnected).toBe(false);

    unsubscribe();
    unsubscribeLost();
    vi.useRealTimers();
  });

  it("keeps an empty panel when the stream restarts", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { getPanelPollSnapshot, subscribePanelPoll } = await import("./panel-poll.js");
    const unsubscribe = subscribePanelPoll(() => {});
    const socket = requireSocket();
    socket?.onmessage?.({ data: JSON.stringify({ type: "empty" }) } as MessageEvent<string>);

    expect(getPanelPollSnapshot().panel).toEqual({ status: "empty" });

    unsubscribe();
    await vi.advanceTimersByTimeAsync(500);

    const resubscribe = subscribePanelPoll(() => {});
    await Promise.resolve();

    expect(getPanelPollSnapshot().panel).toEqual({ status: "empty" });

    resubscribe();
    vi.useRealTimers();
  });

  it("closes the socket when the last listener unsubscribes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { subscribePanelPoll } = await import("./panel-poll.js");
    const unsubscribe = subscribePanelPoll(() => {});
    const socket = requireSocket();

    unsubscribe();
    expect(socket.close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);

    expect(socket.close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("clears media when reconnect state has no host.media", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { getPanelPollSnapshot, subscribePanelPoll } = await import("./panel-poll.js");
    const unsubscribe = subscribePanelPoll(() => {});

    const socket = requireSocket();
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
            capturedAt: "2026-01-01T12:00:02.000Z",
            media: {
              title: "Test Track",
              artist: "Test Artist",
              albumTitle: null,
              appName: "Spotify",
              playbackStatus: "playing",
              thumbnailDataUrl: "data:image/jpeg;base64,abc",
            },
          },
        },
      }),
    } as MessageEvent<string>);

    socket.onmessage?.({
      data: JSON.stringify({
        type: "state",
        telemetry: {
          appName: "Code",
          windowTitle: "app.tsx",
          capturedAt: "2026-01-01T12:00:06.000Z",
          receivedAt: "2026-01-01T12:00:06.000Z",
          classification: null,
          classificationStatus: "disabled",
          host: {
            idleMs: 0,
            cpuPercent: 55,
            ramPercent: 22,
            uptimeSec: 110,
            capturedAt: "2026-01-01T12:00:06.000Z",
            media: null,
          },
        },
      }),
    } as MessageEvent<string>);

    expect(getPanelPollSnapshot().panel).toEqual({
      status: "ready",
      telemetry: expect.objectContaining({
        host: expect.objectContaining({
          cpuPercent: 55,
          media: null,
        }),
      }),
    });

    unsubscribe();
  });

  it("refreshPanelPoll forces a new websocket when already connected", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { getPanelPollSnapshot, refreshPanelPoll, subscribePanelPoll } = await import(
      "./panel-poll.js"
    );
    const unsubscribe = subscribePanelPoll(() => {});

    await Promise.resolve();

    const firstSocket = MockWebSocket.instances[0];
    firstSocket?.onmessage?.({ data: JSON.stringify({ type: "empty" }) } as MessageEvent<string>);
    expect(getPanelPollSnapshot().streamConnected).toBe(true);

    refreshPanelPoll();

    await Promise.resolve();

    expect(firstSocket?.close).toHaveBeenCalledOnce();
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(getPanelPollSnapshot().panel).toEqual({ status: "empty" });

    unsubscribe();
  });
});
