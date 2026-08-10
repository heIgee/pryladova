import type { CiCheckStatus } from "@pryladova/shared";
import { GitCommitHorizontal, GitPullRequest, Users } from "lucide-react";
import type { ReactNode } from "react";
import { GithubIcon } from "@/components/brand-icons";
import { BentoTileHeader } from "@/components/tiles/bento-tile-header";
import { IntegrationTileSkeleton } from "@/components/tiles/integration-tile-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { GithubTileStatus } from "@/lib/integration-status";
import { isIntegrationLoading } from "@/lib/integration-status";

const ciStatusLabel = (status: CiCheckStatus): string => {
  switch (status) {
    case "success":
      return "Pass";
    case "failure":
      return "Fail";
    case "pending":
      return "Running";
    case "skipped":
      return "Skipped";
    case "none":
      return "No runs";
    case "denied":
      return "No access";
    default:
      return "Unknown";
  }
};

const StatCell = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => (
  <div className="rounded-lg bg-muted/40 px-2.5 py-2">
    <div className="flex items-center gap-1 text-micro text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
    <p className="mt-0.5 text-sm font-medium tabular-nums">{value}</p>
  </div>
);

export const GithubStatusTile = ({
  status,
  className,
}: {
  status: GithubTileStatus;
  className?: string;
}) => (
  <Card size="sm" className={className} data-testid="github-tile">
    <BentoTileHeader
      testId="github-tile-header"
      icon={<GithubIcon className="size-3.5 shrink-0" />}
      title="GitHub"
    />
    <CardContent className="grid gap-2.5 py-2.5">
      {isIntegrationLoading(status) ? <IntegrationTileSkeleton /> : null}
      {status.status === "disabled" ? (
        <div className="grid gap-1">
          <p className="text-caption text-muted-foreground">Not configured</p>
          <p className="text-micro text-muted-foreground/80">
            Set GITHUB_TOKEN and GITHUB_USERNAME
          </p>
        </div>
      ) : null}
      {status.status === "unavailable" ? (
        <p className="text-caption text-destructive">GitHub status unavailable</p>
      ) : null}
      {status.status === "ready" ? (
        <>
          <div className="flex items-center gap-2.5">
            {status.avatarUrl ? (
              <a
                href={status.profileUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="size-9 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border/60"
              >
                <img src={status.avatarUrl} alt="" className="size-full object-cover" />
              </a>
            ) : null}
            <div className="min-w-0 flex-1">
              <a
                href={status.profileUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="truncate text-caption font-medium hover:underline"
              >
                @{status.username}
              </a>
              <p className="text-micro text-muted-foreground tabular-nums">
                {status.publicRepos} repos · {status.followers} followers
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatCell
              icon={<GitCommitHorizontal className="size-3" aria-hidden="true" />}
              label="Commits today"
              value={status.commitsToday > 99 ? "99+" : String(status.commitsToday)}
            />
            <StatCell
              icon={<GitPullRequest className="size-3" aria-hidden="true" />}
              label="Open PRs"
              value={status.openPullRequests > 99 ? "99+" : String(status.openPullRequests)}
            />
          </div>
          {status.checks.length > 0 ? (
            <div className="grid gap-1">
              <p className="text-micro text-muted-foreground">Latest CI</p>
              {status.checks.map((check) => (
                <div
                  key={check.repo}
                  className="flex min-w-0 items-center justify-between gap-2 text-caption"
                >
                  <span className="truncate text-muted-foreground">{check.repo}</span>
                  <Badge variant="outline" className="h-5 px-1.5 text-micro">
                    {ciStatusLabel(check.status)}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-micro text-muted-foreground">
              <Users className="size-3" aria-hidden="true" />
              <span>No recent CI runs</span>
            </div>
          )}
        </>
      ) : null}
    </CardContent>
  </Card>
);
