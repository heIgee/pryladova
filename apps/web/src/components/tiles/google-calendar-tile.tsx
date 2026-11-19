import type { CalendarEvent } from "@pryladova/shared";
import { Calendar } from "lucide-react";
import { BentoTileHeader } from "@/components/tiles/bento-tile-header";
import {
  bentoTileBodyClassName,
  bentoTileCardClassName,
  bentoTileLucideIconClassName,
} from "@/components/tiles/bento-tile-header-layout";
import { GoogleConnectLink } from "@/components/tiles/google-connect-link";
import { GoogleTileSkeleton } from "@/components/tiles/integration-tile-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatIntegrationDate,
  formatIntegrationDateFromKey,
  formatIntegrationTime,
  isSameLocalDay,
} from "@/lib/integration-dates";
import type { GoogleCalendarTileStatus } from "@/lib/integration-status";
import { isIntegrationLoading } from "@/lib/integration-status";
import { cn } from "@/lib/utils";

const isAllDayCalendarEvent = (event: CalendarEvent): boolean => {
  if (event.allDay || event.date) {
    return true;
  }
  return (
    /T00:00:00(\.000)?Z?$/.test(event.startAt) &&
    /T23:59:59(\.999)?Z?$/.test(event.endAt) &&
    event.startAt.slice(0, 10) === event.endAt.slice(0, 10)
  );
};

const allDayCalendarDate = (event: CalendarEvent): string =>
  event.date ?? event.startAt.slice(0, 10);

const formatUpcomingStart = (event: CalendarEvent, nowMs: number): string => {
  if (isAllDayCalendarEvent(event)) {
    return formatIntegrationDateFromKey(allDayCalendarDate(event));
  }
  const date = new Date(event.startAt);
  if (Number.isNaN(date.getTime())) {
    return event.startAt;
  }
  const now = new Date(nowMs);
  const time = formatIntegrationTime(event.startAt);
  if (isSameLocalDay(date, now)) {
    return time;
  }
  return `${formatIntegrationDate(date, now)} · ${time}`;
};

const formatCurrentTimeRange = (event: CalendarEvent): string => {
  if (isAllDayCalendarEvent(event)) {
    return "All day";
  }
  return `${formatIntegrationTime(event.startAt)} – ${formatIntegrationTime(event.endAt)}`;
};

const EventRow = ({
  label,
  title,
  timeRange,
}: {
  label: string;
  title: string;
  timeRange: string;
}) => (
  <div className="rounded-lg bg-muted/40 px-2.5 py-2">
    <p className="text-micro text-muted-foreground">{label}</p>
    <p className="mt-0.5 truncate text-caption font-medium">{title}</p>
    <p className="text-micro text-muted-foreground tabular-nums">{timeRange}</p>
  </div>
);

const calendarHeaderDetail = (status: GoogleCalendarTileStatus): string | null | undefined => {
  if (status.status === "loading") {
    return null;
  }
  if (status.status === "ready" && status.accountEmail) {
    return status.accountEmail;
  }
  return undefined;
};

export const GoogleCalendarTile = ({
  status,
  nowMs,
  className,
}: {
  status: GoogleCalendarTileStatus;
  nowMs: number;
  className?: string;
}) => (
  <Card size="sm" className={cn(bentoTileCardClassName, className)}>
    <BentoTileHeader
      testId="google-calendar-tile-header"
      icon={<Calendar className={bentoTileLucideIconClassName} aria-hidden="true" />}
      title="Calendar"
      detail={calendarHeaderDetail(status)}
      action={
        status.status === "ready" ? (
          <>
            {status.inMeeting ? (
              <Badge variant="secondary" className="h-5 px-1.5 text-micro">
                In meeting
              </Badge>
            ) : null}
            <span className="text-micro text-muted-foreground">Next week</span>
          </>
        ) : null
      }
    />
    <CardContent className={cn(bentoTileBodyClassName, "grid gap-2.5 py-2.5")}>
      {isIntegrationLoading(status) ? <GoogleTileSkeleton /> : null}
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
          <GoogleConnectLink label="Connect Google" />
        </div>
      ) : null}
      {status.status === "misconfigured" ? (
        <div className="grid gap-1">
          <p className="text-caption text-destructive" aria-live="polite">
            GOOGLE_REFRESH_TOKEN is invalid
          </p>
          <p className="text-micro text-muted-foreground/80">
            Fix or remove the env override, then restart the API
          </p>
        </div>
      ) : null}
      {status.status === "unavailable" ? (
        <p className="text-caption text-destructive" aria-live="polite">
          Calendar status unavailable
        </p>
      ) : null}
      {status.status === "ready" ? (
        <>
          {status.currentEvent ? (
            <EventRow
              label="Now"
              title={status.currentEvent.title}
              timeRange={formatCurrentTimeRange(status.currentEvent)}
            />
          ) : null}
          {status.upcomingEvents.length > 0 ? (
            <div className="grid gap-1">
              {status.upcomingEvents.map((event) => (
                <div
                  key={`${event.title}-${event.startAt}`}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-2 text-caption"
                >
                  <span className="truncate font-medium">{event.title}</span>
                  <span className="shrink-0 text-micro text-muted-foreground tabular-nums">
                    {formatUpcomingStart(event, nowMs)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {!status.currentEvent && status.upcomingEvents.length === 0 ? (
            <p className="text-caption text-muted-foreground">No upcoming events</p>
          ) : null}
        </>
      ) : null}
    </CardContent>
  </Card>
);
