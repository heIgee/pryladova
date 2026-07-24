import {
  type HostPayload,
  type PlaybackStatus,
  pickSpinnerVerb,
  SETTINGS_ROUTE,
  settingsSchema,
  TELEMETRY_ROUTE,
  type TelemetryState,
  telemetryStateSchema,
} from "@pryladova/shared";
import { Cpu, MemoryStick, Monitor, Moon, Music2, Server, Sun, Timer } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { persistTheme, resolveTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 2000;
const CLASSIFICATION_ENABLED_KEY = "pryladova.classificationEnabled";
/** Below this, treat the machine as actively in use — avoid flashing "0s". */
const IDLE_ACTIVE_THRESHOLD_MS = 30_000;

const formatDuration = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rem = seconds % 60;
    return rem === 0 ? `${minutes}m` : `${minutes}m ${rem}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
};

const formatPresence = (idleMs: number): string => {
  if (idleMs < IDLE_ACTIVE_THRESHOLD_MS) {
    return "Active";
  }
  return `Away ${formatDuration(idleMs / 1000)}`;
};

const formatPercent = (value: number): string => `${Math.round(value)}%`;

const formatPlaybackStatus = (status: PlaybackStatus): string => {
  if (status === "playing") return "Playing";
  if (status === "paused") return "Paused";
  if (status === "stopped") return "Stopped";
  return "Unknown";
};

const normalizeLabel = (value: string): string => value.trim().toLowerCase();

const titlesMatch = (left: string, right: string): boolean =>
  normalizeLabel(left) === normalizeLabel(right);

const classificationSeed = (telemetry: TelemetryState): string =>
  `${telemetry.appName}|${telemetry.windowTitle}|${telemetry.receivedAt}`;

type PanelState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; telemetry: TelemetryState }
  | { status: "error"; message: string };

const readStoredClassificationEnabled = (): boolean => {
  const stored = localStorage.getItem(CLASSIFICATION_ENABLED_KEY);
  if (stored === null) {
    return true;
  }
  return stored === "true";
};

const syncSettings = async (classificationEnabled: boolean): Promise<void> => {
  const response = await fetch(SETTINGS_ROUTE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ classificationEnabled }),
  });
  if (!response.ok) {
    throw new Error(`Settings error (${response.status})`);
  }
  const json: unknown = await response.json();
  settingsSchema.parse(json);
};

const fetchTelemetry = async (): Promise<PanelState> => {
  const response = await fetch(TELEMETRY_ROUTE);

  if (response.status === 404) {
    return { status: "empty" };
  }

  if (!response.ok) {
    return { status: "error", message: `API error (${response.status})` };
  }

  const json: unknown = await response.json();
  const telemetry = telemetryStateSchema.parse(json);
  return { status: "ready", telemetry };
};

const MutedChip = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex h-5 items-center rounded-md bg-muted px-2 text-micro font-medium leading-none text-muted-foreground">
    {children}
  </span>
);

const StatBar = ({
  icon,
  label,
  percent,
  value,
}: {
  icon: ReactNode;
  label: string;
  percent: number;
  value: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-stat font-medium tabular-nums">{value}</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-chart-2 transition-[width] duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  </div>
);

const ThemeToggle = ({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) => {
  const nextTheme: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        onChange(nextTheme);
      }}
      className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground ring-1 ring-border/60 transition-colors hover:bg-muted hover:text-foreground"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
};

const Shell = ({ children }: { children: ReactNode }) => (
  <main className="min-h-screen bg-background">
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-8">{children}</div>
  </main>
);

const PageHeader = ({ action }: { action?: ReactNode }) => (
  <header className="flex items-center justify-between gap-4">
    <div>
      <h1 className="font-heading text-2xl font-medium tracking-tight">Pryladova</h1>
      <p className="text-caption text-muted-foreground">Live desktop presence</p>
    </div>
    {action}
  </header>
);

const WindowTile = ({
  telemetry,
  classificationEnabled,
  onClassificationChange,
}: {
  telemetry: TelemetryState;
  classificationEnabled: boolean;
  onClassificationChange: (enabled: boolean) => void;
}) => {
  const classification = telemetry.classification;
  const status = telemetry.classificationStatus;
  const displayName = classification?.displayAppName ?? telemetry.appName;

  const showWindowTitle =
    !titlesMatch(telemetry.windowTitle, displayName) &&
    !titlesMatch(telemetry.windowTitle, telemetry.appName);

  const showCategory = classificationEnabled && status === "ready" && classification !== null;
  const showWorkChip =
    classificationEnabled &&
    status === "ready" &&
    classification !== null &&
    classification.workRelated !== "maybe";
  const isClassifying = classificationEnabled && status === "pending";
  const showClassificationChips =
    showCategory ||
    showWorkChip ||
    isClassifying ||
    !classificationEnabled ||
    status === "disabled";

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Monitor className="size-3.5 text-muted-foreground" />
          Window
        </CardTitle>
        {showClassificationChips ? (
          <CardAction>
            <div className="flex max-w-72 flex-wrap justify-end gap-1.5">
              {showCategory ? <Badge>{classification.category}</Badge> : null}
              {showWorkChip ? (
                <Badge>{classification.workRelated === "yes" ? "Work" : "Personal"}</Badge>
              ) : null}
              {isClassifying ? (
                <Badge variant="secondary">{pickSpinnerVerb(classificationSeed(telemetry))}…</Badge>
              ) : null}
              {!classificationEnabled || status === "disabled" ? (
                <MutedChip>Classification off</MutedChip>
              ) : null}
            </div>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <h2 className="truncate text-display font-medium">{displayName}</h2>
        {showWindowTitle ? (
          <p className="mt-2 line-clamp-3 text-body leading-relaxed text-muted-foreground">
            {telemetry.windowTitle}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="border-t py-2.5">
        <label
          htmlFor="classify-toggle"
          className="flex w-fit cursor-pointer items-center gap-2 text-caption text-muted-foreground"
        >
          Classify with AI
          <Switch
            id="classify-toggle"
            size="sm"
            checked={classificationEnabled}
            onCheckedChange={onClassificationChange}
          />
        </label>
      </CardFooter>
    </Card>
  );
};

const MachineTile = ({ host, className }: { host: HostPayload | null; className?: string }) => (
  <Card size="sm" className={className}>
    <CardHeader className="border-b">
      <CardTitle className="flex items-center gap-2 text-sm">
        <Server className="size-3.5 text-muted-foreground" />
        Machine
      </CardTitle>
      <CardAction>
        <Badge
          variant={
            host && host.idleMs < IDLE_ACTIVE_THRESHOLD_MS
              ? "default"
              : host
                ? "secondary"
                : "outline"
          }
        >
          {host ? formatPresence(host.idleMs) : "Waiting"}
        </Badge>
      </CardAction>
    </CardHeader>
    <CardContent className="grid gap-4">
      {host ? (
        <>
          <StatBar
            icon={<Cpu className="size-3.5" />}
            label="CPU"
            percent={host.cpuPercent}
            value={formatPercent(host.cpuPercent)}
          />
          <StatBar
            icon={<MemoryStick className="size-3.5" />}
            label="RAM"
            percent={host.ramPercent}
            value={formatPercent(host.ramPercent)}
          />
          <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <Timer className="size-3.5" />
            <span>Uptime</span>
            <span className="ml-auto font-medium text-foreground tabular-nums">
              {formatDuration(host.uptimeSec)}
            </span>
          </div>
        </>
      ) : (
        <p className="text-caption text-muted-foreground">Waiting for host metrics…</p>
      )}
    </CardContent>
  </Card>
);

const MediaTile = ({ host, className }: { host: HostPayload | null; className?: string }) => {
  const media = host?.media ?? null;

  return (
    <Card size="sm" className={cn("h-fit self-start", className)}>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Music2 className="size-3.5 text-muted-foreground" />
          Media
        </CardTitle>
        <CardAction>
          <Badge variant={media?.playbackStatus === "playing" ? "default" : "outline"}>
            {media ? formatPlaybackStatus(media.playbackStatus) : "Idle"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-1">
        {media ? (
          <>
            <p className="line-clamp-2 text-body leading-snug font-medium">{media.title}</p>
            <p className="truncate text-caption text-muted-foreground">
              {media.artist ?? "Unknown artist"}
            </p>
          </>
        ) : (
          <p className="text-caption text-muted-foreground">Nothing playing</p>
        )}
      </CardContent>
    </Card>
  );
};

export const App = () => {
  const [panel, setPanel] = useState<PanelState>({ status: "loading" });
  const [classificationEnabled, setClassificationEnabled] = useState(true);
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());

  useEffect(() => {
    const preferred = readStoredClassificationEnabled();
    setClassificationEnabled(preferred);
    void syncSettings(preferred).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[web] ${message}`);
    });
  }, []);

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      try {
        const next = await fetchTelemetry();
        if (active) {
          setPanel(next);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (active) {
          setPanel({ status: "error", message });
        }
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const handleClassificationToggle = (enabled: boolean): void => {
    setClassificationEnabled(enabled);
    localStorage.setItem(CLASSIFICATION_ENABLED_KEY, String(enabled));
    void syncSettings(enabled).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[web] ${message}`);
    });
  };

  const handleThemeChange = (next: Theme): void => {
    setTheme(next);
    persistTheme(next);
  };

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
          <CardContent className="text-destructive">API unreachable: {panel.message}</CardContent>
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
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const { telemetry } = panel;
  const showMediaTile = telemetry.host?.media !== null;

  return (
    <Shell>
      <PageHeader action={themeToggle} />
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
    </Shell>
  );
};
