import { Monitor } from "lucide-react";
import { useRef } from "react";
import { BentoGrid, PageHeader, Shell, ThemeToggle } from "@/components/layout/shell";
import { LoginForm } from "@/components/login-form";
import { GithubStatusTile } from "@/components/tiles/github-status-tile";
import { HistoryTile } from "@/components/tiles/history-tile";
import { MachineTile } from "@/components/tiles/machine-tile";
import { MediaTile } from "@/components/tiles/media-tile";
import { SteamStatusTile } from "@/components/tiles/steam-status-tile";
import { WindowTile } from "@/components/tiles/window-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeatherHeader } from "@/components/weather-header";
import { useAuth } from "@/hooks/use-auth";
import { useDashboard } from "@/hooks/use-dashboard";
import { useElementHeight } from "@/hooks/use-element-height";
import { useHistory } from "@/hooks/use-history";
import { resolveHistoryLiveCapMs } from "@/lib/history-live";
import { getAgentLastSeenMs, type PanelState, shouldShowMediaTile } from "@/lib/panel";

const AgentPresencePlaceholder = ({ panel }: { panel: PanelState }) => (
  <Card size="sm" data-testid="window-tile-placeholder">
    <CardHeader className="border-b">
      <CardTitle className="flex items-center gap-2 text-sm">
        <Monitor className="size-3.5 text-muted-foreground" />
        Window
      </CardTitle>
    </CardHeader>
    <CardContent>
      {panel.status === "loading" ? (
        <p className="text-caption text-muted-foreground">Connecting…</p>
      ) : null}
      {panel.status === "empty" ? (
        <p className="text-caption text-muted-foreground">No active window</p>
      ) : null}
      {panel.status === "error" ? (
        <p className="text-caption text-destructive">
          Agent telemetry unavailable: {panel.message}
        </p>
      ) : null}
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const {
    panel,
    classificationEnabled,
    settingsError,
    settingsSyncing,
    settingsReady,
    showAgentHint,
    theme,
    weather,
    weatherLocation,
    githubStatus,
    steamStatus,
    handleClassificationToggle,
    handleThemeChange,
    handleWeatherLocationChange,
    handleWeatherRefresh,
  } = useDashboard();
  const agentReady = panel.status === "ready";
  const telemetry = agentReady ? panel.telemetry : null;
  const host = telemetry?.host ?? null;
  const agentLastSeenMs = agentReady ? getAgentLastSeenMs(panel) : null;
  const historyLiveCapMs = resolveHistoryLiveCapMs(host, agentLastSeenMs, showAgentHint);
  const historyEnabled = agentReady;
  const { history, refreshHistory, refreshing, hasLoaded } = useHistory(
    historyEnabled,
    telemetry,
    historyLiveCapMs,
  );
  const sideColumnRef = useRef<HTMLDivElement>(null);
  const sideColumnHeight = useElementHeight(sideColumnRef, agentReady);

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
    </div>
  );

  const showMediaTile = host != null && shouldShowMediaTile(host);

  return (
    <Shell>
      <PageHeader action={headerAction} stale={showAgentHint} />
      <BentoGrid>
        <div className="flex flex-col gap-5">
          {agentReady && telemetry ? (
            <>
              <WindowTile
                telemetry={telemetry}
                classificationEnabled={classificationEnabled}
                settingsError={settingsError}
                settingsSyncing={settingsSyncing}
                settingsReady={settingsReady}
                onClassificationChange={handleClassificationToggle}
              />
              <div
                className={`grid grid-cols-1 items-stretch gap-4 ${showMediaTile ? "md:grid-cols-2" : ""}`}
              >
                <MachineTile host={host} />
                {showMediaTile ? <MediaTile host={host} /> : null}
              </div>
            </>
          ) : (
            <>
              <AgentPresencePlaceholder panel={panel} />
              <MachineTile host={null} />
            </>
          )}
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div
            className="md:min-h-0 md:min-w-0 md:flex-[3]"
            style={sideColumnHeight === undefined ? undefined : { height: sideColumnHeight }}
          >
            <HistoryTile
              className="h-full min-h-0"
              history={history}
              activeAppName={telemetry?.appName ?? null}
              refreshing={refreshing}
              hasLoaded={hasLoaded}
              onRefresh={() => {
                void refreshHistory();
              }}
            />
          </div>
          <div ref={sideColumnRef} className="grid w-full gap-4 md:w-auto md:min-w-0 md:flex-[2]">
            <GithubStatusTile status={githubStatus} />
            <SteamStatusTile status={steamStatus} />
          </div>
        </div>
      </BentoGrid>
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
