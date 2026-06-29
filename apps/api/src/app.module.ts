import { Module } from "@nestjs/common";
import { SettingsModule } from "./settings/settings.module.js";
import { TelemetryModule } from "./telemetry/telemetry.module.js";

@Module({
  imports: [SettingsModule, TelemetryModule],
})
export class AppModule {}
