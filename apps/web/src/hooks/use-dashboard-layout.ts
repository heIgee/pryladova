import { useState, useSyncExternalStore } from "react";
import {
  type ColGrowPushResult,
  type ColSpan,
  createDefaultDashboardLayout,
  type DashboardTileId,
  DEFAULT_GAP,
  persistDashboardLayout,
  type ResolveEffectiveSpanContext,
  type RowSpan,
  readStoredDashboardLayout,
  resolveEffectiveRowSpan,
  resolveEffectiveSpan,
  resolveSavedRowSpan,
  resolveSavedSpan,
  type TileAnchor,
} from "@/lib/dashboard-layout";
import {
  getDesktopMediaServerSnapshot,
  getDesktopMediaSnapshot,
  subscribeDesktopMedia,
} from "@/lib/desktop-media";

export const useDashboardLayout = () => {
  const [layout, setLayout] = useState(readStoredDashboardLayout);
  const [previewColSpans, setPreviewColSpans] = useState<Partial<Record<DashboardTileId, ColSpan>>>(
    {},
  );
  const [previewRowSpans, setPreviewRowSpans] = useState<Partial<Record<DashboardTileId, RowSpan>>>(
    {},
  );
  const [previewAnchors, setPreviewAnchors] = useState<
    Partial<Record<DashboardTileId, TileAnchor>>
  >({});
  const isDesktop = useSyncExternalStore(
    subscribeDesktopMedia,
    getDesktopMediaSnapshot,
    getDesktopMediaServerSnapshot,
  );

  const holdAnchors = (anchors: Partial<Record<DashboardTileId, TileAnchor>>) => {
    setPreviewAnchors((current) => (Object.keys(current).length > 0 ? current : anchors));
  };

  const setDraftRowBand = (
    overrides: Partial<Record<DashboardTileId, RowSpan>>,
    anchors: Partial<Record<DashboardTileId, TileAnchor>>,
  ) => {
    holdAnchors(anchors);
    setPreviewRowSpans((current) => ({ ...current, ...overrides }));
  };

  const commitDraftRowBand = (
    overrides: Partial<Record<DashboardTileId, RowSpan>>,
    anchors: Partial<Record<DashboardTileId, TileAnchor>>,
  ) => {
    setPreviewRowSpans({});
    setPreviewAnchors({});
    setLayout((current) => {
      const next = {
        ...current,
        gap: DEFAULT_GAP,
        pinned: true,
        anchor: anchors,
        rowSpan: {
          ...current.rowSpan,
          ...overrides,
        },
      };
      persistDashboardLayout(next);
      return next;
    });
  };

  const resetLayout = () => {
    setPreviewColSpans({});
    setPreviewRowSpans({});
    setPreviewAnchors({});
    const next = createDefaultDashboardLayout();
    setLayout(next);
    persistDashboardLayout(next);
  };

  const commitTileSwap = (order: DashboardTileId[]) => {
    setPreviewAnchors({});
    setLayout((current) => {
      const next = {
        ...current,
        gap: DEFAULT_GAP,
        pinned: false,
        anchor: {},
        order,
      };
      persistDashboardLayout(next);
      return next;
    });
  };

  const commitTilePlace = (anchor: Partial<Record<DashboardTileId, TileAnchor>>) => {
    setPreviewAnchors({});
    setLayout((current) => {
      const next = {
        ...current,
        gap: DEFAULT_GAP,
        pinned: true,
        anchor,
      };
      persistDashboardLayout(next);
      return next;
    });
  };

  const resolveSpan = (id: DashboardTileId, ctx: ResolveEffectiveSpanContext): ColSpan => {
    const preview = previewColSpans[id];
    if (preview && ctx.isDesktop) {
      return preview;
    }
    return resolveEffectiveSpan(id, resolveSavedSpan(layout, id), ctx);
  };

  const resolveRowSpan = (id: DashboardTileId): RowSpan => {
    const preview = previewRowSpans[id];
    if (preview) {
      return preview;
    }
    return resolveEffectiveRowSpan(id, resolveSavedRowSpan(layout, id));
  };

  const setDraftSpan = (
    id: DashboardTileId,
    span: ColSpan,
    anchors: Partial<Record<DashboardTileId, TileAnchor>>,
  ) => {
    holdAnchors(anchors);
    setPreviewColSpans((current) => ({ ...current, [id]: span }));
  };

  const setDraftRowSpan = (
    id: DashboardTileId,
    span: RowSpan,
    anchors: Partial<Record<DashboardTileId, TileAnchor>>,
  ) => {
    holdAnchors(anchors);
    setPreviewRowSpans((current) => ({ ...current, [id]: span }));
  };

  const setDraftBoundary = (
    leftId: DashboardTileId,
    leftSpan: ColSpan,
    rightId: DashboardTileId,
    rightSpan: ColSpan,
    anchors: Partial<Record<DashboardTileId, TileAnchor>>,
  ) => {
    holdAnchors(anchors);
    setPreviewColSpans((current) => ({
      ...current,
      [leftId]: leftSpan,
      [rightId]: rightSpan,
    }));
  };

  const setDraftColPush = (
    result: ColGrowPushResult,
    anchors: Partial<Record<DashboardTileId, TileAnchor>>,
  ) => {
    holdAnchors(anchors);
    setPreviewColSpans((current) => ({ ...current, ...result.colSpans }));
  };

  const setDraftRowBoundary = (
    topId: DashboardTileId,
    topSpan: RowSpan,
    bottomId: DashboardTileId,
    bottomSpan: RowSpan,
    anchors: Partial<Record<DashboardTileId, TileAnchor>>,
  ) => {
    holdAnchors(anchors);
    setPreviewRowSpans((current) => ({
      ...current,
      [topId]: topSpan,
      [bottomId]: bottomSpan,
    }));
  };

  const clearDraftSpans = () => {
    setPreviewColSpans({});
    setPreviewRowSpans({});
    setPreviewAnchors({});
  };

  const commitDraftSpan = (
    id: DashboardTileId,
    span: ColSpan,
    anchors: Partial<Record<DashboardTileId, TileAnchor>>,
  ) => {
    setPreviewColSpans((current) => {
      if (!(id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[id];
      return next;
    });
    setPreviewAnchors({});
    setLayout((current) => {
      const next = {
        ...current,
        gap: DEFAULT_GAP,
        pinned: true,
        anchor: anchors,
        colSpan: {
          ...current.colSpan,
          [id]: span,
        },
      };
      persistDashboardLayout(next);
      return next;
    });
  };

  const commitDraftRowSpan = (
    id: DashboardTileId,
    span: RowSpan,
    anchors: Partial<Record<DashboardTileId, TileAnchor>>,
  ) => {
    setPreviewRowSpans((current) => {
      if (!(id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[id];
      return next;
    });
    setPreviewAnchors({});
    setLayout((current) => {
      const next = {
        ...current,
        gap: DEFAULT_GAP,
        pinned: true,
        anchor: anchors,
        rowSpan: {
          ...current.rowSpan,
          [id]: span,
        },
      };
      persistDashboardLayout(next);
      return next;
    });
  };

  const commitDraftColPush = (
    result: ColGrowPushResult,
    anchors: Partial<Record<DashboardTileId, TileAnchor>>,
  ) => {
    setPreviewColSpans({});
    setPreviewAnchors({});
    setLayout((current) => {
      const next = {
        ...current,
        gap: DEFAULT_GAP,
        pinned: true,
        colSpan: {
          ...current.colSpan,
          ...result.colSpans,
        },
        anchor: anchors,
      };
      persistDashboardLayout(next);
      return next;
    });
  };

  const commitDraftBoundary = (
    leftId: DashboardTileId,
    leftSpan: ColSpan,
    rightId: DashboardTileId,
    rightSpan: ColSpan,
    anchors: Partial<Record<DashboardTileId, TileAnchor>>,
  ) => {
    setPreviewColSpans({});
    setPreviewAnchors({});
    setLayout((current) => {
      const next = {
        ...current,
        gap: DEFAULT_GAP,
        pinned: true,
        anchor: anchors,
        colSpan: {
          ...current.colSpan,
          [leftId]: leftSpan,
          [rightId]: rightSpan,
        },
      };
      persistDashboardLayout(next);
      return next;
    });
  };

  const commitDraftRowBoundary = (
    topId: DashboardTileId,
    topSpan: RowSpan,
    bottomId: DashboardTileId,
    bottomSpan: RowSpan,
    anchors: Partial<Record<DashboardTileId, TileAnchor>>,
  ) => {
    setPreviewRowSpans({});
    setPreviewAnchors({});
    setLayout((current) => {
      const next = {
        ...current,
        gap: DEFAULT_GAP,
        pinned: true,
        anchor: anchors,
        rowSpan: {
          ...current.rowSpan,
          [topId]: topSpan,
          [bottomId]: bottomSpan,
        },
      };
      persistDashboardLayout(next);
      return next;
    });
  };

  const revertDraftSpan = (id: DashboardTileId) => {
    setPreviewColSpans((current) => {
      if (!(id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const revertDraftRowSpan = (id: DashboardTileId) => {
    setPreviewRowSpans((current) => {
      if (!(id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  return {
    layout,
    isDesktop,
    commitTileSwap,
    commitTilePlace,
    resolveSpan,
    resolveRowSpan,
    setDraftSpan,
    setDraftRowSpan,
    setDraftBoundary,
    setDraftColPush,
    setDraftRowBoundary,
    setDraftRowBand,
    clearDraftSpans,
    commitDraftSpan,
    commitDraftRowSpan,
    commitDraftBoundary,
    commitDraftColPush,
    commitDraftRowBoundary,
    commitDraftRowBand,
    revertDraftSpan,
    revertDraftRowSpan,
    resetLayout,
    previewAnchors,
  };
};

export { DEFAULT_GAP };
