import "./instrument.js";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { WsAdapter } from "@nestjs/platform-ws";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { assertPanelAuthConfig, assertProductionIngestSecret } from "./config.js";
import { ConfigService } from "./config.service.js";

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Host ingest may include base64 album-art thumbnails.
  app.useBodyParser("json", { limit: "2mb" });
  app.use(cookieParser());
  const config = app.get(ConfigService).config;
  assertPanelAuthConfig(config);
  assertProductionIngestSecret(config);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableCors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
};

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[api] fatal: ${message}`);
  process.exit(1);
});
