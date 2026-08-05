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
});
