import "reflect-metadata";
import { type INestApplication } from "@nestjs/common";
import request, { type Agent } from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiConfig } from "../src/config.js";
import { resetReleaseCacheForTests } from "../src/release.js";
import { createHttpTestApp } from "./http-test-app.js";

const testPanelPassword = "dev";
const testPanelPasswordHash = "$2b$10$TtcGsCYSJ53WtzGpi0k7lOXLR3yY2n2jrjAnw0grKQFPV9sCEtQuq";

const defaultConfig: ApiConfig = {
  geminiApiKey: undefined,
  geminiModel: "gemini-3.1-flash-lite",
  ingestSecret: undefined,
  sentryDsn: undefined,
  sessionSecret: "test-session-secret-at-least-32-characters",
  panelPasswordHash: testPanelPasswordHash,
  supabaseUrl: undefined,
  supabaseSecretKey: undefined,
  githubToken: undefined,
  githubUsername: undefined,
  steamApiKey: undefined,
  steamId: undefined,
  googleClientId: undefined,
  googleClientSecret: undefined,
  googleRedirectUri: undefined,
  googleRefreshToken: undefined,
  integrationEncryptionKey: undefined,
};

const createApp = createHttpTestApp;

const loginPanel = async (agent: Agent): Promise<void> => {
  await agent.post("/api/auth/login").send({ password: testPanelPassword }).expect(204);
};

describe("App integration", () => {
  let app: INestApplication;
  let agent: Agent;

  beforeEach(async () => {
    resetReleaseCacheForTests();
    app = await createApp(defaultConfig);
    agent = request.agent(app.getHttpServer());
    await loginPanel(agent);
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/health returns ok", async () => {
    const previous = process.env.SENTRY_RELEASE;
    delete process.env.SENTRY_RELEASE;
    try {
      const response = await request(app.getHttpServer()).get("/api/health").expect(200);
      expect(response.body.ok).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.SENTRY_RELEASE;
      } else {
        process.env.SENTRY_RELEASE = previous;
      }
    }
  });

  it("GET /api/health includes release when SENTRY_RELEASE is set", async () => {
    const previous = process.env.SENTRY_RELEASE;
    process.env.SENTRY_RELEASE = "abc123deadbeef";
    try {
      await app.close();
      app = await createApp(defaultConfig);
      agent = request.agent(app.getHttpServer());
      await loginPanel(agent);
      await request(app.getHttpServer())
        .get("/api/health")
        .expect(200, { ok: true, release: "abc123deadbeef" });
    } finally {
      if (previous === undefined) {
        delete process.env.SENTRY_RELEASE;
      } else {
        process.env.SENTRY_RELEASE = previous;
      }
    }
  });

  it("PUT /api/settings updates classification toggle", async () => {
    const response = await agent
      .put("/api/settings")
      .send({ classificationEnabled: true })
      .expect(200);

    expect(response.body).toEqual({ classificationEnabled: true, persisted: false });
  });

  it("PUT /api/settings returns formatted validation errors", async () => {
    const response = await agent
      .put("/api/settings")
      .send({ classificationEnabled: "yes" })
      .expect(400);

    expect(response.body.classificationEnabled?._errors?.length).toBeGreaterThan(0);
  });

  it("GET /api/weather returns disabled without coordinates", async () => {
    await agent.get("/api/weather").expect(200, { status: "disabled" });
  });
});

describe("App integration auth", () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createApp(defaultConfig);
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST /api/auth/login rejects invalid passwords", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ password: "wrong" })
      .expect(401);
  });
});

describe("App integration weather", () => {
  let app: INestApplication;
  let agent: Agent;

  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          current: { temperature_2m: 21.5, weather_code: 0 },
        }),
      }),
    );

    app = await createApp(defaultConfig);
    agent = request.agent(app.getHttpServer());
    await loginPanel(agent);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  it("GET /api/weather returns ready payload for query coordinates", async () => {
    const response = await agent.get("/api/weather").query({ lat: 50.45, lon: 30.52 }).expect(200);

    expect(response.body.status).toBe("ready");
    expect(response.body.temperatureC).toBe(21.5);
    expect(response.body.condition).toBe("Clear");
  });
});

