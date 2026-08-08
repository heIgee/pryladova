import type { HostPayload } from "@pryladova/shared";
import { Music2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPlaybackStatus } from "@/lib/format";
import { cn } from "@/lib/utils";

const artClassName = "size-24 shrink-0 rounded-lg object-cover";

const coverArtAlt = (title: string, artist: string | null): string => {
  if (artist) {
    return `Cover art for ${title} by ${artist}`;
  }
  return `Cover art for ${title}`;
};

const MediaArt = ({
  thumbnailDataUrl,
  title,
  artist,
}: {
  thumbnailDataUrl: string | null;
  title: string;
  artist: string | null;
}) => {
  if (thumbnailDataUrl) {
    return <img src={thumbnailDataUrl} alt={coverArtAlt(title, artist)} className={artClassName} />;
  }

  return (
    <div
      className={cn(
        artClassName,
        "flex items-center justify-center bg-muted text-muted-foreground ring-1 ring-border/60",
      )}
    >
      <Music2 className="size-6" aria-hidden="true" />
    </div>
  );
};

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
          <div className="flex gap-3">
            <MediaArt
              thumbnailDataUrl={media.thumbnailDataUrl}
              title={media.title}
              artist={media.artist}
            />
            <div className="flex min-w-0 flex-col justify-center gap-1">
              <p className="line-clamp-2 text-body leading-snug font-medium">{media.title}</p>
              <p className="truncate text-caption text-muted-foreground">
                {media.artist ?? "Unknown artist"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-caption text-muted-foreground">Nothing playing</p>
        )}
      </CardContent>
    </Card>
  );
};
