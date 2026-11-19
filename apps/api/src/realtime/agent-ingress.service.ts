import { Injectable } from "@nestjs/common";
import type { AgentWsInbound } from "@pryladova/shared";
import { AgentBindingService } from "../ingest/agent-binding.service.js";
import { SegmentService } from "../persistence/segment.service.js";
import { TelemetryService } from "../telemetry/telemetry.service.js";

@Injectable()
export class AgentIngressService {
  private readonly persistedSequence = new Map<string, number>();
  private readonly inFlightSequence = new Map<string, Set<number>>();
  private readonly failedSequence = new Map<string, Set<number>>();

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly segmentService: SegmentService,
    private readonly agentBindingService: AgentBindingService,
  ) {}

  acceptMessage(message: AgentWsInbound): "ok" | "rejected" {
    if (this.agentBindingService.assertAgent(message.agentId) === "rejected") {
      return "rejected";
    }

    if (this.sequenceAlreadyHandled(message.agentId, message.sequence)) {
      return "ok";
    }

    const pending = this.dispatch(message);
    this.observeSequence(message.agentId, message.sequence, pending);
    return "ok";
  }

  private sequenceSet(store: Map<string, Set<number>>, agentId: string): Set<number> {
    let sequences = store.get(agentId);
    if (!sequences) {
      sequences = new Set();
      store.set(agentId, sequences);
    }
    return sequences;
  }

  private sequenceAlreadyHandled(agentId: string, sequence: number): boolean {
    if (this.inFlightSequence.get(agentId)?.has(sequence)) {
      return true;
    }
    const persisted = this.persistedSequence.get(agentId) ?? 0;
    if (sequence > persisted) {
      return false;
    }
    return !this.failedSequence.get(agentId)?.has(sequence);
  }

  private observeSequence(agentId: string, sequence: number, pending: Promise<void>): void {
    const inFlight = this.sequenceSet(this.inFlightSequence, agentId);
    inFlight.add(sequence);
    this.failedSequence.get(agentId)?.delete(sequence);
    pending.then(
      () => {
        inFlight.delete(sequence);
        this.failedSequence.get(agentId)?.delete(sequence);
        const persisted = this.persistedSequence.get(agentId) ?? 0;
        if (sequence > persisted) {
          this.persistedSequence.set(agentId, sequence);
        }
      },
      () => {
        inFlight.delete(sequence);
        this.sequenceSet(this.failedSequence, agentId).add(sequence);
      },
    );
  }

  private dispatch(message: AgentWsInbound): Promise<void> {
    if (message.type === "update") {
      return this.telemetryService.ingestAgentUpdate(
        message.agentId,
        message.host,
        message.telemetry,
        message.sequence,
      );
    }

    if (message.type === "session_lock") {
      return this.segmentService.closeForSessionLock(
        message.agentId,
        message.capturedAt,
        message.sequence,
      );
    }

    return this.segmentService.closeForShutdown(
      message.agentId,
      message.capturedAt,
      message.sequence,
    );
  }

  handleDisconnect(agentId: string): void {
    void this.segmentService.closeForAgentDisconnect(agentId);
  }

  boundAgentId(): string | null {
    return this.agentBindingService.getBoundAgentId();
  }
}
