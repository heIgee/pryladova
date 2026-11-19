import { Module } from "@nestjs/common";
import { ConfigModule } from "../config.module.js";
import { PersistenceModule } from "../persistence/persistence.module.js";
import { SettingsService } from "./settings.service.js";

@Module({
  imports: [ConfigModule, PersistenceModule],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
