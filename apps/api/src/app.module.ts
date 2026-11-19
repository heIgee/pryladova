import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module.js";
import { loadConfig } from "./config.js";
import { ConfigModule } from "./config.module.js";
import { HealthModule } from "./health/health.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { PersistenceModule } from "./persistence/persistence.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { ApiSentryExceptionFilter } from "./sentry-exception.filter.js";
import { SettingsHttpModule } from "./settings/settings-http.module.js";
import { TelemetryModule } from "./telemetry/telemetry.module.js";
import { E2eModule } from "./test/e2e.module.js";

const config = loadConfig();
const testModules = config.runtime.isTest ? [E2eModule] : [];

const sentryEnabled = !config.runtime.isTest && Boolean(config.sentryDsn);
const throttlingEnabled = !config.runtime.isTest;

const sentryProviders = sentryEnabled
  ? [{ provide: APP_FILTER, useClass: ApiSentryExceptionFilter }]
  : [];

const throttlerProviders = throttlingEnabled
  ? [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
  : [];

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 300,
      },
    ]),
    ConfigModule,
    AuthModule,
    HealthModule,
    PersistenceModule,
    TelemetryModule,
    RealtimeModule,
    SettingsHttpModule,
    IntegrationsModule,
    ...testModules,
  ],
  providers: [...sentryProviders, ...throttlerProviders],
})
export class AppModule {}
