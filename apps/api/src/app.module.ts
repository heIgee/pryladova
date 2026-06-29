import { Module } from "@nestjs/common";
import { TelemetryModule } from "./telemetry/telemetry.module.js";

@Module({
  imports: [TelemetryModule],
})
export class AppModule {}
