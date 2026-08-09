import { forwardRef, Module } from "@nestjs/common";
import { PersistenceModule } from "../persistence/persistence.module.js";
import { TelemetryModule } from "../telemetry/telemetry.module.js";
import { SettingsController } from "./settings.controller.js";
import { SettingsService } from "./settings.service.js";

@Module({
  imports: [PersistenceModule, forwardRef(() => TelemetryModule)],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
