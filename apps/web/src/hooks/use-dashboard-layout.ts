import { useCallback, useEffect, useState } from "react";
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

const DESKTOP_MEDIA = "(min-width: 768px)";

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
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_MEDIA).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_MEDIA);
    const sync = () => {
      setIsDesktop(media.matches);
    };
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
    };
  }, []);

  const holdAnchors = useCallback((anchors: Partial<Record<DashboardTileId, TileAnchor>>) => {
    setPreviewAnchors((current) => (Object.keys(current).length > 0 ? current : anchors));
  }, []);

  const setDraftRowBand = useCallback(
    (
      overrides: Partial<Record<DashboardTileId, RowSpan>>,
      anchors: Partial<Record<DashboardTileId, TileAnchor>>,
    ) => {
      holdAnchors(anchors);
      setPreviewRowSpans((current) => ({ ...current, ...overrides }));
    },
    [holdAnchors],
  );

  const commitDraftRowBand = useCallback(
    (
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
    },
    [],
  );

  const resetLayout = useCallback(() => {
    setPreviewColSpans({});
    setPreviewRowSpans({});
    setPreviewAnchors({});
    const next = createDefaultDashboardLayout();
    setLayout(next);
    persistDashboardLayout(next);
  }, []);

  const commitTileSwap = useCallback((order: DashboardTileId[]) => {
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
  }, []);

  const commitTilePlace = useCallback((anchor: Partial<Record<DashboardTileId, TileAnchor>>) => {
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
  }, []);

  const resolveSpan = useCallback(
    (id: DashboardTileId, ctx: ResolveEffectiveSpanContext): ColSpan => {
      const preview = previewColSpans[id];
      if (preview && ctx.isDesktop) {
        return preview;
      }
      return resolveEffectiveSpan(id, resolveSavedSpan(layout, id), ctx);
    },
    [layout, previewColSpans],
  );

  const resolveRowSpan = useCallback(
    (id: DashboardTileId): RowSpan => {
      const preview = previewRowSpans[id];
      if (preview) {
        return preview;
      }
      return resolveEffectiveRowSpan(id, resolveSavedRowSpan(layout, id));
    },
    [layout, previewRowSpans],
  );

  const setDraftSpan = useCallback(
    (id: DashboardTileId, span: ColSpan, anchors: Partial<Record<DashboardTileId, TileAnchor>>) => {
      holdAnchors(anchors);
      setPreviewColSpans((current) => ({ ...current, [id]: span }));
    },
    [holdAnchors],
  );

  const setDraftRowSpan = useCallback(
    (id: DashboardTileId, span: RowSpan, anchors: Partial<Record<DashboardTileId, TileAnchor>>) => {
      holdAnchors(anchors);
      setPreviewRowSpans((current) => ({ ...current, [id]: span }));
    },
    [holdAnchors],
  );

  const setDraftBoundary = useCallback(
    (
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
    },
    [holdAnchors],
  );

  const setDraftColPush = useCallback(
    (result: ColGrowPushResult, anchors: Partial<Record<DashboardTileId, TileAnchor>>) => {
      holdAnchors(anchors);
      setPreviewColSpans((current) => ({ ...current, ...result.colSpans }));
    },
    [holdAnchors],
  );

  const setDraftRowBoundary = useCallback(
    (
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
    },
    [holdAnchors],
  );

  const clearDraftSpans = useCallback(() => {
    setPreviewColSpans({});
    setPreviewRowSpans({});
    setPreviewAnchors({});
  }, []);

  const commitDraftSpan = useCallback(
    (id: DashboardTileId, span: ColSpan, anchors: Partial<Record<DashboardTileId, TileAnchor>>) => {
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
    },
    [],
  );

  const commitDraftRowSpan = useCallback(
    (id: DashboardTileId, span: RowSpan, anchors: Partial<Record<DashboardTileId, TileAnchor>>) => {
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
    },
    [],
  );

  const commitDraftColPush = useCallback(
    (result: ColGrowPushResult, anchors: Partial<Record<DashboardTileId, TileAnchor>>) => {
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
    },
    [],
  );

  const commitDraftBoundary = useCallback(
    (
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
    },
    [],
  );

  const commitDraftRowBoundary = useCallback(
    (
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
    },
    [],
  );

  const revertDraftSpan = useCallback((id: DashboardTileId) => {
    setPreviewColSpans((current) => {
      if (!(id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const revertDraftRowSpan = useCallback((id: DashboardTileId) => {
    setPreviewRowSpans((current) => {
      if (!(id in current)) {
        return current;
      }
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

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
