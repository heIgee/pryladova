import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiConfig } from "../config.js";
import { ConfigService } from "../config.service.js";
import { GithubService } from "./github.service.js";

const githubConfig: ApiConfig = {
  geminiApiKey: undefined,
  geminiModel: "gemini-3.1-flash-lite",
  ingestSecret: undefined,
  sentryDsn: undefined,
  sessionSecret: undefined,
  panelPasswordHash: undefined,
  supabaseUrl: undefined,
  supabaseSecretKey: undefined,
  githubToken: "ghp_test",
  githubUsername: "octocat",
  steamApiKey: undefined,
  steamId: undefined,
  googleClientId: undefined,
  googleClientSecret: undefined,
  googleRedirectUri: undefined,
  googleRefreshToken: undefined,
  integrationEncryptionKey: undefined,
};

const createService = async (): Promise<GithubService> => {
  const moduleRef = await Test.createTestingModule({
    providers: [GithubService, { provide: ConfigService, useValue: { config: githubConfig } }],
  }).compile();
  return moduleRef.get(GithubService);
};

describe("GithubService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns disabled without token or username", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GithubService,
        {
          provide: ConfigService,
          useValue: {
            config: { ...githubConfig, githubToken: undefined },
          },
        },
      ],
    }).compile();
    const service = moduleRef.get(GithubService);
    await expect(service.getStatus()).resolves.toEqual({ status: "disabled" });
  });

  it("returns ready payload from GitHub API", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/search/commits")) {
        return {
          ok: true,
          json: async () => ({ total_count: 4 }),
        };
      }
      if (url === "https://api.github.com/graphql") {
        return {
          ok: true,
          json: async () => ({
            data: { viewer: { pullRequests: { totalCount: 2 } } },
          }),
        };
      }
      if (url.includes("/repos?")) {
        return {
          ok: true,
          json: async () => [{ full_name: "octocat/pryladova", name: "pryladova" }],
        };
      }
      if (url.includes("/users/octocat") && !url.includes("/repos")) {
        return {
          ok: true,
          json: async () => ({
            avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
            html_url: "https://github.com/octocat",
            public_repos: 8,
            followers: 9001,
          }),
        };
      }
      if (url.includes("/actions/runs")) {
        return {
          ok: true,
          json: async () => ({
            workflow_runs: [{ conclusion: "success", status: "completed" }],
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = await createService();
    const status = await service.getStatus();
    expect(status.status).toBe("ready");
    if (status.status === "ready") {
      expect(status.commitsToday).toBe(4);
      expect(status.openPullRequests).toBe(2);
      expect(status.checks).toEqual([{ repo: "pryladova", status: "success" }]);
      expect(status.username).toBe("octocat");
      expect(status.publicRepos).toBe(8);
      expect(status.followers).toBe(9001);
    }
  });

  it("returns stale cache when refresh fetch fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ total_count: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { viewer: { pullRequests: { totalCount: 1 } } },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ full_name: "octocat/pryladova", name: "pryladova" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
          html_url: "https://github.com/octocat",
          public_repos: 8,
          followers: 9001,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workflow_runs: [{ conclusion: "success", status: "completed" }],
        }),
      })
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const service = await createService();
    const first = await service.getStatus();
    expect(first.status).toBe("ready");

    const second = await service.getStatus(true);
    expect(second.status).toBe("ready");
    if (second.status === "ready") {
      expect(second.commitsToday).toBe(1);
    }
  });

  it("maps skipped workflow conclusions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/search/commits")) {
        return { ok: true, json: async () => ({ total_count: 0 }) };
      }
      if (url === "https://api.github.com/graphql") {
        return {
          ok: true,
          json: async () => ({
            data: { viewer: { pullRequests: { totalCount: 0 } } },
          }),
        };
      }
      if (url.includes("/repos?")) {
        return {
          ok: true,
          json: async () => [{ full_name: "octocat/pryladova", name: "pryladova" }],
        };
      }
      if (url.includes("/users/octocat") && !url.includes("/repos")) {
        return {
          ok: true,
          json: async () => ({
            avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
            html_url: "https://github.com/octocat",
            public_repos: 1,
            followers: 1,
          }),
        };
      }
      if (url.includes("/actions/runs")) {
        expect(url).toContain("/repos/octocat/pryladova/actions/runs");
        expect(url).not.toContain("%2F");
        return {
          ok: true,
          json: async () => ({
            workflow_runs: [{ conclusion: "skipped", status: "completed" }],
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = await createService();
    const status = await service.getStatus();
    expect(status.status).toBe("ready");
    if (status.status === "ready") {
      expect(status.checks).toEqual([{ repo: "pryladova", status: "skipped" }]);
    }
  });

  it("maps empty workflow runs to none and actions HTTP errors to denied", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/search/commits")) {
        return { ok: true, json: async () => ({ total_count: 0 }) };
      }
      if (url === "https://api.github.com/graphql") {
        return {
          ok: true,
          json: async () => ({
            data: { viewer: { pullRequests: { totalCount: 0 } } },
          }),
        };
      }
      if (url.includes("/repos?")) {
        return {
          ok: true,
          json: async () => [
            { full_name: "octocat/empty", name: "empty" },
            { full_name: "octocat/denied", name: "denied" },
          ],
        };
      }
      if (url.includes("/users/octocat") && !url.includes("/repos")) {
        return {
          ok: true,
          json: async () => ({
            avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
            html_url: "https://github.com/octocat",
            public_repos: 2,
            followers: 1,
          }),
        };
      }
      if (url.includes("/actions/runs") && url.includes("empty")) {
        return { ok: true, json: async () => ({ workflow_runs: [] }) };
      }
      if (url.includes("/actions/runs") && url.includes("denied")) {
        return { ok: false, status: 403, json: async () => ({}) };
      }
      if (url.includes("/actions/runs") && url.includes("pryladova")) {
        return {
          ok: true,
          json: async () => ({
            workflow_runs: [{ conclusion: "skipped", status: "completed" }],
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = await createService();
    const status = await service.getStatus();
    expect(status.status).toBe("ready");
    if (status.status === "ready") {
      expect(status.checks).toEqual([
        { repo: "empty", status: "none" },
        { repo: "denied", status: "denied" },
      ]);
    }
  });
});
