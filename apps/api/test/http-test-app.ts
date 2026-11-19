import { type INestApplication, Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module.js";
import type { ApiConfig } from "../src/config.js";
import { ConfigService } from "../src/config.service.js";
import { RealtimeModule } from "../src/realtime/realtime.module.js";

/** Gateways off. RealtimeService still comes from RealtimeCoreModule via TelemetryModule. */
@Module({})
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
