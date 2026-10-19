export const DASHBOARD_LAYOUT_KEY = "pryladova.dashboardLayout";

export const DASHBOARD_ROW_HEIGHT = 72;

export const DASHBOARD_TILE_IDS = [
  "window",
  "machine",
  "media",
  "history",
  "github",
  "steam",
  "calendar",
  "tasks",
] as const;

export type DashboardTileId = (typeof DASHBOARD_TILE_IDS)[number];

export const COL_SPANS = [3, 4, 6, 8, 12] as const;

export type ColSpan = (typeof COL_SPANS)[number];

export const ROW_SPANS = [2, 3, 4, 5, 6] as const;

/** History lists many apps, so its height ladder continues past the shared cap. */
export const HISTORY_ROW_SPANS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export type RowSpan = (typeof HISTORY_ROW_SPANS)[number];

export const rowSpanLadder = (id?: DashboardTileId): readonly RowSpan[] =>
  id === "history" ? HISTORY_ROW_SPANS : ROW_SPANS;

export type TileAnchor = {
  row: number;
  col: number;
};

export type DashboardLayoutV1 = {
  version: 1;
  order: DashboardTileId[];
  colSpan: Partial<Record<DashboardTileId, ColSpan>>;
  rowSpan: Partial<Record<DashboardTileId, RowSpan>>;
  anchor: Partial<Record<DashboardTileId, TileAnchor>>;
  /** When set, span changes keep these cells. A swap clears it and repacks. A drop into empty space sets it. */
  pinned?: boolean;
  gap: number;
};

export const DEFAULT_GAP = 16;

export const MIN_GAP = 8;

export const MAX_GAP = 32;

export const DEFAULT_COL_SPAN: Record<DashboardTileId, ColSpan> = {
  window: 12,
  machine: 6,
  media: 6,
  history: 8,
  github: 4,
  steam: 4,
  calendar: 6,
  tasks: 6,
};

export const DEFAULT_ROW_SPAN: Record<DashboardTileId, RowSpan> = {
  window: 2,
  machine: 2,
  media: 2,
  history: 6,
  github: 3,
  steam: 3,
  calendar: 2,
  tasks: 2,
};

/** Pack order tuned so default spans fill the desktop grid with no holes. */
export const DEFAULT_DASHBOARD_TILE_ORDER: DashboardTileId[] = [
  "window",
  "machine",
  "media",
  "history",
  "github",
  "steam",
  "tasks",
  "calendar",
];

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutV1 = {
  version: 1,
  order: [...DEFAULT_DASHBOARD_TILE_ORDER],
  colSpan: { ...DEFAULT_COL_SPAN },
  rowSpan: { ...DEFAULT_ROW_SPAN },
  anchor: {},
  gap: DEFAULT_GAP,
};

const isDashboardTileId = (value: unknown): value is DashboardTileId =>
  typeof value === "string" && (DASHBOARD_TILE_IDS as readonly string[]).includes(value);

const isColSpan = (value: unknown): value is ColSpan =>
  typeof value === "number" && (COL_SPANS as readonly number[]).includes(value);

const isRowSpan = (value: unknown, id?: DashboardTileId): value is RowSpan =>
  typeof value === "number" && (rowSpanLadder(id) as readonly number[]).includes(value);

const isTileAnchor = (value: unknown): value is TileAnchor => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.row === "number" &&
    Number.isInteger(record.row) &&
    record.row >= 1 &&
    typeof record.col === "number" &&
    Number.isInteger(record.col) &&
    record.col >= 1 &&
    record.col <= 12
  );
};

const normalizeAnchors = (anchor: unknown): Partial<Record<DashboardTileId, TileAnchor>> => {
  if (anchor === null || typeof anchor !== "object") {
    return {};
  }
  const normalized: Partial<Record<DashboardTileId, TileAnchor>> = {};
  for (const [key, value] of Object.entries(anchor)) {
    if (isDashboardTileId(key) && isTileAnchor(value)) {
      normalized[key] = { row: value.row, col: value.col };
    }
  }
  return normalized;
};

