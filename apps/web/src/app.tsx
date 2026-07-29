import { pickSpinnerVerb } from "@pryladova/shared";
import { BentoGrid, PageHeader, Shell, ThemeToggle } from "@/components/layout/shell";
import { MachineTile } from "@/components/tiles/machine-tile";
import { MediaTile } from "@/components/tiles/media-tile";
import { WindowTile } from "@/components/tiles/window-tile";
import { Card, CardContent } from "@/components/ui/card";
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
    handleClassificationToggle,
    handleThemeChange,
  } = useDashboard();

  const themeToggle = <ThemeToggle theme={theme} onChange={handleThemeChange} />;

  if (panel.status === "loading") {
    return (
      <Shell>
        <PageHeader action={themeToggle} />
        <p className="text-muted-foreground">{pickSpinnerVerb("loading")}…</p>
      </Shell>
    );
  }

  if (panel.status === "error") {
    return (
      <Shell>
        <PageHeader action={themeToggle} />
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
        <PageHeader action={themeToggle} />
        <Card>
          <CardContent className="text-muted-foreground">
            {pickSpinnerVerb("waiting-for-telemetry")}…
            {showAgentHint ? <AgentHint className="mt-2" /> : null}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const { telemetry } = panel;
  const showMediaTile = telemetry.host?.media !== null;

  return (
    <Shell>
      <PageHeader action={themeToggle} stale={showAgentHint} />
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
