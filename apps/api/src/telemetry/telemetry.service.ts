import { Injectable } from "@nestjs/common";
import { isRedactedTelemetry, type TelemetryPayload, type TelemetryState } from "@pryladova/shared";
import { ClassificationService } from "../classification/classification.service.js";
import { SettingsService } from "../settings/settings.service.js";

@Injectable()
export class TelemetryService {
  private state: TelemetryState | null = null;
  private ingestGeneration = 0;

  constructor(
    private readonly classificationService: ClassificationService,
    private readonly settingsService: SettingsService,
  ) {}

  setState(payload: TelemetryPayload): void {
    const generation = ++this.ingestGeneration;
    const classificationEnabled = this.settingsService.isClassificationEnabled();
    const redacted = isRedactedTelemetry(payload.appName, payload.windowTitle);

    this.state = {
      ...payload,
      receivedAt: new Date().toISOString(),
      classification: null,
      classificationStatus: !classificationEnabled ? "disabled" : redacted ? "ready" : "pending",
    };

    if (!classificationEnabled || redacted) {
      return;
    }

    void this.runClassification(payload, generation);
  }

  getState(): TelemetryState | null {
    return this.state;
  }

  private async runClassification(payload: TelemetryPayload, generation: number): Promise<void> {
    const classification = await this.classificationService.classify(
      payload.appName,
      payload.windowTitle,
    );

    if (generation !== this.ingestGeneration) {
      return;
    }

    if (!this.settingsService.isClassificationEnabled()) {
      if (this.state) {
        this.state = {
          ...this.state,
          classification: null,
          classificationStatus: "disabled",
        };
      }
      return;
    }

    if (!this.state) {
      return;
    }

    this.state = {
      ...this.state,
      classification,
      classificationStatus: classification ? "ready" : "failed",
    };
  }
}
