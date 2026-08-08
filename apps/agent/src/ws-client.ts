import { AGENT_WS_ROUTE, type HostPayload, type TelemetryPayload } from "@pryladova/shared";
import WebSocket from "ws";

const WS_CONNECT_TIMEOUT_MS = 30_000;

const toWsUrl = (httpOrigin: string, path: string): string => {
  const url = new URL(httpOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
};

export type AgentWsClient = {
  sendUpdate: (host: HostPayload, telemetry?: TelemetryPayload) => void;
  close: () => void;
};

export const connectAgentWs = (
  apiUrl: string,
  ingestSecret: string | undefined,
): Promise<AgentWsClient> =>
  new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (ingestSecret) {
      headers.Authorization = `Bearer ${ingestSecret}`;
    }

    const socket = new WebSocket(toWsUrl(apiUrl, AGENT_WS_ROUTE), { headers });
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Agent WebSocket connect timed out"));
    }, WS_CONNECT_TIMEOUT_MS);

    socket.once("open", () => {
      clearTimeout(timeout);
      resolve({
        sendUpdate: (host, telemetry) => {
          socket.send(JSON.stringify({ type: "update", host, telemetry }));
        },
        close: () => {
          socket.close();
        },
      });
    });

    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
