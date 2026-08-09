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