export const cycleColSpan = (current: ColSpan): ColSpan => {
  const index = COL_SPANS.indexOf(current);
  return COL_SPANS[(index + 1) % COL_SPANS.length] ?? 4;
};

export const stepColSpan = (current: ColSpan, direction: 1 | -1): ColSpan => {
  const index = COL_SPANS.indexOf(current);
  const nextIndex = index + direction;
  if (nextIndex < 0) {
    return COL_SPANS[0] ?? 4;
  }
  if (nextIndex >= COL_SPANS.length) {
    return COL_SPANS[COL_SPANS.length - 1] ?? 12;
  }
  return COL_SPANS[nextIndex] ?? current;
};

export const stepRowSpan = (current: RowSpan, direction: 1 | -1, id?: DashboardTileId): RowSpan => {
  const ladder = rowSpanLadder(id);
  const index = ladder.indexOf(current);
  if (index < 0) {
    return current;
  }
  const nextIndex = index + direction;
  if (nextIndex < 0) {
    return ladder[0] ?? 2;
  }
  if (nextIndex >= ladder.length) {
    return ladder[ladder.length - 1] ?? current;
  }
  return ladder[nextIndex] ?? current;
};

export type TilePlacement = {
  id: DashboardTileId;
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

const occupancyKey = (row: number, col: number): string => `${row}:${col}`;

const canFitRectangle = (
  occupied: Set<string>,
  startRow: number,
  startCol: number,
  colSpan: number,
  rowSpan: number,
): boolean => {
  if (startCol + colSpan - 1 > 12) {
    return false;
  }
  for (let row = startRow; row < startRow + rowSpan; row += 1) {
    for (let col = startCol; col < startCol + colSpan; col += 1) {
      if (occupied.has(occupancyKey(row, col))) {
        return false;
      }
    }
  }
  return true;
};

const markRectangle = (
  occupied: Set<string>,
  startRow: number,
  startCol: number,
  colSpan: number,
  rowSpan: number,
): void => {
  for (let row = startRow; row < startRow + rowSpan; row += 1) {
    for (let col = startCol; col < startCol + colSpan; col += 1) {
      occupied.add(occupancyKey(row, col));
    }
  }
};

export const buildTilePlacements = (
  visibleOrder: readonly DashboardTileId[],
  resolveColSpan: (id: DashboardTileId) => ColSpan,
  resolveRowSpan: (id: DashboardTileId) => RowSpan,
  anchors?: Partial<Record<DashboardTileId, TileAnchor>>,
): TilePlacement[] => {
  const placements: TilePlacement[] = [];
  const occupied = new Set<string>();

  for (const id of visibleOrder) {
    const colSpan = resolveColSpan(id);
    const rowSpan = resolveRowSpan(id);
    const anchor = anchors?.[id];
    let placed = false;

    if (anchor && canFitRectangle(occupied, anchor.row, anchor.col, colSpan, rowSpan)) {
      markRectangle(occupied, anchor.row, anchor.col, colSpan, rowSpan);
      placements.push({
        id,
        startRow: anchor.row,
        endRow: anchor.row + rowSpan - 1,
        startCol: anchor.col,
        endCol: anchor.col + colSpan - 1,
      });
      placed = true;
    }

    for (let startRow = 1; !placed && startRow < 500; startRow += 1) {
      for (let startCol = 1; startCol <= 12 - colSpan + 1; startCol += 1) {
        if (canFitRectangle(occupied, startRow, startCol, colSpan, rowSpan)) {
          markRectangle(occupied, startRow, startCol, colSpan, rowSpan);
          placements.push({
            id,
            startRow,
            endRow: startRow + rowSpan - 1,
            startCol,
            endCol: startCol + colSpan - 1,
          });
          placed = true;
          break;
        }
      }
    }
  }

  return collapseEmptyRows(placements);
};

/**
 * A row resize pins the cells tiles were pushed to, so shrinking back leaves those
 * rows empty. Drop fully empty rows. A hole beside a tile stays, so a narrower tile
 * does not jump sideways into it.
 */
const collapseEmptyRows = (placements: TilePlacement[]): TilePlacement[] => {
  if (placements.length === 0) {
    return placements;
  }
  const occupied = new Set<number>();
  let maxRow = 1;
  for (const placement of placements) {
    maxRow = Math.max(maxRow, placement.endRow);
    for (let row = placement.startRow; row <= placement.endRow; row += 1) {
      occupied.add(row);
    }
  }
  const rowMap = new Map<number, number>();
  let nextRow = 1;
  for (let row = 1; row <= maxRow; row += 1) {
    if (!occupied.has(row)) {
      continue;
    }
    rowMap.set(row, nextRow);
    nextRow += 1;
  }
  return placements.map((placement) => {
    const startRow = rowMap.get(placement.startRow) ?? placement.startRow;
    const endRow = rowMap.get(placement.endRow) ?? placement.endRow;
    if (startRow === placement.startRow && endRow === placement.endRow) {
      return placement;
    }
    return { ...placement, startRow, endRow };
  });
};

export const anchorsFromPlacements = (
  placements: readonly TilePlacement[],
): Partial<Record<DashboardTileId, TileAnchor>> => {
  const anchors: Partial<Record<DashboardTileId, TileAnchor>> = {};
  for (const placement of placements) {
    anchors[placement.id] = { row: placement.startRow, col: placement.startCol };
  }
  return anchors;
};

export type FreeDropSlot = {
  id: string;
  startRow: number;
  startCol: number;
  colSpan: number;
  rowSpan: number;
  hitColSpan: number;
  hitRowSpan: number;
};

export const freeDropSlotId = (row: number, col: number): string => `free:${row}:${col}`;

export const parseFreeDropSlotId = (id: unknown): TileAnchor | null => {
  if (typeof id !== "string") {
    return null;
  }
  const match = /^free:(\d+):(\d+)$/.exec(id);
  if (!match) {
    return null;
  }
  const row = Number(match[1]);
  const col = Number(match[2]);
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 1 || col < 1 || col > 12) {
    return null;
  }
  return { row, col };
};