describe("App integration integrations", () => {
  let app: INestApplication;
  let agent: Agent;

  afterEach(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  it("GET /api/integrations/github returns disabled without config", async () => {
    app = await createApp(defaultConfig);
    agent = request.agent(app.getHttpServer());
    await loginPanel(agent);

    await agent.get("/api/integrations/github").expect(200, { status: "disabled" });
  });

  it("GET /api/integrations/steam returns disabled without config", async () => {
    app = await createApp(defaultConfig);
    agent = request.agent(app.getHttpServer());
    await loginPanel(agent);

    await agent.get("/api/integrations/steam").expect(200, { status: "disabled" });
  });

  it("GET /api/integrations/google/calendar returns disabled without config", async () => {
    app = await createApp(defaultConfig);
    agent = request.agent(app.getHttpServer());
    await loginPanel(agent);

    await agent.get("/api/integrations/google/calendar").expect(200, { status: "disabled" });
  });

  it("GET /api/integrations/google/calendar returns ready when env token is configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/calendars/primary/events")) {
          return {
            ok: true,
            json: async () => ({
              items: [
                {
                  summary: "Planning",
                  start: { dateTime: "2026-08-10T14:00:00.000Z", timeZone: "UTC" },
                  end: { dateTime: "2026-08-10T15:00:00.000Z", timeZone: "UTC" },
                },
              ],
            }),
          };
        }
        if (url.includes("oauth2.googleapis.com/token")) {
          return {
            ok: true,
            json: async () => ({ access_token: "access-token", expires_in: 3600 }),
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:00:00.000Z"));

    app = await createApp({
      ...defaultConfig,
      googleClientId: "google-client-id",
      googleClientSecret: "google-client-secret",
      googleRedirectUri: "http://localhost:5173/api/integrations/google/callback",
      googleRefreshToken: "env-refresh-token",
      integrationEncryptionKey: Buffer.from("0123456789abcdef0123456789abcdef").toString("base64"),
    });
    agent = request.agent(app.getHttpServer());
    await loginPanel(agent);

    const response = await agent.get("/api/integrations/google/calendar").expect(200);
    expect(response.body.status).toBe("ready");
    expect(response.body.upcomingEvents[0].title).toBe("Planning");

    vi.useRealTimers();
  });

  it("GET /api/integrations/google/tasks returns disabled without config", async () => {
    app = await createApp(defaultConfig);
    agent = request.agent(app.getHttpServer());
    await loginPanel(agent);

    await agent.get("/api/integrations/google/tasks").expect(200, { status: "disabled" });
  });

  it("GET /api/integrations/google/tasks returns ready when env token is configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("tasks.googleapis.com/tasks/v1/lists")) {
          return {
            ok: true,
            json: async () => ({
              items: [
                { title: "Review PR", status: "needsAction", due: "2026-08-10T00:00:00.000Z" },
              ],
            }),
          };
        }
        if (url.includes("oauth2.googleapis.com/token")) {
          return {
            ok: true,
            json: async () => ({ access_token: "access-token", expires_in: 3600 }),
          };
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:00:00.000Z"));

    app = await createApp({
      ...defaultConfig,
      googleClientId: "google-client-id",
      googleClientSecret: "google-client-secret",
      googleRedirectUri: "http://localhost:5173/api/integrations/google/callback",
      googleRefreshToken: "env-refresh-token",
      integrationEncryptionKey: Buffer.from("0123456789abcdef0123456789abcdef").toString("base64"),
    });
    agent = request.agent(app.getHttpServer());
    await loginPanel(agent);

    const response = await agent.get("/api/integrations/google/tasks").expect(200);
    expect(response.body.status).toBe("ready");
    expect(response.body.tasks[0].title).toBe("Review PR");

    vi.useRealTimers();
  });

  it("GET /api/integrations/github returns ready payload when configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/search/commits")) {
          return { ok: true, json: async () => ({ total_count: 1 }) };
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
      }),
    );

    app = await createApp({
      ...defaultConfig,
      githubToken: "ghp_test",
      githubUsername: "octocat",
    });
    agent = request.agent(app.getHttpServer());
    await loginPanel(agent);

    const response = await agent.get("/api/integrations/github").expect(200);
    expect(response.body.status).toBe("ready");
    expect(response.body.commitsToday).toBe(1);
    expect(response.body.checks).toEqual([{ repo: "pryladova", status: "success" }]);
  });

  it("POST /api/test/e2e/reset clears in-memory state in test env", async () => {
    const response = await agent.post("/api/test/e2e/reset").expect(201);
    expect(response.body).toEqual({ ok: true });
  });

  it("POST /api/test/e2e/classification/release resolves a gated classify", async () => {
    const response = await agent.post("/api/test/e2e/classification/release").expect(201);
    expect(response.body).toEqual({ released: 0 });
  });
});
