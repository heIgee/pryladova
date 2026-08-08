import "./instrument.js";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { assertProductionIngestSecret } from "./config.js";
import { ConfigService } from "./config.service.js";

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Host ingest may include base64 album-art thumbnails.
  app.useBodyParser("json", { limit: "2mb" });
  assertProductionIngestSecret(app.get(ConfigService).config);
  app.enableCors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
};

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[api] fatal: ${message}`);
  process.exit(1);
});
