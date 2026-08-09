import { AGENT_WS_ROUTE, type HostPayload, type TelemetryPayload } from "@pryladova/shared";
import WebSocket from "ws";

const WS_CONNECT_TIMEOUT_MS = 10_000;

const toWsUrl = (httpOrigin: string, path: string): string => {
  const url = new URL(httpOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
};

export const sendAgentUpdate = (
  apiBase: string,
  host: HostPayload,
  telemetry?: TelemetryPayload,
  ingestSecret?: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (ingestSecret) {
      headers.Authorization = `Bearer ${ingestSecret}`;
    }

    const socket = new WebSocket(toWsUrl(apiBase, AGENT_WS_ROUTE), { headers });
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Agent WebSocket timed out"));
    }, WS_CONNECT_TIMEOUT_MS);

    const fail = (error: Error): void => {
      clearTimeout(timeout);
      reject(error);
    };

    socket.once("open", () => {
      socket.send(JSON.stringify({ type: "update", agentId: "e2e-agent", host, telemetry }));
      socket.close();
    });
    socket.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("error", fail);
  });
