import type { HostPayload, TelemetryState } from "@pryladova/shared";
import { Monitor } from "lucide-react";
import type { ReactNode } from "react";
import { BentoTileHeader } from "@/components/tiles/bento-tile-header";
import {
  bentoTileBodyClassName,
  bentoTileCardClassName,
  bentoTileLucideIconClassName,
} from "@/components/tiles/bento-tile-header-layout";
import { GithubStatusTile } from "@/components/tiles/github-status-tile";
import { GoogleCalendarTile } from "@/components/tiles/google-calendar-tile";
import { GoogleTasksTile } from "@/components/tiles/google-tasks-tile";
import { HistoryTile } from "@/components/tiles/history-tile";
import { MachineTile } from "@/components/tiles/machine-tile";
import { MediaTile } from "@/components/tiles/media-tile";
import { SteamStatusTile } from "@/components/tiles/steam-status-tile";
import { WindowTile } from "@/components/tiles/window-tile";
import { Card, CardContent } from "@/components/ui/card";
import type { HistoryState } from "@/hooks/use-history";
import type { DashboardTileId } from "@/lib/dashboard-layout";
import type {
  GithubTileStatus,
  GoogleCalendarTileStatus,
  GoogleTasksTileStatus,
  SteamTileStatus,
} from "@/lib/integration-status";
import type { PanelState } from "@/lib/panel";

export type DashboardTileRenderContext = {
  panel: PanelState;
  agentLive: boolean;
  streamConnected: boolean;
  showAgentHint: boolean;
  readyTelemetry: TelemetryState | null;
  host: HostPayload | null;
  classificationEnabled: boolean;
  settingsError: string | null;
  settingsSyncing: boolean;
  settingsReady: boolean;
  onClassificationChange: (enabled: boolean) => void;
  history: HistoryState;
  historyActiveAppName: string | null;
  historyRefreshing: boolean;
  historyHasLoaded: boolean;
  onHistoryRefresh: () => void;
  githubStatus: GithubTileStatus;
  steamStatus: SteamTileStatus;
  googleCalendarStatus: GoogleCalendarTileStatus;
  googleTasksStatus: GoogleTasksTileStatus;
};

const AgentPresencePlaceholder = ({
  panel,
  streamConnected,
  stale = false,
}: {
  panel: PanelState;
  streamConnected: boolean;
  stale?: boolean;
}) => (
  <Card size="sm" className={bentoTileCardClassName} data-testid="window-tile-placeholder">
    <BentoTileHeader
      testId="window-tile-header"
      icon={<Monitor className={bentoTileLucideIconClassName} aria-hidden="true" />}
      title="Window"
    />
    <CardContent className={bentoTileBodyClassName}>
      {!streamConnected ? (
        <p className="text-caption text-destructive">Cannot reach the API</p>
      ) : null}
      {streamConnected && panel.status === "loading" ? (
        <p className="text-caption text-muted-foreground">Connecting…</p>
      ) : null}
      {streamConnected && (stale || panel.status === "empty") ? (
        <p className="text-caption text-muted-foreground">No active window</p>
      ) : null}
      {streamConnected && panel.status === "error" ? (
        <p className="text-caption text-destructive">
          Agent telemetry unavailable: {panel.message}
        </p>
      ) : null}
    </CardContent>
  </Card>
);

export const isDashboardTileVisible = (_id: DashboardTileId): boolean => true;

export const renderDashboardTile = (
  id: DashboardTileId,
  ctx: DashboardTileRenderContext,
): ReactNode => {
  switch (id) {
    case "window":
      if (ctx.agentLive && ctx.readyTelemetry) {
        return (
          <WindowTile
            telemetry={ctx.readyTelemetry}
            classificationEnabled={ctx.classificationEnabled}
            settingsError={ctx.settingsError}
            settingsSyncing={ctx.settingsSyncing}
            settingsReady={ctx.settingsReady}
            onClassificationChange={ctx.onClassificationChange}
          />
        );
      }
      return (
        <AgentPresencePlaceholder
          panel={ctx.panel}
          streamConnected={ctx.streamConnected}
          stale={ctx.panel.status === "ready" && ctx.showAgentHint}
        />
      );
    case "machine":
      return <MachineTile host={ctx.host} />;
    case "media":
      return <MediaTile host={ctx.host} />;
    case "history":
      return (
        <HistoryTile
          history={ctx.history}
          activeAppName={ctx.historyActiveAppName}
          refreshing={ctx.historyRefreshing}
          hasLoaded={ctx.historyHasLoaded}
          onRefresh={ctx.onHistoryRefresh}
        />
      );
    case "github":
      return <GithubStatusTile status={ctx.githubStatus} />;
    case "steam":
      return <SteamStatusTile status={ctx.steamStatus} />;
    case "calendar":
      return <GoogleCalendarTile status={ctx.googleCalendarStatus} />;
    case "tasks":
      return <GoogleTasksTile status={ctx.googleTasksStatus} />;
    default:
      return null;
  }
};
