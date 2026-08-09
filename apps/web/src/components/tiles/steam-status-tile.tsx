import type { SteamPersonaState } from "@pryladova/shared";
import { Clock3, UserRound } from "lucide-react";
import { SteamIcon } from "@/components/brand-icons";
import { IntegrationTileSkeleton } from "@/components/tiles/integration-tile-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration, formatPlaytimeMinutes } from "@/lib/format";
import type { SteamTileStatus } from "@/lib/integration-status";
import { isIntegrationLoading } from "@/lib/integration-status";

const personaLabel = (state: SteamPersonaState): string => {
  switch (state) {
    case "online":
      return "Online";
    case "away":
      return "Away";
    case "busy":
      return "Busy";
    case "snooze":
      return "Snooze";
    default:
      return "Offline";
  }
};

const totalRecentPlaytimeMin = (status: Extract<SteamTileStatus, { status: "ready" }>): number =>
  status.recentlyPlayed.reduce((sum, game) => sum + game.playtime2WeeksMin, 0);

const headerBadgeLabel = (status: Extract<SteamTileStatus, { status: "ready" }>): string => {
  if (status.currentGame) {
    return status.currentGame.name;
  }
  return personaLabel(status.personaState);
};

const headerBadgeVariant = (
  status: Extract<SteamTileStatus, { status: "ready" }>,
): "default" | "outline" => {
  if (status.currentGame) {
    return "default";
  }
  if (status.personaState === "online" || status.personaState === "busy") {
    return "default";
  }
  return "outline";
};

export const SteamStatusTile = ({
  status,
  className,
}: {
  status: SteamTileStatus;
  className?: string;
}) => (
  <Card size="sm" className={className} data-testid="steam-tile">
    <CardHeader className="border-b py-2">
      <CardTitle className="flex items-center gap-2 text-sm">
        <SteamIcon />
        Steam
      </CardTitle>
      <CardAction>
        <Badge
          variant={status.status === "ready" ? headerBadgeVariant(status) : "outline"}
          className={status.status !== "ready" ? "invisible" : "max-w-36 truncate"}
          title={
            status.status === "ready" && status.currentGame ? status.currentGame.name : undefined
          }
        >
          {status.status === "ready" ? headerBadgeLabel(status) : "Offline"}
        </Badge>
      </CardAction>
    </CardHeader>
    <CardContent className="grid gap-2.5 py-2.5">
      {isIntegrationLoading(status) ? <IntegrationTileSkeleton /> : null}
      {status.status === "disabled" ? (
        <div className="grid gap-1">
          <p className="text-caption text-muted-foreground">Not configured</p>
          <p className="text-micro text-muted-foreground/80">Set STEAM_API_KEY and STEAM_ID</p>
        </div>
      ) : null}
      {status.status === "unavailable" ? (
        <p className="text-caption text-destructive">Steam status unavailable</p>
      ) : null}
      {status.status === "ready" ? (
        <>
          <div className="flex items-start gap-2.5">
            {status.profileUrl ? (
              <a
                href={status.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="size-9 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border/60"
              >
                {status.avatarUrl ? (
                  <img src={status.avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <UserRound className="size-4" aria-hidden="true" />
                  </div>
                )}
              </a>
            ) : (
              <div className="size-9 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border/60">
                {status.avatarUrl ? (
                  <img src={status.avatarUrl} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <UserRound className="size-4" aria-hidden="true" />
                  </div>
                )}
              </div>
            )}
            <div className="min-w-0 flex-1 grid gap-0.5">
              {status.profileUrl ? (
                <a
                  href={status.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-caption font-medium hover:underline"
                >
                  @{status.username}
                </a>
              ) : (
                <p className="truncate text-caption font-medium">@{status.username}</p>
              )}
              <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-micro text-muted-foreground tabular-nums">
                {status.currentGame ? (
                  <span>Session {formatDuration(status.currentGame.sessionSec)}</span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="size-3 shrink-0" aria-hidden="true" />
                  {formatPlaytimeMinutes(totalRecentPlaytimeMin(status))} in last 2 weeks
                </span>
              </p>
            </div>
          </div>
          {status.recentlyPlayed.length > 0 ? (
            <div className="grid gap-1">
              <p className="text-micro text-muted-foreground">Recently played</p>
              {status.recentlyPlayed.map((game) => (
                <div key={game.name} className="flex min-w-0 items-center gap-2 text-caption">
                  <div className="size-6 shrink-0 overflow-hidden rounded bg-muted ring-1 ring-border/60">
                    {game.iconUrl ? (
                      <img src={game.iconUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <SteamIcon className="size-3" />
                      </div>
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate">{game.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatPlaytimeMinutes(game.playtime2WeeksMin)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </CardContent>
  </Card>
);
