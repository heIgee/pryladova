import { Injectable } from "@nestjs/common";
import type { TelemetryPayload, TelemetryState } from "@pryladova/shared";

@Injectable()
export class TelemetryService {
  private state: TelemetryState | null = null;

  setState(payload: TelemetryPayload): void {
    this.state = {
      ...payload,
      receivedAt: new Date().toISOString(),
    };
  }

  getState(): TelemetryState | null {
    return this.state;
  }
}
