import { AGENT_WS_ROUTE, type HostPayload, type TelemetryPayload } from "@pryladova/shared";
import WebSocket from "ws";

const WS_CONNECT_TIMEOUT_MS = 30_000;
const HUB_BOUND_CLOSE_CODE = 4403;

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
  sendShutdown: (capturedAt: string) => Promise<void>;
  close: () => void;
};

export type AgentWsConnectResult = {
  client: AgentWsClient;
  hubBoundReject: Promise<never>;
};

export const connectAgentWs = (
  apiUrl: string,
  ingestSecret: string | undefined,
  agentId: string,
  onDisconnect?: () => void,
): Promise<AgentWsConnectResult> =>
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

    let rejectHubBound: ((reason?: unknown) => void) | undefined;
    const hubBoundPromise = new Promise<never>((_, reject) => {
      rejectHubBound = reject;
    });
    let opened = false;

    socket.on("close", (code, reason) => {
      if (code === HUB_BOUND_CLOSE_CODE) {
        const detail = reason.toString() || "Hub already bound to another agent";
        console.error(`[agent] ws closed (${code}): ${detail}`);
        rejectHubBound?.(new Error(detail));
        return;
      }

      if (opened && code !== 1000) {
        onDisconnect?.();
      }
    });

    socket.once("open", () => {
      opened = true;
      clearTimeout(timeout);
      resolve({
        client: {
          sendUpdate: (host, telemetry) => {
            socket.send(JSON.stringify({ type: "update", agentId, host, telemetry }));
          },
          sendShutdown: (capturedAt) =>
            new Promise<void>((resolve, reject) => {
              if (socket.readyState !== WebSocket.OPEN) {
                resolve();
                return;
              }
              socket.send(JSON.stringify({ type: "shutdown", agentId, capturedAt }), (error) => {
                if (error) {
                  reject(error);
                  return;
                }
                resolve();
              });
            }),
          close: () => {
            socket.close();
          },
        },
        hubBoundReject: hubBoundPromise,
      });
    });

    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
