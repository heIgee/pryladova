import "./instrument.js";
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { WsAdapter } from "@nestjs/platform-ws";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { assertPanelAuthConfig, assertProductionIngestSecret } from "./config.js";
import { ConfigService } from "./config.service.js";

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  // Host ingest may include base64 album-art thumbnails.
  app.useBodyParser("json", { limit: "2mb" });
  app.use(cookieParser());
  const config = app.get(ConfigService).config;
  assertPanelAuthConfig(config);
  assertProductionIngestSecret(config);
  if (!config.ingestSecret && !config.runtime.isProduction) {
    Logger.warn("INGEST_SECRET unset — agent ingest is rejected", "Bootstrap");
  }
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableCors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  });
  const { port, isTest } = config.runtime;
  if (isTest) {
    await app.listen(port, "127.0.0.1");
  } else {
    await app.listen(port);
  }
};

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[api] fatal: ${message}\n`);
  process.exit(1);
});
