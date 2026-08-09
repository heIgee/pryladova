import { pickRandomSpinnerVerb } from "@pryladova/shared";
import { useMemo } from "react";
import { BentoGrid, PageHeader, Shell, ThemeToggle } from "@/components/layout/shell";
import { LoginForm } from "@/components/login-form";
import { HistoryTile } from "@/components/tiles/history-tile";
import { MachineTile } from "@/components/tiles/machine-tile";
import { MediaTile } from "@/components/tiles/media-tile";
import { WindowTile } from "@/components/tiles/window-tile";
import { Card, CardContent } from "@/components/ui/card";
import { WeatherHeader } from "@/components/weather-header";
import { useAuth } from "@/hooks/use-auth";
import { useDashboard } from "@/hooks/use-dashboard";
import { useHistory } from "@/hooks/use-history";
import { resolveHistoryLiveCapMs } from "@/lib/history-live";
import { getAgentLastSeenMs, shouldShowMediaTile } from "@/lib/panel";
import { cn } from "@/lib/utils";

const AgentHint = ({ className }: { className?: string }) => (
  <p className={cn("text-caption text-destructive", className)}>Check that the agent is running.</p>
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
    handleClassificationToggle,
    handleThemeChange,
    handleWeatherLocationChange,
    handleWeatherRefresh,
  } = useDashboard();
  const agentLastSeenMs = panel.status === "ready" ? getAgentLastSeenMs(panel) : null;
  const host = panel.status === "ready" ? panel.telemetry.host : null;
  const historyLiveCapMs = resolveHistoryLiveCapMs(host, agentLastSeenMs, showAgentHint);
  const { history, refreshHistory, refreshing, hasLoaded } = useHistory(
    panel.status === "ready",
    panel.status === "ready" ? panel.telemetry : null,
    historyLiveCapMs,
  );

  const loadingVerb = useMemo(() => pickRandomSpinnerVerb(), []);
  const waitingVerb = useMemo(() => pickRandomSpinnerVerb(), []);

  const headerAction = (
    <div className="flex items-center gap-2">
      <WeatherHeader
        weather={weather}
        locationLabel={weatherLocation?.label ?? null}
        onLocationChange={handleWeatherLocationChange}
        onRefresh={handleWeatherRefresh}
      />
      <ThemeToggle theme={theme} onChange={handleThemeChange} />
    </div>
  );

  if (panel.status === "loading") {
    return (
      <Shell>
        <PageHeader action={headerAction} />
        <p className="text-muted-foreground">{loadingVerb}…</p>
      </Shell>
    );
  }

  if (panel.status === "error") {
    return (
      <Shell>
        <PageHeader action={headerAction} />
        <Card>
          <CardContent className="text-destructive">
            API unreachable: {panel.message}
            {showAgentHint ? <AgentHint className="mt-2" /> : null}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (panel.status === "empty") {
    return (
      <Shell>
        <PageHeader action={headerAction} />
        <Card>
          <CardContent className="text-muted-foreground">
            {waitingVerb}…{showAgentHint ? <AgentHint className="mt-2" /> : null}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const { telemetry } = panel;
  const showMediaTile = shouldShowMediaTile(telemetry.host);

  return (
    <Shell>
      <PageHeader action={headerAction} stale={showAgentHint} />
      <BentoGrid stale={showAgentHint}>
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
          <MachineTile host={telemetry.host} />
          {showMediaTile ? <MediaTile host={telemetry.host} /> : null}
        </div>
        <HistoryTile
          history={history}
          activeAppName={telemetry.appName}
          refreshing={refreshing}
          hasLoaded={hasLoaded}
          onRefresh={() => {
            void refreshHistory();
          }}
        />
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
