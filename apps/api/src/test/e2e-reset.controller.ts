import { Controller, NotFoundException, Post } from "@nestjs/common";
import { Public } from "../auth/public.decorator.js";
import { ClassificationService } from "../classification/classification.service.js";
import {
  releaseE2eClassificationGate,
  resetE2eClassificationGate,
} from "../classification/e2e-classification.gate.js";
import { AgentBindingService } from "../ingest/agent-binding.service.js";
import { TelemetryService } from "../telemetry/telemetry.service.js";

@Controller()
export class E2eResetController {
  constructor(
    private readonly classificationService: ClassificationService,
    private readonly telemetryService: TelemetryService,
    private readonly agentBindingService: AgentBindingService,
  ) {}

  @Public()
  @Post("api/test/e2e/reset")
  reset(): { ok: true } {
    if (process.env.NODE_ENV !== "test") {
      throw new NotFoundException();
    }

    this.classificationService.resetMemoryCacheForE2e();
    this.telemetryService.resetForE2e();
    this.agentBindingService.resetForE2e();
    resetE2eClassificationGate();
    return { ok: true };
  }

  @Public()
  @Post("api/test/e2e/classification/release")
  releaseClassification(): { released: number } {
    if (process.env.NODE_ENV !== "test") {
      throw new NotFoundException();
    }

    return { released: releaseE2eClassificationGate() };
  }
}
