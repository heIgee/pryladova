import * as Sentry from "@sentry/react";
import { readAppRelease } from "@/lib/release";
import type { ClientErrorReport } from "@/lib/report-client-error";

const readDsn = (): string | undefined => import.meta.env.VITE_SENTRY_DSN?.trim() || undefined;

export const isWebSentryEnabled = (): boolean => readDsn() !== undefined;

export const initWebSentry = (): void => {
  const dsn = readDsn();
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: readAppRelease(),
  });
};

export const captureClientError = (report: ClientErrorReport): void => {
  if (!isWebSentryEnabled()) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag("kind", report.kind);
    if (report.componentStack) {
      scope.setExtra("componentStack", report.componentStack);
    }

    if (report.error) {
      Sentry.captureException(report.error);
      return;
    }

    const fallback = new Error(report.message);
    if (report.stack) {
      fallback.stack = report.stack;
    }
    Sentry.captureException(fallback);
  });
};
