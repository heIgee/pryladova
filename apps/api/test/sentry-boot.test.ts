import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpTestApp } from "./http-test-app.js";

describe("Sentry boot", () => {
  const previousDsn = process.env.SENTRY_DSN;

  afterEach(async () => {
    if (previousDsn === undefined) {
      delete process.env.SENTRY_DSN;
    } else {
      process.env.SENTRY_DSN = previousDsn;
    }
    vi.resetModules();
  });

  it("boots when SENTRY_DSN is set", async () => {
    vi.resetModules();
    process.env.SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0";

    await import("../src/instrument.js");
    const { ConfigService } = await import("../src/config.service.js");

    const app: INestApplication = await createHttpTestApp(new ConfigService().config);

    await request(app.getHttpServer())
      .get("/api/health")
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
      });

    await app.close();
  });
});
