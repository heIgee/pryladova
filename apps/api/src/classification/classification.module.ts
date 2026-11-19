import { Module } from "@nestjs/common";
import { loadConfig } from "../config.js";
import { PersistenceModule } from "../persistence/persistence.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { E2eClassificationService } from "../test/e2e-classification.service.js";
import { ClassificationService } from "./classification.service.js";

const classificationProvider = loadConfig().runtime.e2eClassificationEnabled
  ? E2eClassificationService
  : ClassificationService;

@Module({
  imports: [SettingsModule, PersistenceModule],
  providers: [
    {
      provide: ClassificationService,
      useClass: classificationProvider,
    },
  ],
  exports: [ClassificationService],
})
export class ClassificationModule {}
