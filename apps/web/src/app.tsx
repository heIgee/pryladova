import { useEffect, useState } from "react";
import {
  TELEMETRY_ROUTE,
  telemetryStateSchema,
  type TelemetryState,
} from "@pryladova/shared";

const POLL_INTERVAL_MS = 2000;

type PanelState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; telemetry: TelemetryState }
  | { status: "error"; message: string };

const fetchTelemetry = async (): Promise<PanelState> => {
  const response = await fetch(TELEMETRY_ROUTE);

  if (response.status === 404) {
    return { status: "empty" };
  }

  if (!response.ok) {
    return { status: "error", message: `API error (${response.status})` };
  }

  const json: unknown = await response.json();
  const telemetry = telemetryStateSchema.parse(json);
  return { status: "ready", telemetry };
};

const shellClassName = "min-h-screen bg-neutral-950";
const contentClassName =
  "mx-auto max-w-lg px-4 py-10 font-sans leading-relaxed";

export const App = () => {
  const [panel, setPanel] = useState<PanelState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      try {
        const next = await fetchTelemetry();
        if (active) {
          setPanel(next);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (active) {
          setPanel({ status: "error", message });
        }
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (panel.status === "loading") {
    return (
      <main className={shellClassName}>
        <div className={`${contentClassName} text-neutral-400`}>Loading…</div>
      </main>
    );
  }

  if (panel.status === "error") {
    return (
      <main className={shellClassName}>
        <div className={`${contentClassName} text-red-400`}>
          API unreachable: {panel.message}
        </div>
      </main>
    );
  }

  if (panel.status === "empty") {
    return (
      <main className={shellClassName}>
        <div className={`${contentClassName} text-neutral-400`}>
          Waiting for agent telemetry…
        </div>
      </main>
    );
  }

  const { telemetry } = panel;

  return (
    <main className={shellClassName}>
      <div className={contentClassName}>
        <h1 className="mb-6 text-xl font-medium tracking-tight">Pryladova</h1>
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
          <dl className="space-y-3 text-sm">
            <div className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1">
              <dt className="text-neutral-500">App</dt>
              <dd className="truncate">{telemetry.appName}</dd>
            </div>
            <div className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1">
              <dt className="text-neutral-500">Window</dt>
              <dd className="break-words">{telemetry.windowTitle}</dd>
            </div>
            <div className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1">
              <dt className="text-neutral-500">Captured</dt>
              <dd className="text-neutral-400">{telemetry.capturedAt}</dd>
            </div>
            <div className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1">
              <dt className="text-neutral-500">Received</dt>
              <dd className="text-neutral-400">{telemetry.receivedAt}</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
};
