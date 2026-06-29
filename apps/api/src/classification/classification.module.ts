import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module.js";
import { ClassificationService } from "./classification.service.js";

@Module({
  imports: [SettingsModule],
  providers: [ClassificationService],
  exports: [ClassificationService],
})
export class ClassificationModule {}
