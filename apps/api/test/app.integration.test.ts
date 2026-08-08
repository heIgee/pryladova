import "reflect-metadata";
import { type INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module.js";
import type { ApiConfig } from "../src/config.js";
import { ConfigService } from "../src/config.service.js";
import { resetReleaseCacheForTests } from "../src/release.js";

const telemetryPayload = {
  appName: "Code",
  windowTitle: "app.tsx",
  capturedAt: "2026-01-01T12:00:00.000Z",
};

const hostPayload = {
  idleMs: 500,
  cpuPercent: 15,
  ramPercent: 40,
  uptimeSec: 900,
  media: null,
  capturedAt: "2026-01-01T12:00:00.000Z",
};

const createApp = async (config: ApiConfig): Promise<INestApplication> => {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ConfigService)
    .useValue({ config })
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
};

const defaultConfig: ApiConfig = {
  geminiApiKey: undefined,
  geminiModel: "gemini-3.1-flash-lite",
  ingestSecret: undefined,
  sentryDsn: undefined,
};

describe("App integration", () => {
  let app: INestApplication;

  beforeEach(async () => {
    resetReleaseCacheForTests();
    app = await createApp(defaultConfig);
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

  it("GET /api/telemetry returns 404 before ingest", async () => {
    await request(app.getHttpServer()).get("/api/telemetry").expect(404);
  });

  it("POST /api/telemetry then GET returns stored state", async () => {
    await request(app.getHttpServer()).post("/api/telemetry").send(telemetryPayload).expect(204);

    const response = await request(app.getHttpServer()).get("/api/telemetry").expect(200);

    expect(response.body.appName).toBe("Code");
    expect(response.body.windowTitle).toBe("app.tsx");
    expect(response.body.classificationStatus).toBe("disabled");
  });

  it("POST /api/host merges host metrics on GET", async () => {
    await request(app.getHttpServer()).post("/api/telemetry").send(telemetryPayload).expect(204);
    await request(app.getHttpServer()).post("/api/host").send(hostPayload).expect(204);

    const response = await request(app.getHttpServer()).get("/api/telemetry").expect(200);
    expect(response.body.host?.cpuPercent).toBe(15);
  });

  it("PUT /api/settings updates classification toggle", async () => {
    const response = await request(app.getHttpServer())
      .put("/api/settings")
      .send({ classificationEnabled: true })
      .expect(200);

    expect(response.body).toEqual({ classificationEnabled: true });
  });

  it("PUT /api/settings returns formatted validation errors", async () => {
    const response = await request(app.getHttpServer())
      .put("/api/settings")
      .send({ classificationEnabled: "yes" })
      .expect(400);

    expect(response.body.classificationEnabled?._errors?.length).toBeGreaterThan(0);
  });

  it("GET /api/weather returns disabled without coordinates", async () => {
    await request(app.getHttpServer()).get("/api/weather").expect(200, { status: "disabled" });
  });
});

describe("App integration weather", () => {
  let app: INestApplication;

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
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  it("GET /api/weather returns ready payload for query coordinates", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/weather")
      .query({ lat: 50.45, lon: 30.52 })
      .expect(200);

    expect(response.body.status).toBe("ready");
    expect(response.body.temperatureC).toBe(21.5);
    expect(response.body.condition).toBe("Clear");
  });
});

describe("App integration ingest auth", () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await createApp({
      ...defaultConfig,
      ingestSecret: "test-secret",
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects ingest without bearer token", async () => {
    await request(app.getHttpServer()).post("/api/telemetry").send(telemetryPayload).expect(401);
  });

  it("accepts ingest with valid bearer token", async () => {
    await request(app.getHttpServer())
      .post("/api/telemetry")
      .set("Authorization", "Bearer test-secret")
      .send(telemetryPayload)
      .expect(204);
  });
});
