import { Injectable } from "@nestjs/common";
import { type PanelWsMessage, parseTelemetryState, type TelemetryState } from "@pryladova/shared";
import WebSocket from "ws";

@Injectable()
export class RealtimeService {
  private readonly panelClients = new Set<WebSocket>();

  addPanelClient(client: WebSocket): void {
    this.panelClients.add(client);
  }

  removePanelClient(client: WebSocket): void {
    this.panelClients.delete(client);
  }

  broadcastPanelState(state: TelemetryState | null): void {
    const message = this.buildPanelMessage(state);
    const payload = JSON.stringify(message);

    for (const client of this.panelClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  buildPanelMessage(state: TelemetryState | null): PanelWsMessage {
    if (!state) {
      return { type: "empty" };
    }

    return {
      type: "state",
      telemetry: parseTelemetryState(state),
    };
  }
}
