import { DashboardGrid } from "@/components/layout/dashboard-grid";
import { DashboardTileShell } from "@/components/layout/dashboard-tile-shell";
import { LayoutResetButton, PageHeader, Shell, ThemeToggle } from "@/components/layout/shell";
import { LoginForm } from "@/components/login-form";
import { WeatherHeader } from "@/components/weather-header";
import { useAuth } from "@/hooks/use-auth";
import { useDashboard } from "@/hooks/use-dashboard";
import { useDashboardLayout } from "@/hooks/use-dashboard-layout";
import { useHistory } from "@/hooks/use-history";
import {
  anchorsForFreeDrop,
  anchorsFromPlacements,
  buildTilePlacements,
  canApplyRowSpanOverrides,
  canStepTileRowSpan,
  type DashboardTileId,
  filterVisibleTileOrder,
  findBottomGapNeighbor,
  findLeftGapNeighbor,
  findRightGapNeighbor,
  findTopGapNeighbor,
  listRowBands,
  type RowBand,
  resolveEffectiveRowSpan,
  resolveEffectiveSpan,
  resolveResizeHandleEdges,
  resolveSavedRowSpan,
  resolveSavedSpan,
  stepRowBandSpans,
  swapTileOrder,
  type TileAnchor,
  tryColGrowWithPush,
} from "@/lib/dashboard-layout";
import { resolveHistoryLiveCapMs } from "@/lib/history-live";
import { getAgentLastSeenMs } from "@/lib/panel";
import { isDashboardTileVisible, renderDashboardTile } from "@/lib/render-dashboard-tile";

