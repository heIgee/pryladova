import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    const { AppModule } = await import("../src/app.module.js");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app: INestApplication = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get("/api/health")
      .expect(200)
      .expect(({ body }) => {
        expect(body.ok).toBe(true);
      });

    await app.close();
  });
});
