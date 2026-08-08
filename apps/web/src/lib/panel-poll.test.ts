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

    unsubscribe();
  });

  it("applies websocket state messages", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { getPanelPollSnapshot, subscribePanelPoll } = await import("./panel-poll.js");
    const states: string[] = [];
    const unsubscribe = subscribePanelPoll(() => {
      states.push(getPanelPollSnapshot().status);
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

    expect(getPanelPollSnapshot()).toEqual({
      status: "ready",
      telemetry: expect.objectContaining({ appName: "Code" }),
    });

    unsubscribe();
    expect(states).toContain("ready");
  });

  it("closes the socket when the last listener unsubscribes", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { subscribePanelPoll } = await import("./panel-poll.js");
    const unsubscribe = subscribePanelPoll(() => {});
    const socket = MockWebSocket.instances[0];

    unsubscribe();

    expect(socket.close).toHaveBeenCalledOnce();
  });
});
