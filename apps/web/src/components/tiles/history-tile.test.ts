import type { HistorySpan } from "@pryladova/shared";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BentoTileSizeProvider } from "@/hooks/use-bento-tile-size";
import { HistoryTile } from "./history-tile.js";

const dayRange = { from: "2026-08-08T00:00:00.000Z", to: "2026-08-09T00:00:00.000Z" };
const DAY_MS = 24 * 60 * 60 * 1000;

describe("HistoryTile day strip", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 1000, height: 8 }),
    );
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const renderTile = (spans: HistorySpan[]) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    flushSync(() => {
      root.render(
        createElement(
          BentoTileSizeProvider,
          { value: { colSpan: 6, rowSpan: 3 } },
          createElement(HistoryTile, {
            history: {
              status: "ready",
              label: "Today",
              entries: [{ appName: "Cursor", durationSec: 3600 }],
              spans,
            },
            dayLabel: "Today",
            dayRange,
          }),
        ),
      );
    });
  };

  const hoverAt = async (timeIso: string): Promise<Element> => {
    const strip = container.querySelector('[data-testid="history-day-strip"]');
    const target = strip?.querySelector(".absolute.inset-x-0");
    expect(target).not.toBeNull();
    const fraction = (Date.parse(timeIso) - Date.parse(dayRange.from)) / DAY_MS;
    target?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: fraction * 1000 }));
    return vi.waitFor(() => {
      const popup = container.querySelector('[data-testid="history-day-strip-popup"]');
      if (!popup) {
        throw new Error("day strip popup not rendered");
      }
      return popup;
    });
  };

  it("shows why a span ended", async () => {
    renderTile([
      {
        appName: "Cursor",
        startedAt: "2026-08-08T01:00:00.000Z",
        endedAt: "2026-08-08T12:00:00.000Z",
        closeReason: "shutdown",
      },
    ]);

    const popup = await hoverAt("2026-08-08T06:00:00.000Z");
    expect(popup.textContent).toContain("Cursor");
    expect(
      container.querySelector('[data-testid="history-day-strip-close-reason"]')?.textContent,
    ).toBe("Ended: agent stopped");
  });

  it("omits the reason for focus-change ends", async () => {
    renderTile([
      {
        appName: "Cursor",
        startedAt: "2026-08-08T01:00:00.000Z",
        endedAt: "2026-08-08T12:00:00.000Z",
      },
    ]);

    await hoverAt("2026-08-08T06:00:00.000Z");
    expect(container.querySelector('[data-testid="history-day-strip-close-reason"]')).toBeNull();
  });
});
