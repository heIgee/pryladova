import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { BentoTileSizeProvider } from "@/hooks/use-bento-tile-size";
import { MediaTile } from "./media-tile.js";

const hostWithMedia = {
  idleMs: 0,
  cpuPercent: 10,
  ramPercent: 20,
  uptimeSec: 100,
  capturedAt: "2026-01-01T12:00:00.000Z",
  media: {
    title: "Test Track",
    artist: "Test Artist",
    albumTitle: null,
    appName: "Spotify",
    playbackStatus: "playing" as const,
    thumbnailDataUrl: "data:image/jpeg;base64,abc",
  },
};

describe("MediaTile", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  const renderTile = (colSpan: 3 | 4 | 6 | 8 | 12, rowSpan: 2 | 3 | 4 | 5 | 6) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    flushSync(() => {
      root.render(
        createElement(
          BentoTileSizeProvider,
          { value: { colSpan, rowSpan } },
          createElement(MediaTile, { host: hostWithMedia }),
        ),
      );
    });
  };

  it("renders title, artist, and cover art when media is present", () => {
    renderTile(6, 2);

    const tile = container.querySelector('[data-testid="media-tile"]');
    expect(tile?.textContent).toContain("Test Track");
    expect(tile?.textContent).toContain("Test Artist");
    expect(tile?.textContent).toContain("Playing");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("data:image/jpeg;base64,abc");
  });

  it("shows an icon placeholder when nothing is playing", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    flushSync(() => {
      root.render(
        createElement(
          BentoTileSizeProvider,
          { value: { colSpan: 6, rowSpan: 2 } },
          createElement(MediaTile, {
            host: { ...hostWithMedia, media: null },
          }),
        ),
      );
    });

    const tile = container.querySelector('[data-testid="media-tile"]');
    expect(tile?.textContent).toContain("Nothing playing");
    expect(tile?.textContent).toContain("Idle");
    expect(tile?.textContent).not.toContain("Test Track");
    const art = container.querySelector('[data-testid="media-tile-art"]');
    expect(art?.querySelector("svg")).not.toBeNull();
    expect(art?.querySelector("img")).toBeNull();
  });

  it("uses split layout at 6x2", () => {
    renderTile(6, 2);
    expect(container.querySelector('[data-bento-layout="split"]')).not.toBeNull();
    expect(container.querySelector(".max-h-20")).not.toBeNull();
  });

  it("uses hero layout at 6x3", () => {
    renderTile(6, 3);
    expect(container.querySelector('[data-bento-layout="hero"]')).not.toBeNull();
    expect(container.querySelector(".max-h-20")).toBeNull();
  });

  it("uses stack layout at 3x3 and keeps the title from shrinking away", () => {
    renderTile(3, 3);
    expect(container.querySelector('[data-bento-layout="stack"]')).not.toBeNull();
    const caption = container.querySelector('[data-testid="media-tile-caption"]');
    expect(caption?.className).toContain("shrink-0");
    expect(caption?.textContent).toContain("Test Track");
  });
});
