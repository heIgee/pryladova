import { captureClientError, isWebSentryEnabled } from "@/lib/sentry";

export type ClientErrorReport = {
  kind: "react-boundary" | "window-error" | "unhandled-rejection";
  message: string;
  error?: Error;
  stack?: string | null;
  componentStack?: string | null;
};

export const reportClientError = (report: ClientErrorReport): void => {
  console.error("[web:client-error]", report);
  captureClientError(report);
};

export const installClientErrorHandlers = (): void => {
  if (isWebSentryEnabled()) {
    return;
  }

  window.addEventListener("error", (event) => {
    reportClientError({
      kind: "window-error",
      message: event.message,
      error: event.error instanceof Error ? event.error : undefined,
      stack: event.error instanceof Error ? (event.error.stack ?? null) : null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    reportClientError({
      kind: "unhandled-rejection",
      message,
      error: reason instanceof Error ? reason : undefined,
      stack: reason instanceof Error ? (reason.stack ?? null) : null,
    });
  });
};
