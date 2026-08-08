import { forwardRef, type INestApplication, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module.js";
import type { ApiConfig } from "../src/config.js";
import { ConfigModule } from "../src/config.module.js";
import { ConfigService } from "../src/config.service.js";
import { RealtimeModule } from "../src/realtime/realtime.module.js";
import { RealtimeService } from "../src/realtime/realtime.service.js";
import { TelemetryModule } from "../src/telemetry/telemetry.module.js";

/** Realtime without WS gateways — HTTP integration tests do not need sockets. */
@Module({
  imports: [ConfigModule, forwardRef(() => TelemetryModule)],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
class RealtimeHttpTestModule {}

export const createHttpTestApp = async (config: ApiConfig): Promise<INestApplication> => {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ConfigService)
    .useValue({ config })
    .overrideModule(RealtimeModule)
    .useModule(RealtimeHttpTestModule)
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  return app;
};