/** Empty rectangles the dragged tile can occupy, snapped to the top-left of each hole. */
export const listFreeDropSlots = (
  placements: readonly TilePlacement[],
  activeId: DashboardTileId,
  colSpan: number,
  rowSpan: number,
): FreeDropSlot[] => {
  const occupied = new Set<string>();
  let maxRow = 1;
  for (const placement of placements) {
    maxRow = Math.max(maxRow, placement.endRow);
    if (placement.id === activeId) {
      continue;
    }
    markRectangle(
      occupied,
      placement.startRow,
      placement.startCol,
      placement.endCol - placement.startCol + 1,
      placement.endRow - placement.startRow + 1,
    );
  }

  const fitsAt = (startRow: number, startCol: number, rows: number, cols: number): boolean =>
    canFitRectangle(occupied, startRow, startCol, cols, rows);

  const slots: FreeDropSlot[] = [];
  for (let startRow = 1; startRow <= maxRow; startRow += 1) {
    for (let startCol = 1; startCol <= 12 - colSpan + 1; startCol += 1) {
      if (!fitsAt(startRow, startCol, rowSpan, colSpan)) {
        continue;
      }
      const snappedUp = startRow > 1 && fitsAt(startRow - 1, startCol, rowSpan, colSpan);
      const snappedLeft = startCol > 1 && fitsAt(startRow, startCol - 1, rowSpan, colSpan);
      if (snappedUp || snappedLeft) {
        continue;
      }
      let hitColSpan = colSpan;
      while (startCol + hitColSpan <= 12 && fitsAt(startRow, startCol, rowSpan, hitColSpan + 1)) {
        hitColSpan += 1;
      }
      let hitRowSpan = rowSpan;
      while (
        startRow + hitRowSpan <= maxRow &&
        fitsAt(startRow, startCol, hitRowSpan + 1, hitColSpan)
      ) {
        hitRowSpan += 1;
      }
      slots.push({
        id: freeDropSlotId(startRow, startCol),
        startRow,
        startCol,
        colSpan,
        rowSpan,
        hitColSpan,
        hitRowSpan,
      });
    }
  }
  return slots;
};

