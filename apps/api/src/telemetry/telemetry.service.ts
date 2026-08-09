import { forwardRef, Inject, Injectable } from "@nestjs/common";
import {
  type HostPayload,
  isRedactedTelemetry,
  mergeHostPayload,
  parseTelemetryState,
  type TelemetryPayload,
  type TelemetryState,
  type WindowClassification,
} from "@pryladova/shared";
import { ClassificationService } from "../classification/classification.service.js";
import { AgentBindingService } from "../ingest/agent-binding.service.js";
import { SegmentService } from "../persistence/segment.service.js";
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
  private publishHostQueued = false;

  constructor(
    private readonly classificationService: ClassificationService,
    private readonly settingsService: SettingsService,
    private readonly segmentService: SegmentService,
    private readonly agentBindingService: AgentBindingService,
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

  private publishHost(): void {
    if (this.publishHostQueued) {
      return;
    }

    this.publishHostQueued = true;
    queueMicrotask(() => {
      this.publishHostQueued = false;
      const host = this.state?.host;
      if (host) {
        this.realtimeService.broadcastPanelHost(host);
      }
    });
  }

  ingestAgentUpdate(agentId: string, host: HostPayload, telemetry?: TelemetryPayload): void {
    if (!telemetry) {
      this.applyHost(agentId, host);
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

    void this.persistFocusIngest(agentId, host, telemetry, generation, classificationStatus);
  }

  private async persistFocusIngest(
    agentId: string,
    host: HostPayload,
    telemetry: TelemetryPayload,
    generation: number,
    classificationStatus: ClassificationStatus,
  ): Promise<void> {
    const segmentId = await this.segmentService.onFocusChange(agentId, telemetry);
    await this.segmentService.onHostTick(agentId, host.capturedAt, {
      skipStaleClose: true,
      idleMs: host.idleMs,
    });

    if (classificationStatus !== "pending") {
      return;
    }

    void this.runClassification(telemetry, generation, segmentId);
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

    void this.runClassification(payload, generation, undefined);
  }

  private applyHost(agentId: string | null, payload: HostPayload): void {
    const previousHost = this.state?.host ?? this.pendingHost;
    const previousThumbnail = previousHost?.media?.thumbnailDataUrl ?? null;
    const merged = this.mergeHostPayload(previousHost, payload);
    const thumbnailNewlyAvailable =
      merged.media?.thumbnailDataUrl != null && previousThumbnail == null;

    if (agentId) {
      void this.segmentService.onHostTick(agentId, payload.capturedAt, { idleMs: payload.idleMs });
    }

    if (!this.state) {
      this.pendingHost = merged;
      return;
    }

    this.state = parseTelemetryState({
      ...this.state,
      host: merged,
    });

    if (thumbnailNewlyAvailable) {
      this.publishState();
      return;
    }

    this.publishHost();
  }

  setHost(payload: HostPayload): void {
    this.applyHost(this.agentBindingService.getBoundAgentId(), payload);
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

    void this.runClassification({ appName, windowTitle, capturedAt }, generation, undefined);
  }

  private mergeHostPayload(
    previous: HostPayload | null | undefined,
    incoming: HostPayload,
  ): HostPayload {
    return mergeHostPayload(previous, incoming);
  }

  private async runClassification(
    payload: TelemetryPayload,
    generation: number,
    segmentId: string | undefined,
  ): Promise<void> {
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

    if (classification) {
      if (segmentId) {
        void this.segmentService.updateClassification(segmentId, classification);
      } else {
        void this.segmentService.updateOpenSegmentClassification(
          this.agentBindingService.getBoundAgentId() ?? undefined,
          classification,
        );
      }
    }
  }
}
