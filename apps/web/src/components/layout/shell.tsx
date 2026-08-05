import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const headerChipClassName =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 font-sans text-micro tabular-nums text-muted-foreground ring-1 ring-border/60 transition-colors hover:bg-muted hover:text-foreground";

export const headerIconButtonClassName =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg font-sans text-muted-foreground ring-1 ring-border/60 transition-colors hover:bg-muted hover:text-foreground";

export const Shell = ({ children }: { children: ReactNode }) => (
  <main className="min-h-screen bg-background">
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-8">{children}</div>
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

export const BentoGrid = ({ stale, children }: { stale: boolean; children: ReactNode }) => (
  <div
    className={cn(
      "flex flex-col gap-5 transition-[opacity,filter] duration-300",
      stale && "pointer-events-none opacity-45 grayscale",
    )}
  >
    {children}
  </div>
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
