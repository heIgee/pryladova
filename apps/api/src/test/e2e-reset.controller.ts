import { Controller, NotFoundException, Post } from "@nestjs/common";
import { Public } from "../auth/public.decorator.js";
import { ClassificationService } from "../classification/classification.service.js";
import { TelemetryService } from "../telemetry/telemetry.service.js";

@Controller()
export class E2eResetController {
  constructor(
    private readonly classificationService: ClassificationService,
    private readonly telemetryService: TelemetryService,
  ) {}

  @Public()
  @Post("api/test/e2e/reset")
  reset(): { ok: true } {
    if (process.env.NODE_ENV !== "test") {
      throw new NotFoundException();
    }

    this.classificationService.resetMemoryCacheForE2e();
    this.telemetryService.resetForE2e();
    return { ok: true };
  }
}
