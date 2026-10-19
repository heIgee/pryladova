import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anchorsForFreeDrop,
  anchorsFromPlacements,
  buildTilePlacements,
  type ColSpan,
  canStepTileRowSpan,
  cycleColSpan,
  DASHBOARD_LAYOUT_KEY,
  type DashboardTileId,
  DEFAULT_DASHBOARD_LAYOUT,
  DEFAULT_DASHBOARD_TILE_ORDER,
  DEFAULT_ROW_SPAN,
  findBottomGapNeighbor,
  findRightGapNeighbor,
  findTopGapNeighbor,
  listFreeDropSlots,
  listRowBands,
  mergeReorderIntoFullOrder,
  normalizeLayout,
  persistDashboardLayout,
  type RowSpan,
  readStoredDashboardLayout,
  resolveEffectiveRowSpan,
  resolveEffectiveSpan,
  resolveResizeHandleEdges,
  resolveSavedRowSpan,
  resolveSavedSpan,
  stepColSpan,
  stepRowBandSpans,
  stepRowSpan,
  stepSharedColBoundary,
  stepSharedRowBoundary,
  swapTileOrder,
  tryColGrowWithPush,
} from "./dashboard-layout.js";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("dashboard layout helpers", () => {
  it("cycles column spans", () => {
    expect(cycleColSpan(3)).toBe(4);
    expect(cycleColSpan(4)).toBe(6);
    expect(cycleColSpan(6)).toBe(8);
    expect(cycleColSpan(8)).toBe(12);
    expect(cycleColSpan(12)).toBe(3);
  });

  it("steps column spans within bounds", () => {
    expect(stepColSpan(3, -1)).toBe(3);
    expect(stepColSpan(3, 1)).toBe(4);
    expect(stepColSpan(4, 1)).toBe(6);
    expect(stepColSpan(6, -1)).toBe(4);
    expect(stepColSpan(4, -1)).toBe(3);
    expect(stepColSpan(12, 1)).toBe(12);
    expect(stepColSpan(12, -1)).toBe(8);
  });

  it("steps row spans within bounds", () => {
    expect(stepRowSpan(2, -1)).toBe(2);
    expect(stepRowSpan(2, 1)).toBe(3);
    expect(stepRowSpan(3, -1)).toBe(2);
    expect(stepRowSpan(6, 1)).toBe(6);
    expect(stepRowSpan(6, -1)).toBe(5);
    expect(stepRowSpan(6, 1, "history")).toBe(7);
    expect(stepRowSpan(12, 1, "history")).toBe(12);
    expect(stepRowSpan(12, -1, "history")).toBe(11);
  });

  it("packs tiles in first-fit top-left order", () => {
    const colSpans = {
      machine: 4,
      history: 8,
      calendar: 4,
      tasks: 4,
    } as const;
    const rowSpans = {
      machine: 2,
      history: 3,
      calendar: 2,
      tasks: 2,
    } as const;
    const colSpan = (id: DashboardTileId): ColSpan => colSpans[id as keyof typeof colSpans] ?? 4;
    const rowSpan = (id: DashboardTileId): RowSpan => rowSpans[id as keyof typeof rowSpans] ?? 2;

    const placements = buildTilePlacements(
      ["machine", "history", "calendar", "tasks"],
      colSpan,
      rowSpan,
    );

    expect(placements).toEqual([
      { id: "machine", startRow: 1, endRow: 2, startCol: 1, endCol: 4 },
      { id: "history", startRow: 1, endRow: 3, startCol: 5, endCol: 12 },
      { id: "calendar", startRow: 3, startCol: 1, endCol: 4, endRow: 4 },
      { id: "tasks", startRow: 4, startCol: 5, endCol: 8, endRow: 5 },
    ]);
  });

  it("never overlaps placements for mixed orders", () => {
    const order: DashboardTileId[] = [...DEFAULT_DASHBOARD_TILE_ORDER];
    const colSpan = (id: DashboardTileId): ColSpan => DEFAULT_DASHBOARD_LAYOUT.colSpan[id] ?? 4;
    const rowSpan = (id: DashboardTileId): RowSpan => DEFAULT_ROW_SPAN[id];

    const placements = buildTilePlacements(order, colSpan, rowSpan);
    const occupied = new Set<string>();

    for (const placement of placements) {
      for (let row = placement.startRow; row <= placement.endRow; row += 1) {
        for (let col = placement.startCol; col <= placement.endCol; col += 1) {
          const key = `${row}:${col}`;
          expect(occupied.has(key)).toBe(false);
          occupied.add(key);
        }
      }
    }
  });

  it("default spans pack a full desktop grid when media is visible", () => {
    const colSpan = (id: DashboardTileId): ColSpan => DEFAULT_DASHBOARD_LAYOUT.colSpan[id] ?? 4;
    const rowSpan = (id: DashboardTileId): RowSpan => DEFAULT_ROW_SPAN[id];
    const placements = buildTilePlacements(DEFAULT_DASHBOARD_TILE_ORDER, colSpan, rowSpan);
    const maxRow = Math.max(...placements.map((tile) => tile.endRow));
    let holes = 0;
    for (let row = 1; row <= maxRow; row += 1) {
      for (let col = 1; col <= 12; col += 1) {
        const occupied = placements.some(
          (tile) =>
            row >= tile.startRow &&
            row <= tile.endRow &&
            col >= tile.startCol &&
            col <= tile.endCol,
        );
        if (!occupied) {
          holes += 1;
        }
      }
    }
    expect(placements.length).toBe(DEFAULT_DASHBOARD_TILE_ORDER.length);
    expect(maxRow).toBe(12);
    expect(holes).toBe(0);
    expect(placements.find((tile) => tile.id === "window")).toEqual({
      id: "window",
      startRow: 1,
      endRow: 2,
      startCol: 1,
      endCol: 12,
    });
    expect(placements.find((tile) => tile.id === "machine")).toEqual({
      id: "machine",
      startRow: 3,
      endRow: 4,
      startCol: 1,
      endCol: 6,
    });
    expect(placements.find((tile) => tile.id === "media")).toEqual({
      id: "media",
      startRow: 3,
      endRow: 4,
      startCol: 7,
      endCol: 12,
    });
    expect(placements.find((tile) => tile.id === "history")).toEqual({
      id: "history",
      startRow: 5,
      endRow: 10,
      startCol: 1,
      endCol: 8,
    });
    expect(placements.find((tile) => tile.id === "github")).toEqual({
      id: "github",
      startRow: 5,
      endRow: 7,
      startCol: 9,
      endCol: 12,
    });
    expect(placements.find((tile) => tile.id === "steam")).toEqual({
      id: "steam",
      startRow: 8,
      endRow: 10,
      startCol: 9,
      endCol: 12,
    });
    expect(placements.find((tile) => tile.id === "tasks")).toEqual({
      id: "tasks",
      startRow: 11,
      endRow: 12,
      startCol: 1,
      endCol: 6,
    });
    expect(placements.find((tile) => tile.id === "calendar")).toEqual({
      id: "calendar",
      startRow: 11,
      endRow: 12,
      startCol: 7,
      endCol: 12,
    });
  });

  it("detects horizontal gap neighbors from 2D placements", () => {
    const colSpans = {
      window: 12,
      machine: 8,
      media: 4,
      history: 8,
      github: 4,
      steam: 4,
      calendar: 4,
      tasks: 4,
    } as const;
    const rowSpans = {
      window: 2,
      machine: 2,
      media: 2,
      history: 3,
      github: 2,
      steam: 2,
      calendar: 2,
      tasks: 2,
    } as const;
    const colSpan = (id: DashboardTileId): ColSpan => colSpans[id as keyof typeof colSpans] ?? 4;
    const rowSpan = (id: DashboardTileId): RowSpan => rowSpans[id as keyof typeof rowSpans] ?? 2;

    const visible = ["window", "machine", "media", "history", "github", "steam"] as const;

    expect(findRightGapNeighbor([...visible], colSpan, rowSpan, "machine")).toBe("media");
    expect(findRightGapNeighbor([...visible], colSpan, rowSpan, "media")).toBe(null);
    expect(findRightGapNeighbor(["history", "github"], colSpan, rowSpan, "history")).toBe(null);
    expect(findRightGapNeighbor(["history", "github"], colSpan, rowSpan, "github")).toBe(null);
  });

  it("detects vertical gap neighbors only when column bands match", () => {
    const colSpans = {
      machine: 6,
      history: 8,
      calendar: 4,
      tasks: 4,
    } as const;
    const rowSpans = {
      machine: 2,
      history: 3,
      calendar: 2,
      tasks: 2,
    } as const;
    const colSpan = (id: DashboardTileId): ColSpan => colSpans[id as keyof typeof colSpans] ?? 4;
    const rowSpan = (id: DashboardTileId): RowSpan => rowSpans[id as keyof typeof rowSpans] ?? 2;
    const visible = ["machine", "history", "calendar", "tasks"] as const;

    expect(findBottomGapNeighbor([...visible], colSpan, rowSpan, "machine")).toBe(null);
    expect(findBottomGapNeighbor([...visible], colSpan, rowSpan, "history")).toBe(null);
    expect(findTopGapNeighbor([...visible], colSpan, rowSpan, "calendar")).toBe(null);
  });

  it("detects stacked vertical neighbors with matching widths", () => {
    const colSpans = { github: 12, steam: 12 } as const;
    const rowSpans = { github: 2, steam: 2 } as const;
    const colSpan = (id: DashboardTileId): ColSpan => colSpans[id as keyof typeof colSpans] ?? 4;
    const rowSpan = (id: DashboardTileId): RowSpan => rowSpans[id as keyof typeof rowSpans] ?? 2;
    const visible = ["github", "steam"] as const;

    expect(findBottomGapNeighbor([...visible], colSpan, rowSpan, "github")).toBe("steam");
    expect(findTopGapNeighbor([...visible], colSpan, rowSpan, "steam")).toBe("github");
  });

  it("shows resize handles on both horizontal edges when not row-start", () => {
    const colSpans = {
      window: 12,
      machine: 8,
      media: 4,
      history: 8,
      github: 4,
      steam: 4,
      calendar: 8,
      tasks: 4,
    } as const;
    const rowSpans = {
      window: 2,
      machine: 2,
      media: 2,
      history: 3,
      github: 2,
      steam: 2,
      calendar: 2,
      tasks: 2,
    } as const;
    const colSpan = (id: DashboardTileId): ColSpan => colSpans[id as keyof typeof colSpans] ?? 4;
    const rowSpan = (id: DashboardTileId): RowSpan => rowSpans[id as keyof typeof rowSpans] ?? 2;
    const visible = [
      "window",
      "machine",
      "media",
      "history",
      "github",
      "steam",
      "calendar",
    ] as const;

    expect(resolveResizeHandleEdges([...visible], colSpan, rowSpan, "window")).toEqual({
      right: true,
      left: false,
      bottom: true,
      top: false,
    });
    expect(resolveResizeHandleEdges(["steam", "calendar"], colSpan, rowSpan, "calendar")).toEqual({
      right: true,
      left: true,
      bottom: true,
      top: false,
    });
    expect(resolveResizeHandleEdges(["history", "github"], colSpan, rowSpan, "github")).toEqual({
      right: true,
      left: true,
      bottom: true,
      top: false,
    });
  });

  it("steps shared column boundary between row neighbors", () => {
    expect(stepSharedColBoundary(4, 8, 1)).toEqual({ left: 6, right: 6 });
    expect(stepSharedColBoundary(4, 8, -1)).toEqual({ left: 3, right: 12 });
    expect(stepSharedColBoundary(6, 6, -1)).toEqual({ left: 4, right: 8 });
  });

  it("grows a tile by pushing right neighbors into trailing columns", () => {
    const visible: DashboardTileId[] = ["window", "media", "machine"];
    const colSpans = { window: 3, media: 3, machine: 3 } as const;
    const rowSpans = { window: 2, media: 2, machine: 2 } as const;
    const colSpan = (id: DashboardTileId): ColSpan => colSpans[id as keyof typeof colSpans] ?? 3;
    const rowSpan = (id: DashboardTileId): RowSpan => rowSpans[id as keyof typeof rowSpans] ?? 2;

    const first = tryColGrowWithPush(visible, colSpan, rowSpan, "media", {});
    expect(first).toEqual({
      colSpans: { media: 4 },
      anchors: { machine: { row: 1, col: 8 } },
    });

    const second = tryColGrowWithPush(
      visible,
      (id) => first?.colSpans[id] ?? colSpan(id),
      rowSpan,
      "media",
      first?.anchors,
    );
    expect(second).toEqual({
      colSpans: { media: 6 },
      anchors: { machine: { row: 1, col: 10 } },
    });
  });

  it("steps shared row boundary between stacked neighbors", () => {
    expect(stepSharedRowBoundary(2, 3, 1)).toEqual({ top: 3, bottom: 2 });
    expect(stepSharedRowBoundary(3, 2, -1)).toEqual({ top: 2, bottom: 3 });
    expect(stepSharedRowBoundary(2, 2, 1)).toBeNull();
    expect(stepSharedRowBoundary(2, 2, -1)).toBeNull();
    expect(stepSharedRowBoundary(6, 3, 1, "history", "github")).toEqual({ top: 7, bottom: 2 });
    expect(stepSharedRowBoundary(7, 2, -1, "history", "github")).toEqual({ top: 6, bottom: 3 });
  });

  it("merges reordered visible ids while preserving hidden tiles", () => {
    const fullOrder = [
      "window",
      "machine",
      "media",
      "history",
      "github",
      "steam",
      "calendar",
      "tasks",
    ] as const;
    const visibleIds = [
      "window",
      "machine",
      "history",
      "github",
      "steam",
      "calendar",
      "tasks",
    ] as const;
    const reorderedVisibleIds = [
      "window",
      "history",
      "machine",
      "github",
      "steam",
      "calendar",
      "tasks",
    ] as const;

    expect(
      mergeReorderIntoFullOrder([...fullOrder], [...visibleIds], [...reorderedVisibleIds]),
    ).toEqual(["window", "history", "media", "machine", "github", "steam", "calendar", "tasks"]);
  });

  it("lists row bands by shared start row", () => {
    const colSpan = (id: DashboardTileId): ColSpan => {
      const spans = { window: 12, machine: 6, history: 6, github: 6 } as const;
      return spans[id as keyof typeof spans] ?? 6;
    };
    const rowSpan = (id: DashboardTileId): RowSpan => {
      const spans = { window: 2, machine: 2, history: 2, github: 2 } as const;
      return spans[id as keyof typeof spans] ?? 2;
    };
    const placements = buildTilePlacements(
      ["window", "machine", "history", "github"],
      colSpan,
      rowSpan,
    );
    const bands = listRowBands(placements);
    expect(bands.find((band) => band.startRow === 3)?.tileIds).toEqual(
      expect.arrayContaining(["machine", "history"]),
    );
  });

  it("steps row band spans together", () => {
    const band = {
      startRow: 2,
      endRow: 3,
      tileIds: ["machine", "history"] as DashboardTileId[],
    };
    const resolveRowSpan = (id: DashboardTileId): RowSpan =>
      id === "machine" || id === "history" ? 2 : 2;
    const overrides = stepRowBandSpans(band, 1, resolveRowSpan);
    expect(overrides).toEqual({ machine: 3, history: 3 });
  });

  it("offers the first-row hole as a drop and moves the tile there", () => {
    const order: DashboardTileId[] = [
      "window",
      "media",
      "machine",
      "history",
      "github",
      "calendar",
      "tasks",
      "steam",
    ];
    const colSpan = (id: DashboardTileId): ColSpan => {
      if (id === "history") {
        return 8;
      }
      if (id === "github" || id === "calendar" || id === "steam") {
        return 4;
      }
      return 3;
    };
    const rowSpan = (id: DashboardTileId): RowSpan => {
      if (id === "window" || id === "media" || id === "machine" || id === "steam") {
        return 3;
      }
      if (id === "history") {
        return 4;
      }
      return 2;
    };
    const anchors = {
      window: { row: 1, col: 1 },
      media: { row: 1, col: 4 },
      machine: { row: 1, col: 7 },
      history: { row: 4, col: 1 },
      github: { row: 4, col: 9 },
      calendar: { row: 6, col: 9 },
      tasks: { row: 8, col: 1 },
      steam: { row: 8, col: 5 },
    };
    const placements = buildTilePlacements(order, colSpan, rowSpan, anchors);
    const slots = listFreeDropSlots(placements, "tasks", 3, 2);
    const firstRow = slots.find((slot) => slot.startRow === 1 && slot.startCol === 10);
    expect(firstRow).toMatchObject({ colSpan: 3, rowSpan: 2, hitColSpan: 3, hitRowSpan: 3 });

    const next = anchorsForFreeDrop(order, colSpan, rowSpan, placements, "tasks", {
      row: 1,
      col: 10,
    });
    const moved = buildTilePlacements(order, colSpan, rowSpan, next ?? {});
    expect(moved.find((entry) => entry.id === "tasks")).toMatchObject({
      startRow: 1,
      startCol: 10,
      endCol: 12,
      endRow: 2,
    });
    expect(moved.find((entry) => entry.id === "machine")).toMatchObject({
      startRow: 1,
      startCol: 7,
    });
  });

  it("pulls tiles up when a resize-back leaves fully empty rows", () => {
    const order: DashboardTileId[] = ["history", "steam", "tasks", "calendar"];
    const colSpan = (id: DashboardTileId): ColSpan => (id === "history" ? 8 : 4);
    const rowSpan = (id: DashboardTileId): RowSpan => (id === "history" ? 4 : 2);
    const pushed = {
      history: { row: 1, col: 1 },
      steam: { row: 1, col: 9 },
      tasks: { row: 10, col: 1 },
      calendar: { row: 10, col: 5 },
    };
    const placements = buildTilePlacements(order, colSpan, rowSpan, pushed);
    expect(placements.find((entry) => entry.id === "history")).toMatchObject({
      startRow: 1,
      endRow: 4,
      startCol: 1,
    });
    expect(placements.find((entry) => entry.id === "steam")?.startRow).toBe(1);
    expect(placements.find((entry) => entry.id === "tasks")).toMatchObject({
      startRow: 5,
      startCol: 1,
    });
    expect(placements.find((entry) => entry.id === "calendar")).toMatchObject({
      startRow: 5,
      startCol: 5,
    });
  });

  it("does not offer a hole narrower than the dragged tile", () => {
    const placements = buildTilePlacements(
      ["window", "media", "tasks"],
      (id) => (id === "window" ? 6 : 4),
      () => 2,
    );
    expect(listFreeDropSlots(placements, "tasks", 4, 2).some((slot) => slot.startRow === 1)).toBe(
      false,
    );
  });

  it("swaps pack order and closes the grid from the top", () => {
    const order: DashboardTileId[] = ["calendar", "tasks"];
    const swapped = swapTileOrder(order, "calendar", "tasks");
    expect(swapped).toEqual(["tasks", "calendar"]);
    const colSpan = (): ColSpan => 4;
    const rowSpan = (): RowSpan => 2;
    const placements = buildTilePlacements(swapped ?? [], colSpan, rowSpan);
    expect(placements.find((entry) => entry.id === "tasks")?.startCol).toBe(1);
    expect(placements.find((entry) => entry.id === "calendar")?.startCol).toBe(5);
    expect(placements.find((entry) => entry.id === "calendar")?.startRow).toBe(1);
  });

  it("keeps a downsized tile in its cell instead of packing into an earlier hole", () => {
    const order: DashboardTileId[] = ["history", "calendar", "github"];
    const rowSpan = (): RowSpan => 2;
    const wide = (id: DashboardTileId): ColSpan => (id === "github" ? 4 : 8);
    const packed = buildTilePlacements(order, wide, rowSpan);
    const calendarWide = packed.find((entry) => entry.id === "calendar");
    const github = packed.find((entry) => entry.id === "github");
    expect(calendarWide?.startRow).toBe(3);
    expect(github?.startRow).toBe(1);
    expect(github?.startCol).toBe(9);

    const narrow = (id: DashboardTileId): ColSpan => (id === "history" ? 8 : 4);
    const jumped = buildTilePlacements(order, narrow, rowSpan);
    expect(jumped.find((entry) => entry.id === "calendar")?.startRow).toBe(1);
    expect(jumped.find((entry) => entry.id === "calendar")?.startCol).toBe(9);

    const held = buildTilePlacements(order, narrow, rowSpan, anchorsFromPlacements(packed));
    expect(held.find((entry) => entry.id === "calendar")?.startRow).toBe(3);
    expect(held.find((entry) => entry.id === "calendar")?.startCol).toBe(1);
    expect(held.find((entry) => entry.id === "github")?.startCol).toBe(9);
  });

  it("reloads pinned cells and drops anchors that were not pinned", () => {
    const pinned = normalizeLayout({
      version: 1,
      order: ["calendar"],
      pinned: true,
      anchor: { calendar: { row: 3, col: 5 }, github: { row: 0, col: 1 } },
      gap: 16,
    });
    expect(pinned.pinned).toBe(true);
    expect(pinned.anchor.calendar).toEqual({ row: 3, col: 5 });
    expect(pinned.anchor.github).toBeUndefined();

    const packed = normalizeLayout({
      version: 1,
      order: ["calendar"],
      anchor: { calendar: { row: 9, col: 1 } },
      gap: 16,
    });
    expect(packed.pinned).toBe(false);
    expect(packed.anchor).toEqual({});
  });

  it("blocks row growth at max span", () => {
    expect(
      canStepTileRowSpan(
        "github",
        1,
        ["github"],
        () => 8,
        () => 6,
      ),
    ).toBe(false);
    expect(
      canStepTileRowSpan(
        "history",
        1,
        ["history"],
        () => 8,
        () => 6,
      ),
    ).toBe(true);
    expect(
      canStepTileRowSpan(
        "history",
        1,
        ["history"],
        () => 8,
        () => 12,
      ),
    ).toBe(false);
  });

  it("dedupes order and appends newly introduced tile ids", () => {
    expect(
      normalizeLayout({
        version: 1,
        order: ["window", "window", "history", "github"],
        colSpan: { window: 12 },
        gap: 20,
      }).order,
    ).toEqual(["window", "history", "github", "machine", "media", "steam", "calendar", "tasks"]);
  });

  it("migrates stored rowSpan 1 to 2", () => {
    const layout = normalizeLayout({
      version: 1,
      order: ["window"],
      rowSpan: { window: 1 },
      gap: 16,
    });
    expect(layout.rowSpan.window).toBe(2);
  });

  it("drops malformed colSpan values and clamps gap", () => {
    const layout = normalizeLayout({
      version: 1,
      order: ["window"],
      colSpan: { window: 99, github: 4 },
      rowSpan: { window: 99, github: 2 },
      gap: Number.NaN,
    });

    expect(layout.colSpan.window).toBe(12);
    expect(layout.colSpan.github).toBe(4);
    expect(layout.rowSpan.window).toBe(2);
    expect(layout.rowSpan.github).toBe(2);
    expect(layout.gap).toBe(16);
  });

  it("falls back to defaults for invalid stored payloads", () => {
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, "{not-json");
    expect(readStoredDashboardLayout()).toEqual(normalizeLayout(null));
  });

  it("persists and reloads layout", () => {
    const custom = {
      ...DEFAULT_DASHBOARD_LAYOUT,
      gap: 24,
      colSpan: { ...DEFAULT_DASHBOARD_LAYOUT.colSpan, history: 12 as const },
      rowSpan: { ...DEFAULT_DASHBOARD_LAYOUT.rowSpan, history: 4 as const },
    };
    persistDashboardLayout(custom);
    expect(readStoredDashboardLayout().gap).toBe(24);
    expect(readStoredDashboardLayout().colSpan.history).toBe(12);
    expect(readStoredDashboardLayout().rowSpan.history).toBe(4);
  });

  it("accepts colSpan 3 in stored layout", () => {
    const custom = {
      ...DEFAULT_DASHBOARD_LAYOUT,
      colSpan: { ...DEFAULT_DASHBOARD_LAYOUT.colSpan, github: 3 as const, steam: 3 as const },
    };
    persistDashboardLayout(custom);
    expect(readStoredDashboardLayout().colSpan.github).toBe(3);
    expect(readStoredDashboardLayout().colSpan.steam).toBe(3);
  });

  it("resolveEffectiveSpan forces full width on mobile", () => {
    expect(resolveEffectiveSpan("github", 4, { isDesktop: false, mediaVisible: true })).toBe(12);
    expect(resolveEffectiveSpan("machine", 6, { isDesktop: true, mediaVisible: false })).toBe(6);
    expect(resolveEffectiveSpan("machine", 6, { isDesktop: true, mediaVisible: true })).toBe(6);
  });

  it("resolveEffectiveRowSpan keeps saved span on all viewports", () => {
    expect(resolveEffectiveRowSpan("history", 4)).toBe(4);
    expect(resolveEffectiveRowSpan("calendar", undefined)).toBe(2);
  });

  it("resolveSavedSpan uses defaults when span missing", () => {
    expect(resolveSavedSpan({ ...DEFAULT_DASHBOARD_LAYOUT, colSpan: {} }, "tasks")).toBe(6);
  });

  it("resolveSavedRowSpan uses defaults when span missing", () => {
    expect(resolveSavedRowSpan({ ...DEFAULT_DASHBOARD_LAYOUT, rowSpan: {} }, "tasks")).toBe(2);
  });

  it("ignores unsupported layout versions", () => {
    expect(normalizeLayout({ version: 2, order: ["window"], gap: 12 }).gap).toBe(16);
  });

  it("handles persist failures without throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => {
      persistDashboardLayout(DEFAULT_DASHBOARD_LAYOUT);
    }).not.toThrow();
  });
});
