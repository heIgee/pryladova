import { Injectable } from "@nestjs/common";
import {
  type HostPayload,
  hostPayloadForPanelWs,
  type PanelWsMessage,
  parseTelemetryState,
  type TelemetryState,
} from "@pryladova/shared";
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
    this.broadcastPanelMessage(this.buildPanelMessage(state));
  }

  broadcastPanelHost(host: HostPayload): void {
    this.broadcastPanelMessage(this.buildPanelHostMessage(host));
  }

  private broadcastPanelMessage(message: PanelWsMessage): void {
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

  buildPanelHostMessage(host: HostPayload): PanelWsMessage {
    return {
      type: "host",
      host: hostPayloadForPanelWs(host),
    };
  }
}