const Dashboard = () => {
  const {
    panel,
    classificationEnabled,
    settingsError,
    settingsSyncing,
    settingsReady,
    panelSubtitle,
    showAgentHint,
    agentLive,
    streamConnected,
    theme,
    weather,
    weatherLocation,
    githubStatus,
    steamStatus,
    googleCalendarStatus,
    googleTasksStatus,
    handleClassificationToggle,
    handleThemeChange,
    handleWeatherLocationChange,
    handleWeatherRefresh,
  } = useDashboard();
  const {
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
    clearDraftSpans,
    commitDraftSpan,
    commitDraftRowSpan,
    commitDraftBoundary,
    commitDraftColPush,
    commitDraftRowBoundary,
    setDraftRowBand,
    commitDraftRowBand,
    resetLayout,
    previewAnchors,
  } = useDashboardLayout();

  const readyPanel = panel.status === "ready" ? panel : null;
  const liveTelemetry = agentLive && readyPanel ? readyPanel.telemetry : null;
  const host = readyPanel?.telemetry.host ?? null;
  const agentLastSeenMs = readyPanel ? getAgentLastSeenMs(readyPanel) : null;
  const historyLiveCapMs = resolveHistoryLiveCapMs(
    host,
    agentLastSeenMs,
    showAgentHint || panelSubtitle === "api-unavailable",
  );
  const {
    history,
    dayLabel: historyDayLabel,
    dayRange: historyDayRange,
    isToday: historyIsToday,
    canStepBack: historyCanStepBack,
    canStepForward: historyCanStepForward,
    stepDay: stepHistoryDay,
    refreshHistory,
    refreshing,
    hasLoaded,
  } = useHistory(true, liveTelemetry, historyLiveCapMs);

  const tileContext = {
    panel,
    agentLive,
    streamConnected,
    showAgentHint,
    readyTelemetry: liveTelemetry,
    host,
    classificationEnabled,
    settingsError,
    settingsSyncing,
    settingsReady,
    onClassificationChange: handleClassificationToggle,
    history,
    historyDayLabel,
    historyDayRange,
    historyActiveAppName: historyIsToday ? (liveTelemetry?.appName ?? null) : null,
    historyRefreshing: refreshing,
    historyHasLoaded: hasLoaded,
    historyCanStepBack,
    historyCanStepForward,
    onHistoryStepDay: stepHistoryDay,
    onHistoryRefresh: () => {
      void refreshHistory();
    },
    githubStatus,
    steamStatus,
    googleCalendarStatus,
    googleTasksStatus,
  };

  const visibleTileIds = filterVisibleTileOrder(layout.order, (id) => isDashboardTileVisible(id));

  const spanContext = { isDesktop, mediaVisible: true };

  const resolveTileColSpan = (id: DashboardTileId) => resolveSpan(id, spanContext);
  const resolveTileRowSpan = (id: DashboardTileId) => resolveRowSpan(id);

  const resolveLayoutColSpan = (tileId: DashboardTileId) =>
    resolveEffectiveSpan(tileId, resolveSavedSpan(layout, tileId), spanContext);

  const resolveLayoutRowSpan = (tileId: DashboardTileId) =>
    resolveEffectiveRowSpan(tileId, resolveSavedRowSpan(layout, tileId));

  const layoutAnchors =
    Object.keys(previewAnchors).length > 0 ? previewAnchors : layout.pinned ? layout.anchor : {};

  const tilePlacements = buildTilePlacements(
    visibleTileIds,
    resolveTileColSpan,
    resolveTileRowSpan,
    layoutAnchors,
  );

  const rowBands = listRowBands(tilePlacements);
  const cellAnchors = anchorsFromPlacements(tilePlacements);

  const stepRowBand = (band: RowBand, direction: 1 | -1) => {
    const overrides = stepRowBandSpans(band, direction, resolveTileRowSpan);
    if (!overrides) {
      return null;
    }
    if (
      !canApplyRowSpanOverrides(
        visibleTileIds,
        resolveTileColSpan,
        resolveTileRowSpan,
        overrides,
        layoutAnchors,
      )
    ) {
      return null;
    }
    return overrides;
  };

  const canStepRowSpanForTile = (id: DashboardTileId, direction: 1 | -1) =>
    canStepTileRowSpan(
      id,
      direction,
      visibleTileIds,
      resolveTileColSpan,
      resolveTileRowSpan,
      layoutAnchors,
    );

  const handleSwapTiles = (activeId: DashboardTileId, overId: DashboardTileId) => {
    const nextOrder = swapTileOrder(layout.order, activeId, overId);
    if (nextOrder) {
      commitTileSwap(nextOrder);
    }
  };

  const handlePlaceTile = (activeId: DashboardTileId, anchor: TileAnchor) => {
    const nextAnchors = anchorsForFreeDrop(
      visibleTileIds,
      resolveTileColSpan,
      resolveTileRowSpan,
      tilePlacements,
      activeId,
      anchor,
    );
    if (nextAnchors) {
      commitTilePlace(nextAnchors);
    }
  };

  const placementFor = (id: DashboardTileId) => {
    const placement = tilePlacements.find((entry) => entry.id === id);
    if (!placement) {
      return { id, startRow: 1, endRow: 1, startCol: 1, endCol: 12 };
    }
    return placement;
  };

  const resizeHandlesFor = (id: DashboardTileId) => {
    const edges = resolveResizeHandleEdges(
      visibleTileIds,
      resolveLayoutColSpan,
      resolveLayoutRowSpan,
      id,
      layoutAnchors,
    );
    if (!isDesktop) {
      return { right: false, left: false, bottom: edges.bottom, top: edges.top };
    }
    return edges;
  };

  const renderTile = (id: DashboardTileId, overlay = false, isDragSource = false) => {
    const leftNeighborId = findLeftGapNeighbor(
      visibleTileIds,
      resolveTileColSpan,
      resolveTileRowSpan,
      id,
      layoutAnchors,
    );
    const rightNeighborId = findRightGapNeighbor(
      visibleTileIds,
      resolveTileColSpan,
      resolveTileRowSpan,
      id,
      layoutAnchors,
    );
    const topNeighborId = findTopGapNeighbor(
      visibleTileIds,
      resolveTileColSpan,
      resolveTileRowSpan,
      id,
      layoutAnchors,
    );
    const bottomNeighborId = findBottomGapNeighbor(
      visibleTileIds,
      resolveTileColSpan,
      resolveTileRowSpan,
      id,
      layoutAnchors,
    );

    return (
      <DashboardTileShell
        key={id}
        id={id}
        isOverlay={overlay}
        isDragSource={isDragSource}
        placement={placementFor(id)}
        effectiveColSpan={resolveTileColSpan(id)}
        effectiveRowSpan={resolveTileRowSpan(id)}
        resizeHandles={resizeHandlesFor(id)}
        leftNeighborId={leftNeighborId}
        rightNeighborId={rightNeighborId}
        topNeighborId={topNeighborId}
        bottomNeighborId={bottomNeighborId}
        leftNeighborColSpan={leftNeighborId ? resolveTileColSpan(leftNeighborId) : undefined}
        rightNeighborColSpan={rightNeighborId ? resolveTileColSpan(rightNeighborId) : undefined}
        topNeighborRowSpan={topNeighborId ? resolveTileRowSpan(topNeighborId) : undefined}
        bottomNeighborRowSpan={bottomNeighborId ? resolveTileRowSpan(bottomNeighborId) : undefined}
        onDraftColSpan={(span) => {
          setDraftSpan(id, span, cellAnchors);
        }}
        onDraftColBoundary={(leftId, leftSpan, rightId, rightSpan) => {
          setDraftBoundary(leftId, leftSpan, rightId, rightSpan, cellAnchors);
        }}
        onCommitColSpan={(span) => {
          commitDraftSpan(id, span, cellAnchors);
        }}
        onCommitColBoundary={(leftId, leftSpan, rightId, rightSpan) => {
          commitDraftBoundary(leftId, leftSpan, rightId, rightSpan, cellAnchors);
        }}
        onTryColGrowPush={() =>
          tryColGrowWithPush(
            visibleTileIds,
            resolveTileColSpan,
            resolveTileRowSpan,
            id,
            layoutAnchors,
          )
        }
        onDraftColPush={(result) => {
          setDraftColPush(result, cellAnchors);
        }}
        onCommitColPush={(result) => {
          commitDraftColPush(result, cellAnchors);
        }}
        onDraftRowSpan={(span) => {
          setDraftRowSpan(id, span, cellAnchors);
        }}
        onDraftRowBoundary={(topId, topSpan, bottomId, bottomSpan) => {
          setDraftRowBoundary(topId, topSpan, bottomId, bottomSpan, cellAnchors);
        }}
        onCommitRowSpan={(span) => {
          commitDraftRowSpan(id, span, cellAnchors);
        }}
        onCommitRowBoundary={(topId, topSpan, bottomId, bottomSpan) => {
          commitDraftRowBoundary(topId, topSpan, bottomId, bottomSpan, cellAnchors);
        }}
        onRevertSpans={clearDraftSpans}
        canStepBottomRowSpan={(direction) => canStepRowSpanForTile(id, direction)}
        canStepTopRowSpan={(direction) => canStepRowSpanForTile(id, direction === 1 ? -1 : 1)}
      >
        {renderDashboardTile(id, tileContext)}
      </DashboardTileShell>
    );
  };

  const headerAction = (
    <div className="flex items-center gap-2">
      <WeatherHeader
        weather={weather}
        locationLabel={weatherLocation?.label ?? null}
        usingBrowserLocation={weatherLocation?.source === "browser"}
        onLocationChange={handleWeatherLocationChange}
        onRefresh={handleWeatherRefresh}
      />
      <ThemeToggle theme={theme} onChange={handleThemeChange} />
      <LayoutResetButton onReset={resetLayout} />
    </div>
  );

  return (
    <Shell>
      <PageHeader action={headerAction} subtitle={panelSubtitle} />
      <DashboardGrid
        visibleTileIds={visibleTileIds}
        placements={tilePlacements}
        resolveColSpan={resolveTileColSpan}
        resolveRowSpan={resolveTileRowSpan}
        renderTile={renderTile}
        onSwapTiles={handleSwapTiles}
        onPlaceTile={handlePlaceTile}
        rowBandResize={
          isDesktop
            ? {
                bands: rowBands,
                stepBand: stepRowBand,
                onDraftBand: (overrides) => {
                  setDraftRowBand(overrides, cellAnchors);
                },
                onCommitBand: (overrides) => {
                  commitDraftRowBand(overrides, cellAnchors);
                },
                onRevert: clearDraftSpans,
              }
            : undefined
        }
      />
    </Shell>
  );
};

export const App = () => {
  const { status, error, login } = useAuth();

  if (status === "loading") {
    return (
      <Shell>
        <PageHeader />
        <p className="text-muted-foreground">Loading…</p>
      </Shell>
    );
  }

  if (status === "anonymous") {
    return <LoginForm error={error} onLogin={login} />;
  }

  return <Dashboard />;
};
