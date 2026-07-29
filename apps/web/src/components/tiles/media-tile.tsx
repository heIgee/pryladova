import type { HostPayload } from "@pryladova/shared";
import { Music2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPlaybackStatus } from "@/lib/format";
import { cn } from "@/lib/utils";

export const MediaTile = ({
  host,
  className,
}: {
  host: HostPayload | null;
  className?: string;
}) => {
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
