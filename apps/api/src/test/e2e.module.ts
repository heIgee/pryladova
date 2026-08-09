import { Module } from "@nestjs/common";
import { ClassificationModule } from "../classification/classification.module.js";
import { TelemetryModule } from "../telemetry/telemetry.module.js";
import { E2eResetController } from "./e2e-reset.controller.js";

@Module({
  imports: [ClassificationModule, TelemetryModule],
  controllers: [E2eResetController],
})
export class E2eModule {}
