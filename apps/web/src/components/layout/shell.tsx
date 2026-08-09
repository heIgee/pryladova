import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { formatReleaseShort, readAppRelease } from "@/lib/release";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const headerChipClassName =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 font-sans text-micro tabular-nums text-muted-foreground ring-1 ring-border/60 transition-colors hover:bg-muted hover:text-foreground";

export const headerIconButtonClassName =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg font-sans text-muted-foreground ring-1 ring-border/60 transition-colors hover:bg-muted hover:text-foreground";

export const ReleaseTag = () => {
  const release = readAppRelease();
  const short = formatReleaseShort(release);

  return (
    <p
      className="pb-6 text-center font-sans text-micro tabular-nums text-muted-foreground/50"
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

export const PageHeader = ({ action, stale }: { action?: ReactNode; stale?: boolean }) => (
  <header className="flex items-center justify-between gap-4">
    <div>
      <h1 className="font-heading text-2xl font-medium tracking-tight">Pryladova</h1>
      <p className={cn("text-caption", stale ? "text-destructive" : "text-muted-foreground")}>
        {stale
          ? "Not receiving updates. Check that the agent is running."
          : "Live desktop presence"}
      </p>
    </div>
    {action}
  </header>
);

export const agentStaleClassName = (stale: boolean) =>
  cn("transition-[opacity,filter] duration-300", stale && "opacity-45 grayscale");

export const BentoGrid = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-5">{children}</div>
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
