import { Module } from "@nestjs/common";
import { TelemetryModule } from "../telemetry/telemetry.module.js";
import { SettingsController } from "./settings.controller.js";
import { SettingsModule } from "./settings.module.js";

@Module({
  imports: [SettingsModule, TelemetryModule],
  controllers: [SettingsController],
})
export class SettingsHttpModule {}
