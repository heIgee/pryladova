import { Module } from "@nestjs/common";
import { PersistenceModule } from "../persistence/persistence.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { ClassificationService } from "./classification.service.js";

@Module({
  imports: [SettingsModule, PersistenceModule],
  providers: [ClassificationService],
  exports: [ClassificationService],
})
export class ClassificationModule {}
