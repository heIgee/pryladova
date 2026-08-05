import { Module } from "@nestjs/common";
import { ConfigModule } from "./config.module.js";
import { HealthModule } from "./health/health.module.js";
import { TelemetryModule } from "./telemetry/telemetry.module.js";
import { WeatherModule } from "./weather/weather.module.js";

@Module({
  imports: [ConfigModule, HealthModule, TelemetryModule, WeatherModule],
})
export class AppModule {}
