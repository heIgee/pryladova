import { GOOGLE_CONNECT_ROUTE } from "@pryladova/shared";
import { ListTodo } from "lucide-react";
import { BentoTileHeader } from "@/components/tiles/bento-tile-header";
import { bentoTileLucideIconClassName } from "@/components/tiles/bento-tile-header-layout";
import { IntegrationTileSkeleton } from "@/components/tiles/integration-tile-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { formatIntegrationDate } from "@/lib/integration-dates";
import type { GoogleTasksTileStatus } from "@/lib/integration-status";
import { isIntegrationLoading } from "@/lib/integration-status";

const formatDue = (dueAt: string | null): string => {
  if (!dueAt) {
    return "No due date";
  }
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) {
    return dueAt;
  }
  return formatIntegrationDate(date);
};

export const GoogleTasksTile = ({
  status,
  className,
}: {
  status: GoogleTasksTileStatus;
  className?: string;
}) => (
  <Card size="sm" className={className}>
    <BentoTileHeader
      testId="google-tasks-tile-header"
      icon={<ListTodo className={bentoTileLucideIconClassName} aria-hidden="true" />}
      title="Tasks"
      action={
        status.status === "ready" ? (
          <span className="text-micro text-muted-foreground tabular-nums">
            {status.openCount} open
          </span>
        ) : null
      }
    />
    <CardContent className="grid gap-2.5 py-2.5">
      {isIntegrationLoading(status) ? <IntegrationTileSkeleton /> : null}
      {status.status === "disabled" ? (
        <div className="grid gap-1">
          <p className="text-caption text-muted-foreground">Not configured</p>
          <p className="text-micro text-muted-foreground/80">
            Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI
          </p>
        </div>
      ) : null}
      {status.status === "needs_auth" ? (
        <div className="grid gap-1.5">
          <p className="text-caption text-muted-foreground">Google not connected</p>
          <a
            href={GOOGLE_CONNECT_ROUTE}
            className="text-caption font-medium text-primary hover:underline"
          >
            Connect Google
          </a>
          <a
            href={`${GOOGLE_CONNECT_ROUTE}?reconnect=1`}
            className="text-micro text-muted-foreground hover:underline"
          >
            Reconnect with consent
          </a>
        </div>
      ) : null}
      {status.status === "misconfigured" ? (
        <div className="grid gap-1">
          <p className="text-caption text-destructive">GOOGLE_REFRESH_TOKEN is invalid</p>
          <p className="text-micro text-muted-foreground/80">
            Fix or remove the env override, then restart the API
          </p>
        </div>
      ) : null}
      {status.status === "unavailable" ? (
        <p className="text-caption text-destructive">Tasks status unavailable</p>
      ) : null}
      {status.status === "ready" ? (
        <>
          <p className="text-micro text-muted-foreground tabular-nums">
            {status.dueTodayCount} due today
          </p>
          {status.tasks.length > 0 ? (
            <div className="grid gap-1">
              {status.tasks.map((task) => (
                <div
                  key={`${task.title}-${task.dueAt ?? "none"}`}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-2 text-caption"
                >
                  <span className="truncate font-medium">{task.title}</span>
                  <span className="shrink-0 text-micro text-muted-foreground tabular-nums">
                    {formatDue(task.dueAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-caption text-muted-foreground">No open tasks</p>
          )}
        </>
      ) : null}
    </CardContent>
  </Card>
);