/** Pin every tile where it is, and move one tile into a free cell. */
export const anchorsForFreeDrop = (
  visibleOrder: readonly DashboardTileId[],
  resolveColSpan: (id: DashboardTileId) => ColSpan,
  resolveRowSpan: (id: DashboardTileId) => RowSpan,
  placements: readonly TilePlacement[],
  id: DashboardTileId,
  anchor: TileAnchor,
): Partial<Record<DashboardTileId, TileAnchor>> | null => {
  const current = placements.find((entry) => entry.id === id);
  if (current && current.startRow === anchor.row && current.startCol === anchor.col) {
    return null;
  }
  const anchors = anchorsFromPlacements(placements);
  anchors[id] = anchor;
  const placed = buildTilePlacements(visibleOrder, resolveColSpan, resolveRowSpan, anchors);
  const moved = placed.find((entry) => entry.id === id);
  if (
    placed.length !== visibleOrder.length ||
    placementsOverlap(placed) ||
    !moved ||
    moved.startCol !== anchor.col
  ) {
    return null;
  }
  return anchorsFromPlacements(placed);
};

/** Exchange two tiles in pack order. Placement is always first-fit from that order, so gaps close. */
export const swapTileOrder = (
  order: readonly DashboardTileId[],
  activeId: DashboardTileId,
  overId: DashboardTileId,
): DashboardTileId[] | null => {
  if (activeId === overId) {
    return null;
  }
  const from = order.indexOf(activeId);
  const to = order.indexOf(overId);
  if (from < 0 || to < 0) {
    return null;
  }
  const next = [...order];
  next[from] = overId;
  next[to] = activeId;
  return next;
};

const placementsOverlap = (placements: TilePlacement[]): boolean => {
  const occupied = new Set<string>();
  for (const placement of placements) {
    for (let row = placement.startRow; row <= placement.endRow; row += 1) {
      for (let col = placement.startCol; col <= placement.endCol; col += 1) {
        const key = occupancyKey(row, col);
        if (occupied.has(key)) {
          return true;
        }
        occupied.add(key);
      }
    }
  }
  return false;
};

export type RowBand = {
  startRow: number;
  endRow: number;
  tileIds: DashboardTileId[];
};

export const listRowBands = (placements: TilePlacement[]): RowBand[] => {
  const byStart = new Map<number, TilePlacement[]>();
  for (const placement of placements) {
    const group = byStart.get(placement.startRow) ?? [];
    group.push(placement);
    byStart.set(placement.startRow, group);
  }

  return [...byStart.entries()]
    .sort(([left], [right]) => left - right)
    .map(([startRow, tiles]) => ({
      startRow,
      endRow: Math.max(...tiles.map((tile) => tile.endRow)),
      tileIds: tiles.map((tile) => tile.id),
    }));
};

export const rowBandBoundaryTopPx = (endRow: number, gap: number): number => {
  const bandBottomPx = endRow * DASHBOARD_ROW_HEIGHT + (endRow - 1) * gap;
  return bandBottomPx + gap / 2;
};

export const createDefaultDashboardLayout = (): DashboardLayoutV1 => normalizeLayout(null);

