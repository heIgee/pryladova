import { afterEach, describe, expect, it, vi } from "vitest";

describe("panel-poll store", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("reuses one store across snapshot reads in production-like builds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise(() => {
            /* keep poll pending */
          }),
      ),
    );

    const { getPanelPollSnapshot, subscribePanelPoll } = await import("./panel-poll.js");

    const unsubscribe = subscribePanelPoll(() => {});
    const first = getPanelPollSnapshot();
    const second = getPanelPollSnapshot();

    expect(first).toBe(second);

    unsubscribe();
  });

  it("clears the poll timer when the last listener unsubscribes", async () => {
    const clearInterval = vi.fn();
    const setInterval = vi.fn(() => 42);
    vi.stubGlobal("clearInterval", clearInterval);
    vi.stubGlobal("setInterval", setInterval as unknown as typeof globalThis.setInterval);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          appName: "Code",
          windowTitle: "app.tsx",
          capturedAt: "2026-01-01T12:00:00.000Z",
          receivedAt: "2026-01-01T12:00:01.000Z",
          classification: null,
          classificationStatus: "disabled",
          host: null,
        }),
      }),
    );

    const { subscribePanelPoll } = await import("./panel-poll.js");

    const unsubscribe = subscribePanelPoll(() => {});
    expect(setInterval).toHaveBeenCalledOnce();

    unsubscribe();
    expect(clearInterval).toHaveBeenCalledOnce();
    expect(clearInterval).toHaveBeenCalledWith(42);
  });
});
