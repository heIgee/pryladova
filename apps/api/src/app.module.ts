import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { loadConfig } from "./config.js";
import { ConfigModule } from "./config.module.js";
import { HealthModule } from "./health/health.module.js";
import { ApiSentryExceptionFilter } from "./sentry-exception.filter.js";
import { TelemetryModule } from "./telemetry/telemetry.module.js";
import { WeatherModule } from "./weather/weather.module.js";

const sentryEnabled = process.env.NODE_ENV !== "test" && Boolean(loadConfig().sentryDsn);
const throttlingEnabled = process.env.NODE_ENV !== "test";

const sentryProviders = sentryEnabled
  ? [{ provide: APP_FILTER, useClass: ApiSentryExceptionFilter }]
  : [];

const throttlerProviders = throttlingEnabled
  ? [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
  : [];

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 300,
      },
    ]),
    ConfigModule,
    HealthModule,
    TelemetryModule,
    WeatherModule,
  ],
  providers: [...sentryProviders, ...throttlerProviders],
})
export class AppModule {}