export const canApplyRowSpanOverrides = (
  visibleOrder: DashboardTileId[],
  resolveColSpan: (id: DashboardTileId) => ColSpan,
  resolveRowSpan: (id: DashboardTileId) => RowSpan,
  overrides: Partial<Record<DashboardTileId, RowSpan>>,
  anchors?: Partial<Record<DashboardTileId, TileAnchor>>,
): boolean => {
  const resolveWithOverrides = (id: DashboardTileId): RowSpan =>
    overrides[id] ?? resolveRowSpan(id);
  const placements = buildTilePlacements(
    visibleOrder,
    resolveColSpan,
    resolveWithOverrides,
    anchors,
  );
  return placements.length === visibleOrder.length && !placementsOverlap(placements);
};

export const stepRowBandSpans = (
  band: RowBand,
  direction: 1 | -1,
  resolveRowSpan: (id: DashboardTileId) => RowSpan,
): Partial<Record<DashboardTileId, RowSpan>> | null => {
  const overrides: Partial<Record<DashboardTileId, RowSpan>> = {};
  for (const id of band.tileIds) {
    const next = stepRowSpan(resolveRowSpan(id), direction, id);
    if (next === resolveRowSpan(id)) {
      return null;
    }
    overrides[id] = next;
  }
  return overrides;
};

export const findRightGapNeighbor = (
  visibleOrder: DashboardTileId[],
  resolveColSpan: (id: DashboardTileId) => ColSpan,
  resolveRowSpan: (id: DashboardTileId) => RowSpan,
  id: DashboardTileId,
  anchors?: Partial<Record<DashboardTileId, TileAnchor>>,
): DashboardTileId | null => {
  const placements = buildTilePlacements(visibleOrder, resolveColSpan, resolveRowSpan, anchors);
  const tile = placements.find((entry) => entry.id === id);
  if (!tile) {
    return null;
  }
  const neighbor = placements.find(
    (entry) =>
      entry.id !== id &&
      entry.startRow === tile.startRow &&
      entry.endRow === tile.endRow &&
      entry.startCol === tile.endCol + 1,
  );
  return neighbor?.id ?? null;
};

export const findLeftGapNeighbor = (
  visibleOrder: DashboardTileId[],
  resolveColSpan: (id: DashboardTileId) => ColSpan,
  resolveRowSpan: (id: DashboardTileId) => RowSpan,
  id: DashboardTileId,
  anchors?: Partial<Record<DashboardTileId, TileAnchor>>,
): DashboardTileId | null => {
  const placements = buildTilePlacements(visibleOrder, resolveColSpan, resolveRowSpan, anchors);
  const tile = placements.find((entry) => entry.id === id);
  if (!tile || tile.startCol <= 1) {
    return null;
  }
  const neighbor = placements.find(
    (entry) =>
      entry.id !== id &&
      entry.startRow === tile.startRow &&
      entry.endRow === tile.endRow &&
      entry.endCol === tile.startCol - 1,
  );
  return neighbor?.id ?? null;
};

export const findBottomGapNeighbor = (
  visibleOrder: DashboardTileId[],
  resolveColSpan: (id: DashboardTileId) => ColSpan,
  resolveRowSpan: (id: DashboardTileId) => RowSpan,
  id: DashboardTileId,
  anchors?: Partial<Record<DashboardTileId, TileAnchor>>,
): DashboardTileId | null => {
  const placements = buildTilePlacements(visibleOrder, resolveColSpan, resolveRowSpan, anchors);
  const tile = placements.find((entry) => entry.id === id);
  if (!tile) {
    return null;
  }
  const neighbor = placements.find(
    (entry) =>
      entry.id !== id &&
      entry.startCol === tile.startCol &&
      entry.endCol === tile.endCol &&
      entry.startRow === tile.endRow + 1,
  );
  return neighbor?.id ?? null;
};

