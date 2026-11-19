import { Injectable } from "@nestjs/common";
import type { WindowClassification } from "@pryladova/shared";
import { ClassificationService } from "../classification/classification.service.js";
import {
  resetE2eClassificationGate,
  waitForE2eClassificationRelease,
} from "../classification/e2e-classification.gate.js";
import { e2eClassificationStub } from "../classification/e2e-classification.stub.js";

@Injectable()
export class E2eClassificationService extends ClassificationService {
  override resetMemoryCacheForE2e(): void {
    if (!this.configService.config.runtime.isTest) {
      return;
    }
    this.clearMemoryCacheForE2e();
    resetE2eClassificationGate();
  }

  override async classify(
    appName: string,
    windowTitle: string,
  ): Promise<WindowClassification | null> {
    const prepared = this.prepareClassificationInputs(appName, windowTitle);
    if (prepared.outcome === "skip") {
      return null;
    }
    if (prepared.outcome === "hit") {
      return prepared.classification;
    }

    const { cacheKey } = prepared;
    try {
      await waitForE2eClassificationRelease();
    } catch {
      // E2e harness abort: release latch was reset while classify was waiting.
      return null;
    }
    const stub = e2eClassificationStub(appName, windowTitle);
    this.storeMemoryCacheHit(cacheKey, stub);
    return stub;
  }
}
