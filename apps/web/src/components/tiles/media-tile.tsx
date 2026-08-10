import type { HostPayload } from "@pryladova/shared";
import { Music2 } from "lucide-react";
import { BentoTileHeader } from "@/components/tiles/bento-tile-header";
import { bentoTileLucideIconClassName } from "@/components/tiles/bento-tile-header-layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatPlaybackStatus } from "@/lib/format";
import { cn } from "@/lib/utils";

const artFrameClassName =
  "aspect-square size-32 shrink-0 overflow-hidden rounded-lg md:h-full md:w-auto";

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
    return (
      <div className={artFrameClassName}>
        <img
          src={thumbnailDataUrl}
          alt={coverArtAlt(title, artist)}
          className="size-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        artFrameClassName,
        "flex items-center justify-center bg-muted text-muted-foreground ring-1 ring-border/60",
      )}
    >
      <Music2 className="size-8" aria-hidden="true" />
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
    <Card size="sm" className={cn("min-h-0 md:h-full", className)} data-testid="media-tile">
      <BentoTileHeader
        testId="media-tile-header"
        icon={<Music2 className={bentoTileLucideIconClassName} aria-hidden="true" />}
        title="Media"
        action={
          <Badge variant={media?.playbackStatus === "playing" ? "default" : "outline"}>
            {media ? formatPlaybackStatus(media.playbackStatus) : "Idle"}
          </Badge>
        }
      />
      <CardContent className="flex flex-col md:min-h-0 md:flex-1 md:basis-0">
        {media ? (
          <div className="flex items-stretch gap-3 md:min-h-0 md:flex-1 md:basis-0">
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