export const findTopGapNeighbor = (
  visibleOrder: DashboardTileId[],
  resolveColSpan: (id: DashboardTileId) => ColSpan,
  resolveRowSpan: (id: DashboardTileId) => RowSpan,
  id: DashboardTileId,
  anchors?: Partial<Record<DashboardTileId, TileAnchor>>,
): DashboardTileId | null => {
  const placements = buildTilePlacements(visibleOrder, resolveColSpan, resolveRowSpan, anchors);
  const tile = placements.find((entry) => entry.id === id);
  if (!tile || tile.startRow <= 1) {
    return null;
  }
  const neighbor = placements.find(
    (entry) =>
      entry.id !== id &&
      entry.startCol === tile.startCol &&
      entry.endCol === tile.endCol &&
      entry.endRow === tile.startRow - 1,
  );
  return neighbor?.id ?? null;
};

/** Move a shared horizontal edge: direction 1 = right (left tile grows, right tile shrinks). */
export const stepSharedColBoundary = (
  leftSpan: ColSpan,
  rightSpan: ColSpan,
  direction: 1 | -1,
): { left: ColSpan; right: ColSpan } | null => {
  if (direction === 1) {
    const left = stepColSpan(leftSpan, 1);
    const right = stepColSpan(rightSpan, -1);
    if (left === leftSpan || right === rightSpan) {
      return null;
    }
    return { left, right };
  }
  const left = stepColSpan(leftSpan, -1);
  const right = stepColSpan(rightSpan, 1);
  if (left === leftSpan || right === rightSpan) {
    return null;
  }
  return { left, right };
};

const tileRowsOverlap = (left: TilePlacement, right: TilePlacement): boolean =>
  left.startRow <= right.endRow && right.startRow <= left.endRow;

export type ColGrowPushResult = {
  colSpans: Partial<Record<DashboardTileId, ColSpan>>;
  anchors: Partial<Record<DashboardTileId, TileAnchor>>;
};

/** Grow a tile right when the neighbor cannot shrink — push same-row tiles into trailing columns. */
export const tryColGrowWithPush = (
  visibleOrder: DashboardTileId[],
  resolveColSpan: (id: DashboardTileId) => ColSpan,
  resolveRowSpan: (id: DashboardTileId) => RowSpan,
  tileId: DashboardTileId,
  anchors?: Partial<Record<DashboardTileId, TileAnchor>>,
): ColGrowPushResult | null => {
  const placements = buildTilePlacements(visibleOrder, resolveColSpan, resolveRowSpan, anchors);
  const tile = placements.find((entry) => entry.id === tileId);
  if (!tile) {
    return null;
  }

  const currentSpan = resolveColSpan(tileId);
  const nextSpan = stepColSpan(currentSpan, 1);
  if (nextSpan === currentSpan) {
    return null;
  }

  const delta = nextSpan - currentSpan;
  const tilesToShift = placements.filter(
    (entry) => entry.id !== tileId && tileRowsOverlap(tile, entry) && entry.startCol > tile.endCol,
  );

  for (const entry of tilesToShift) {
    if (entry.endCol + delta > 12) {
      return null;
    }
  }

  const nextAnchors: Partial<Record<DashboardTileId, TileAnchor>> = { ...anchors };
  for (const entry of tilesToShift) {
    nextAnchors[entry.id] = { row: entry.startRow, col: entry.startCol + delta };
  }

  const nextColSpans: Partial<Record<DashboardTileId, ColSpan>> = { [tileId]: nextSpan };
  const resolveWithSpan = (id: DashboardTileId): ColSpan => nextColSpans[id] ?? resolveColSpan(id);
  const nextPlacements = buildTilePlacements(
    visibleOrder,
    resolveWithSpan,
    resolveRowSpan,
    nextAnchors,
  );
  if (nextPlacements.length !== visibleOrder.length || placementsOverlap(nextPlacements)) {
    return null;
  }

  return { colSpans: nextColSpans, anchors: nextAnchors };
};

