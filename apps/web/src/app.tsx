import { pickRandomSpinnerVerb } from "@pryladova/shared";
import { useMemo } from "react";
import { BentoGrid, PageHeader, Shell, ThemeToggle } from "@/components/layout/shell";
import { MachineTile } from "@/components/tiles/machine-tile";
import { MediaTile } from "@/components/tiles/media-tile";
import { WindowTile } from "@/components/tiles/window-tile";
import { Card, CardContent } from "@/components/ui/card";
import { WeatherHeader } from "@/components/weather-header";
import { useDashboard } from "@/hooks/use-dashboard";
import { cn } from "@/lib/utils";

const AgentHint = ({ className }: { className?: string }) => (
  <p className={cn("text-caption text-destructive", className)}>Check that the agent is running.</p>
);

export const App = () => {
  const {
    panel,
    classificationEnabled,
    showAgentHint,
    theme,
    weather,
    weatherLocation,
    handleClassificationToggle,
    handleThemeChange,
    handleWeatherLocationChange,
    handleWeatherRefresh,
  } = useDashboard();

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
  const showMediaTile = telemetry.host?.media !== null;

  return (
    <Shell>
      <PageHeader action={headerAction} stale={showAgentHint} />
      <BentoGrid stale={showAgentHint}>
        <WindowTile
          telemetry={telemetry}
          classificationEnabled={classificationEnabled}
          onClassificationChange={handleClassificationToggle}
        />
        <div
          className={`grid grid-cols-1 items-start gap-4 ${showMediaTile ? "md:grid-cols-2" : ""}`}
        >
          <MachineTile host={telemetry.host} />
          {showMediaTile ? <MediaTile host={telemetry.host} /> : null}
        </div>
      </BentoGrid>
    </Shell>
  );
};
