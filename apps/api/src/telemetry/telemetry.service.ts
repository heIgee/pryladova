import { forwardRef, Inject, Injectable } from "@nestjs/common";
import {
  type HostPayload,
  isRedactedTelemetry,
  parseTelemetryState,
  type TelemetryPayload,
  type TelemetryState,
  trackMediaKey,
  type WindowClassification,
} from "@pryladova/shared";
import { ClassificationService } from "../classification/classification.service.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { SettingsService } from "../settings/settings.service.js";

type ClassificationStatus = TelemetryState["classificationStatus"];

/** Status before classify() has resolved: "pending" is the only state that should trigger a run. */
const resolvePendingStatus = (
  classificationEnabled: boolean,
  redacted: boolean,
  geminiConfigured: boolean,
): ClassificationStatus => {
  if (!classificationEnabled) {
    return "disabled";
  }
  if (redacted) {
    return "ready";
  }
  return geminiConfigured ? "pending" : "misconfigured";
};

const resolveResultStatus = (
  classification: WindowClassification | null,
  geminiConfigured: boolean,
): ClassificationStatus => {
  if (classification) {
    return "ready";
  }
  return geminiConfigured ? "failed" : "misconfigured";
};

@Injectable()
export class TelemetryService {
  private state: TelemetryState | null = null;
  private pendingHost: HostPayload | null = null;
  private ingestGeneration = 0;
  private publishQueued = false;

  constructor(
    private readonly classificationService: ClassificationService,
    private readonly settingsService: SettingsService,
    @Inject(forwardRef(() => RealtimeService))
    private readonly realtimeService: RealtimeService,
  ) {}

  private publishState(): void {
    if (this.publishQueued) {
      return;
    }

    this.publishQueued = true;
    queueMicrotask(() => {
      this.publishQueued = false;
      this.realtimeService.broadcastPanelState(this.state);
    });
  }

  ingestAgentUpdate(host: HostPayload, telemetry?: TelemetryPayload): void {
    if (!telemetry) {
      this.applyHost(host);
      return;
    }

    const generation = ++this.ingestGeneration;
    const classificationEnabled = this.settingsService.isClassificationEnabled();
    const redacted = isRedactedTelemetry(telemetry.appName, telemetry.windowTitle);
    const mergedHost = this.mergeHostPayload(this.state?.host ?? this.pendingHost, host);
    this.pendingHost = null;

    const classificationStatus = resolvePendingStatus(
      classificationEnabled,
      redacted,
      this.classificationService.isGeminiConfigured(),
    );

    this.state = parseTelemetryState({
      ...telemetry,
      receivedAt: new Date().toISOString(),
      classification: null,
      classificationStatus,
      host: mergedHost,
    });

    this.publishState();

    if (classificationStatus !== "pending") {
      return;
    }

    void this.runClassification(telemetry, generation);
  }

  setState(payload: TelemetryPayload): void {
    this.applyTelemetry(payload);
  }

  private applyTelemetry(payload: TelemetryPayload): void {
    const generation = ++this.ingestGeneration;
    const classificationEnabled = this.settingsService.isClassificationEnabled();
    const redacted = isRedactedTelemetry(payload.appName, payload.windowTitle);
    const host = this.state?.host ?? this.pendingHost;
    this.pendingHost = null;

    const classificationStatus = resolvePendingStatus(
      classificationEnabled,
      redacted,
      this.classificationService.isGeminiConfigured(),
    );

    this.state = parseTelemetryState({
      ...payload,
      receivedAt: new Date().toISOString(),
      classification: null,
      classificationStatus,
      host,
    });

    this.publishState();

    if (classificationStatus !== "pending") {
      return;
    }

    void this.runClassification(payload, generation);
  }

  private applyHost(payload: HostPayload): void {
    const merged = this.mergeHostPayload(this.state?.host ?? this.pendingHost, payload);

    if (!this.state) {
      this.pendingHost = merged;
      return;
    }

    this.state = parseTelemetryState({
      ...this.state,
      host: merged,
    });
    this.publishState();
  }

  setHost(payload: HostPayload): void {
    this.applyHost(payload);
  }

  getState(): TelemetryState | null {
    return this.state;
  }

  reclassifyCurrentWindow(): void {
    if (!this.state) {
      return;
    }

    if (!this.settingsService.isClassificationEnabled()) {
      return;
    }

    const { appName, windowTitle, capturedAt } = this.state;
    const redacted = isRedactedTelemetry(appName, windowTitle);
    const classificationStatus = resolvePendingStatus(
      true,
      redacted,
      this.classificationService.isGeminiConfigured(),
    );

    const generation = ++this.ingestGeneration;
    this.state = parseTelemetryState({
      ...this.state,
      classification: null,
      classificationStatus,
    });

    this.publishState();

    if (classificationStatus !== "pending") {
      return;
    }

    void this.runClassification({ appName, windowTitle, capturedAt }, generation);
  }

  private mergeHostPayload(
    previous: HostPayload | null | undefined,
    incoming: HostPayload,
  ): HostPayload {
    if (!previous?.media || !incoming.media) {
      return incoming;
    }

    const sameTrack = trackMediaKey(previous.media) === trackMediaKey(incoming.media);
    const preservedThumbnail =
      sameTrack && !incoming.media.thumbnailDataUrl && previous.media.thumbnailDataUrl
        ? previous.media.thumbnailDataUrl
        : incoming.media.thumbnailDataUrl;

    if (preservedThumbnail === incoming.media.thumbnailDataUrl) {
      return incoming;
    }

    return {
      ...incoming,
      media: {
        ...incoming.media,
        thumbnailDataUrl: preservedThumbnail,
      },
    };
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
        this.state = parseTelemetryState({
          ...this.state,
          classification: null,
          classificationStatus: "disabled",
        });
        this.publishState();
      }
      return;
    }

    if (!this.state) {
      return;
    }

    const classificationStatus = resolveResultStatus(
      classification,
      this.classificationService.isGeminiConfigured(),
    );

    this.state = parseTelemetryState({
      ...this.state,
      classification,
      classificationStatus,
    });
    this.publishState();
  }
}
