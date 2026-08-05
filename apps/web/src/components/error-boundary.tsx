import type { ReactNode } from "react";
import { Component } from "react";
import { reportClientError } from "@/lib/report-client-error";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    reportClientError({
      kind: "react-boundary",
      message: error.message,
      error,
      stack: error.stack ?? null,
      componentStack: info.componentStack ?? null,
    });
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <main className="min-h-screen bg-background px-4 py-8">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
            <h1 className="font-heading text-2xl font-medium tracking-tight">Pryladova</h1>
            <p className="text-destructive">Something went wrong loading the panel.</p>
            <p className="text-caption text-muted-foreground">{this.state.error.message}</p>
            <button
              type="button"
              className="w-fit rounded-lg px-3 py-2 text-caption ring-1 ring-border/60 transition-colors hover:bg-muted"
              onClick={() => {
                window.location.reload();
              }}
            >
              Reload
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
