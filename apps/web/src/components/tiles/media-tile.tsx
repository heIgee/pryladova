import type { HostPayload } from "@pryladova/shared";
import { Music2 } from "lucide-react";
import { BentoTileHeader } from "@/components/tiles/bento-tile-header";
import {
  bentoTileBodyClipClassName,
  bentoTileCardClassName,
  bentoTileLucideIconClassName,
} from "@/components/tiles/bento-tile-header-layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useBentoTileSize } from "@/hooks/use-bento-tile-size";
import { mediaLayoutClasses, pickMediaLayout } from "@/lib/bento-tile-variants";
import { formatPlaybackStatus } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  artClassName,
}: {
  thumbnailDataUrl: string | null;
  title: string;
  artist: string | null;
  artClassName: string;
}) => {
  if (thumbnailDataUrl) {
    return (
      <div className={artClassName} data-testid="media-tile-art">
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
        artClassName,
        "flex items-center justify-center bg-muted text-muted-foreground ring-1 ring-border/60",
      )}
      data-testid="media-tile-art"
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
  const size = useBentoTileSize();
  const variant = pickMediaLayout(size);
  const layout = mediaLayoutClasses(variant, size);
  const title = media?.title ?? "Nothing playing";
  const artist = media ? (media.artist ?? "Unknown artist") : null;

  return (
    <Card size="sm" className={cn(bentoTileCardClassName, className)} data-testid="media-tile">
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
      <CardContent
        className={cn(bentoTileBodyClipClassName, layout.body)}
        data-bento-layout={variant}
      >
        <div className={layout.content}>
          {variant === "stack" ? (
            <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
              <MediaArt
                thumbnailDataUrl={media?.thumbnailDataUrl ?? null}
                title={title}
                artist={artist}
                artClassName={layout.art}
              />
            </div>
          ) : (
            <MediaArt
              thumbnailDataUrl={media?.thumbnailDataUrl ?? null}
              title={title}
              artist={artist}
              artClassName={layout.art}
            />
          )}
          <div
            className={cn(
              "flex min-w-0 flex-col justify-center gap-1",
              variant === "stack" ? "w-full shrink-0 text-center" : "min-h-0",
            )}
            data-testid="media-tile-caption"
          >
            <p className={layout.title}>{title}</p>
            {artist ? (
              <p className="truncate text-caption text-muted-foreground">{artist}</p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
