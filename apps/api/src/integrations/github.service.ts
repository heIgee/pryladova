import { Injectable } from "@nestjs/common";
import {
  type CiCheckStatus,
  type GithubStatusResponse,
  parseGithubStatusResponse,
} from "@pryladova/shared";
import { z } from "zod";
import { ConfigService } from "../config.service.js";

const CACHE_TTL_MS = 10 * 60 * 1000;

const searchTotalSchema = z.object({
  total_count: z.number().int().nonnegative(),
});

const openPullRequestCountSchema = z.object({
  data: z.object({
    viewer: z.object({
      pullRequests: z.object({
        totalCount: z.number().int().nonnegative(),
      }),
    }),
  }),
});

const repoSchema = z.object({
  full_name: z.string().min(1),
  name: z.string().min(1),
});

const reposResponseSchema = z.array(repoSchema);

const userSchema = z.object({
  avatar_url: z.string().url(),
  html_url: z.string().url(),
  public_repos: z.number().int().nonnegative(),
  followers: z.number().int().nonnegative(),
});

const workflowRunSchema = z.object({
  workflow_runs: z
    .array(
      z.object({
        conclusion: z.string().nullable(),
        status: z.string(),
      }),
    )
    .optional(),
});

type CachedReady = Extract<GithubStatusResponse, { status: "ready" }>;

const githubHeaders = (token: string): Record<string, string> => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

const repoApiSegment = (fullName: string): string => {
  const [owner, ...nameParts] = fullName.split("/");
  const name = nameParts.join("/");
  if (!owner || !name) {
    throw new Error(`Invalid GitHub repo name: ${fullName}`);
  }
  return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
};

const todayIsoStart = (): string => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
};

const mapWorkflowStatus = (conclusion: string | null, status: string): CiCheckStatus => {
  if (conclusion === "success") {
    return "success";
  }
  if (
    conclusion === "failure" ||
    conclusion === "cancelled" ||
    conclusion === "timed_out" ||
    conclusion === "action_required" ||
    conclusion === "startup_failure"
  ) {
    return "failure";
  }
  if (conclusion === "skipped" || conclusion === "neutral" || conclusion === "stale") {
    return "skipped";
  }
  if (
    conclusion === null &&
    (status === "in_progress" ||
      status === "queued" ||
      status === "waiting" ||
      status === "requested" ||
      status === "pending")
  ) {
    return "pending";
  }
  return "unknown";
};

const mapActionsHttpStatus = (httpStatus: number): CiCheckStatus => {
  if (httpStatus === 403 || httpStatus === 401) {
    return "denied";
  }
  if (httpStatus === 404) {
    return "none";
  }
  return "unknown";
};

@Injectable()
export class GithubService {
  private cached: { ready: CachedReady; expiresAt: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  async getStatus(refresh = false): Promise<GithubStatusResponse> {
    const { githubToken, githubUsername } = this.configService.config;
    if (!githubToken || !githubUsername) {
      return parseGithubStatusResponse({ status: "disabled" });
    }

    const now = Date.now();
    if (
      !refresh &&
      this.cached !== undefined &&
      this.cached !== null &&
      now < this.cached.expiresAt
    ) {
      return this.cached.ready;
    }

    try {
      const ready = await this.fetchStatus(githubToken, githubUsername);
      this.cached = { ready, expiresAt: now + CACHE_TTL_MS };
      return ready;
    } catch (error: unknown) {
      if (this.cached !== null) {
        return this.cached.ready;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[api] github status fetch failed: ${message}`);
      return parseGithubStatusResponse({ status: "unavailable" });
    }
  }

  private async fetchStatus(token: string, username: string): Promise<CachedReady> {
    const todayStart = todayIsoStart();
    const headers = githubHeaders(token);

    const [commitsRes, openPullRequests, repos, userRes] = await Promise.all([
      fetch(
        `https://api.github.com/search/commits?q=author:${encodeURIComponent(username)}+committer-date:>=${encodeURIComponent(todayStart)}`,
        { headers },
      ),
      this.fetchOpenPullRequestCount(token),
      this.fetchRecentRepos(token, username),
      fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers }),
    ]);

    if (!commitsRes.ok) {
      throw new Error(`GitHub commits search HTTP ${commitsRes.status}`);
    }
    if (!userRes.ok) {
      throw new Error(`GitHub user HTTP ${userRes.status}`);
    }

    const commitsJson: unknown = await commitsRes.json();
    const userJson: unknown = await userRes.json();
    const commitsToday = searchTotalSchema.parse(commitsJson).total_count;
    const user = userSchema.parse(userJson);

    const checks = await Promise.all(
      repos.map(async (repo) => {
        const response = await fetch(
          `https://api.github.com/repos/${repoApiSegment(repo.full_name)}/actions/runs?per_page=1`,
          { headers },
        );
        if (!response.ok) {
          return { repo: repo.name, status: mapActionsHttpStatus(response.status) };
        }
        const json: unknown = await response.json();
        const parsed = workflowRunSchema.parse(json);
        const run = parsed.workflow_runs?.[0];
        if (!run) {
          return { repo: repo.name, status: "none" as const };
        }
        return {
          repo: repo.name,
          status: mapWorkflowStatus(run.conclusion, run.status),
        };
      }),
    );

    return parseGithubStatusResponse({
      status: "ready",
      username,
      avatarUrl: user.avatar_url,
      profileUrl: user.html_url,
      publicRepos: user.public_repos,
      followers: user.followers,
      commitsToday,
      openPullRequests,
      checks,
      fetchedAt: new Date().toISOString(),
    }) as CachedReady;
  }

  private async fetchOpenPullRequestCount(token: string): Promise<number> {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        ...githubHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "query { viewer { pullRequests(states: OPEN) { totalCount } } }",
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub GraphQL HTTP ${response.status}`);
    }

    const json: unknown = await response.json();
    return openPullRequestCountSchema.parse(json).data.viewer.pullRequests.totalCount;
  }

  private async fetchRecentRepos(
    token: string,
    username: string,
  ): Promise<Array<{ full_name: string; name: string }>> {
    const headers = githubHeaders(token);
    const ownerUrl = `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=3&type=owner`;
    const ownerResponse = await fetch(ownerUrl, { headers });
    if (!ownerResponse.ok) {
      throw new Error(`GitHub repos HTTP ${ownerResponse.status}`);
    }

    const ownerJson: unknown = await ownerResponse.json();
    const ownerRepos = reposResponseSchema.parse(ownerJson);
    if (ownerRepos.length > 0) {
      return ownerRepos;
    }

    const memberUrl = `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=3&type=member`;
    const memberResponse = await fetch(memberUrl, { headers });
    if (!memberResponse.ok) {
      throw new Error(`GitHub member repos HTTP ${memberResponse.status}`);
    }

    const memberJson: unknown = await memberResponse.json();
    return reposResponseSchema.parse(memberJson);
  }
}
