import { Moon, RotateCcw, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { headerIconButtonClassName } from "@/lib/header-chrome";
import { formatReleaseShort, readAppRelease } from "@/lib/release";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const ReleaseTag = () => {
  const release = readAppRelease();
  const short = formatReleaseShort(release);

  return (
    <p
      className="pb-6 text-center font-sans text-micro text-muted-foreground/50 tabular-nums"
      title={`Web build ${release}`}
    >
      {short}
    </p>
  );
};

export const Shell = ({
  children,
  centered = false,
}: {
  children: ReactNode;
  centered?: boolean;
}) => (
  <main className="flex min-h-screen flex-col bg-background">
    <div
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4",
        centered ? "items-center justify-center py-8" : "py-8",
      )}
    >
      {children}
    </div>
    <ReleaseTag />
  </main>
);

const PANEL_SUBTITLES = {
  live: "Live desktop presence",
  connecting: "Connecting…",
  "api-unavailable": "Cannot reach the API. Check that the server is running.",
  "agent-unavailable": "Not receiving updates. Check that the agent is running.",
} as const;

export const PageHeader = ({
  action,
  subtitle = "live",
}: {
  action?: ReactNode;
  subtitle?: keyof typeof PANEL_SUBTITLES;
}) => (
  <header className="flex items-center justify-between gap-4">
    <div>
      <h1 className="font-heading text-2xl font-medium tracking-tight">Pryladova</h1>
      <p
        className={cn(
          "text-caption",
          subtitle === "live" || subtitle === "connecting"
            ? "text-muted-foreground"
            : "text-destructive",
        )}
      >
        {PANEL_SUBTITLES[subtitle]}
      </p>
    </div>
    {action}
  </header>
);

export const ThemeToggle = ({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
}) => {
  const nextTheme: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        onChange(nextTheme);
      }}
      className={headerIconButtonClassName}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
};

export const LayoutResetButton = ({ onReset }: { onReset: () => void }) => (
  <button
    type="button"
    onClick={onReset}
    className={headerIconButtonClassName}
    aria-label="Reset dashboard layout"
    title="Reset dashboard layout"
    data-testid="dashboard-layout-reset"
  >
    <RotateCcw className="size-4" aria-hidden="true" />
  </button>
);