/** Move a shared vertical edge: direction 1 = down (top tile grows, bottom tile shrinks). */
export const stepSharedRowBoundary = (
  topSpan: RowSpan,
  bottomSpan: RowSpan,
  direction: 1 | -1,
  topId?: DashboardTileId,
  bottomId?: DashboardTileId,
): { top: RowSpan; bottom: RowSpan } | null => {
  if (direction === 1) {
    const top = stepRowSpan(topSpan, 1, topId);
    const bottom = stepRowSpan(bottomSpan, -1, bottomId);
    if (top === topSpan || bottom === bottomSpan) {
      return null;
    }
    return { top, bottom };
  }
  const top = stepRowSpan(topSpan, -1, topId);
  const bottom = stepRowSpan(bottomSpan, 1, bottomId);
  if (top === topSpan || bottom === bottomSpan) {
    return null;
  }
  return { top, bottom };
};

export type ResizeHandleEdges = {
  right: boolean;
  left: boolean;
  bottom: boolean;
  top: boolean;
};

export const canStepTileRowSpan = (
  id: DashboardTileId,
  direction: 1 | -1,
  visibleOrder: DashboardTileId[],
  resolveColSpan: (id: DashboardTileId) => ColSpan,
  resolveRowSpan: (id: DashboardTileId) => RowSpan,
  anchors?: Partial<Record<DashboardTileId, TileAnchor>>,
): boolean => {
  const next = stepRowSpan(resolveRowSpan(id), direction, id);
  if (next === resolveRowSpan(id)) {
    return false;
  }
  return canApplyRowSpanOverrides(
    visibleOrder,
    resolveColSpan,
    resolveRowSpan,
    { [id]: next },
    anchors,
  );
};

export const resolveResizeHandleEdges = (
  visibleOrder: DashboardTileId[],
  resolveColSpan: (id: DashboardTileId) => ColSpan,
  resolveRowSpan: (id: DashboardTileId) => RowSpan,
  id: DashboardTileId,
  anchors?: Partial<Record<DashboardTileId, TileAnchor>>,
): ResizeHandleEdges => {
  const placements = buildTilePlacements(visibleOrder, resolveColSpan, resolveRowSpan, anchors);
  const tile = placements.find((entry) => entry.id === id);
  if (!tile) {
    return { right: false, left: false, bottom: false, top: false };
  }
  const canGrow = canStepTileRowSpan(id, 1, visibleOrder, resolveColSpan, resolveRowSpan, anchors);
  const canShrink = canStepTileRowSpan(
    id,
    -1,
    visibleOrder,
    resolveColSpan,
    resolveRowSpan,
    anchors,
  );
  return {
    right: true,
    left: tile.startCol > 1,
    bottom: canGrow || canShrink,
    top: tile.startRow > 1,
  };
};

export const clampGap = (gap: number): number =>
  Math.min(MAX_GAP, Math.max(MIN_GAP, Math.round(gap)));

export const normalizeOrder = (order: unknown): DashboardTileId[] => {
  const seen = new Set<DashboardTileId>();
  const normalized: DashboardTileId[] = [];

  if (Array.isArray(order)) {
    for (const entry of order) {
      if (!isDashboardTileId(entry) || seen.has(entry)) {
        continue;
      }
      seen.add(entry);
      normalized.push(entry);
    }
  }

  for (const id of DASHBOARD_TILE_IDS) {
    if (!seen.has(id)) {
      normalized.push(id);
    }
  }

  return normalized;
};

export const normalizeColSpan = (colSpan: unknown): Partial<Record<DashboardTileId, ColSpan>> => {
  if (colSpan === null || typeof colSpan !== "object") {
    return { ...DEFAULT_COL_SPAN };
  }

  const normalized: Partial<Record<DashboardTileId, ColSpan>> = { ...DEFAULT_COL_SPAN };
  for (const [key, value] of Object.entries(colSpan)) {
    if (isDashboardTileId(key) && isColSpan(value)) {
      normalized[key] = value;
    }
  }
  return normalized;
};

