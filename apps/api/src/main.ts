import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule);
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