export const normalizeRowSpan = (rowSpan: unknown): Partial<Record<DashboardTileId, RowSpan>> => {
  if (rowSpan === null || typeof rowSpan !== "object") {
    return { ...DEFAULT_ROW_SPAN };
  }

  const normalized: Partial<Record<DashboardTileId, RowSpan>> = { ...DEFAULT_ROW_SPAN };
  for (const [key, value] of Object.entries(rowSpan)) {
    if (isDashboardTileId(key) && isRowSpan(value, key)) {
      normalized[key] = value;
    } else if (isDashboardTileId(key) && value === 1) {
      normalized[key] = 2;
    }
  }
  return normalized;
};

export const normalizeLayout = (value: unknown): DashboardLayoutV1 => {
  if (value === null || typeof value !== "object") {
    return {
      ...DEFAULT_DASHBOARD_LAYOUT,
      order: [...DEFAULT_DASHBOARD_LAYOUT.order],
      colSpan: { ...DEFAULT_COL_SPAN },
      rowSpan: { ...DEFAULT_ROW_SPAN },
      anchor: {},
    };
  }

  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    return {
      ...DEFAULT_DASHBOARD_LAYOUT,
      order: [...DEFAULT_DASHBOARD_LAYOUT.order],
      colSpan: { ...DEFAULT_COL_SPAN },
      rowSpan: { ...DEFAULT_ROW_SPAN },
      anchor: {},
    };
  }

  const gapRaw = record.gap;
  const gap =
    typeof gapRaw === "number" && Number.isFinite(gapRaw) ? clampGap(gapRaw) : DEFAULT_GAP;

  const pinned = record.pinned === true;

  return {
    version: 1,
    order: normalizeOrder(record.order),
    colSpan: normalizeColSpan(record.colSpan),
    rowSpan: normalizeRowSpan(record.rowSpan),
    anchor: pinned ? normalizeAnchors(record.anchor) : {},
    pinned,
    gap,
  };
};

export const readStoredDashboardLayout = (): DashboardLayoutV1 => {
  try {
    const raw = localStorage.getItem(DASHBOARD_LAYOUT_KEY);
    if (!raw) {
      return normalizeLayout(null);
    }
    return normalizeLayout(JSON.parse(raw));
  } catch {
    return normalizeLayout(null);
  }
};

export const persistDashboardLayout = (layout: DashboardLayoutV1): void => {
  try {
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // quota exceeded or storage disabled
  }
};

export const mergeReorderIntoFullOrder = (
  fullOrder: DashboardTileId[],
  visibleIds: DashboardTileId[],
  reorderedVisibleIds: DashboardTileId[],
): DashboardTileId[] => {
  const visibleSet = new Set(visibleIds);
  let visibleIndex = 0;

  return fullOrder.map((id) => {
    if (!visibleSet.has(id)) {
      return id;
    }
    const next = reorderedVisibleIds[visibleIndex];
    visibleIndex += 1;
    return next ?? id;
  });
};

export type ResolveEffectiveSpanContext = {
  isDesktop: boolean;
  mediaVisible: boolean;
};

export const resolveEffectiveSpan = (
  id: DashboardTileId,
  savedSpan: ColSpan | undefined,
  ctx: ResolveEffectiveSpanContext,
): ColSpan => {
  if (!ctx.isDesktop) {
    return 12;
  }

  const span = savedSpan ?? DEFAULT_COL_SPAN[id];
  return span;
};

export const resolveEffectiveRowSpan = (
  id: DashboardTileId,
  savedSpan: RowSpan | undefined,
): RowSpan => savedSpan ?? DEFAULT_ROW_SPAN[id];

export const resolveSavedSpan = (layout: DashboardLayoutV1, id: DashboardTileId): ColSpan =>
  layout.colSpan[id] ?? DEFAULT_COL_SPAN[id];

export const resolveSavedRowSpan = (layout: DashboardLayoutV1, id: DashboardTileId): RowSpan =>
  layout.rowSpan[id] ?? DEFAULT_ROW_SPAN[id];

export const filterVisibleTileOrder = (
  order: DashboardTileId[],
  isTileVisible: (id: DashboardTileId) => boolean,
): DashboardTileId[] => order.filter(isTileVisible);
