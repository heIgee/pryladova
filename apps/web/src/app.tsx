import { useEffect, useState, type ReactNode } from "react";
import {
  SETTINGS_ROUTE,
  TELEMETRY_ROUTE,
  pickSpinnerVerb,
  settingsSchema,
  telemetryStateSchema,
  type TelemetryState,
  type WorkRelated,
} from "@pryladova/shared";

const POLL_INTERVAL_MS = 2000;
const CLASSIFICATION_ENABLED_KEY = "pryladova.classificationEnabled";

type PanelState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; telemetry: TelemetryState }
  | { status: "error"; message: string };

const readStoredClassificationEnabled = (): boolean => {
  const stored = localStorage.getItem(CLASSIFICATION_ENABLED_KEY);
  if (stored === null) {
    return true;
  }
  return stored === "true";
};

const syncSettings = async (classificationEnabled: boolean): Promise<void> => {
  const response = await fetch(SETTINGS_ROUTE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ classificationEnabled }),
  });
  if (!response.ok) {
    throw new Error(`Settings error (${response.status})`);
  }
  const json: unknown = await response.json();
  settingsSchema.parse(json);
};

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

const formatWorkRelated = (workRelated: WorkRelated): string => {
  if (workRelated === "yes") return "Yes";
  if (workRelated === "no") return "No";
  return "Maybe";
};

const classificationSeed = (telemetry: TelemetryState): string =>
  `${telemetry.appName}|${telemetry.windowTitle}|${telemetry.receivedAt}`;

const renderClassificationBody = (
  telemetry: TelemetryState,
  classificationEnabled: boolean,
): ReactNode => {
  if (!classificationEnabled || telemetry.classificationStatus === "disabled") {
    return <p className="text-sm text-neutral-500">Classification disabled</p>;
  }

  if (telemetry.classificationStatus === "pending") {
    return (
      <p className="text-sm text-neutral-400">
        {pickSpinnerVerb(classificationSeed(telemetry))}…
      </p>
    );
  }

  if (telemetry.classificationStatus === "ready" && telemetry.classification) {
    return (
      <dl className="space-y-3 text-sm">
        <div className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1">
          <dt className="text-neutral-500">Category</dt>
          <dd>{telemetry.classification.category}</dd>
        </div>
        <div className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1">
          <dt className="text-neutral-500">Display</dt>
          <dd className="truncate">{telemetry.classification.displayAppName}</dd>
        </div>
        <div className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1">
          <dt className="text-neutral-500">Work</dt>
          <dd>{formatWorkRelated(telemetry.classification.workRelated)}</dd>
        </div>
      </dl>
    );
  }

  return <p className="text-sm text-neutral-500">Classification unavailable</p>;
};

export const App = () => {
  const [panel, setPanel] = useState<PanelState>({ status: "loading" });
  const [classificationEnabled, setClassificationEnabled] = useState(true);

  useEffect(() => {
    const preferred = readStoredClassificationEnabled();
    setClassificationEnabled(preferred);
    void syncSettings(preferred).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[web] ${message}`);
    });
  }, []);

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

  const handleClassificationToggle = (enabled: boolean): void => {
    setClassificationEnabled(enabled);
    localStorage.setItem(CLASSIFICATION_ENABLED_KEY, String(enabled));
    void syncSettings(enabled).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[web] ${message}`);
    });
  };

  const classificationToggle = (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
      <input
        type="checkbox"
        checked={classificationEnabled}
        onChange={(event) => {
          handleClassificationToggle(event.target.checked);
        }}
        className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-neutral-200"
      />
      Classification
    </label>
  );

  if (panel.status === "loading") {
    return (
      <main className={shellClassName}>
        <div className={`${contentClassName} text-neutral-400`}>
          {pickSpinnerVerb("loading")}…
        </div>
      </main>
    );
  }

  if (panel.status === "error") {
    return (
      <main className={shellClassName}>
        <div className={contentClassName}>
          <div className="mb-6 flex items-center justify-between gap-4">
            <h1 className="text-xl font-medium tracking-tight">Pryladova</h1>
            {classificationToggle}
          </div>
          <div className="text-red-400">API unreachable: {panel.message}</div>
        </div>
      </main>
    );
  }

  if (panel.status === "empty") {
    return (
      <main className={shellClassName}>
        <div className={contentClassName}>
          <div className="mb-6 flex items-center justify-between gap-4">
            <h1 className="text-xl font-medium tracking-tight">Pryladova</h1>
            {classificationToggle}
          </div>
          <div className="text-neutral-400">
            {pickSpinnerVerb("waiting-for-telemetry")}…
          </div>
        </div>
      </main>
    );
  }

  const { telemetry } = panel;

  return (
    <main className={shellClassName}>
      <div className={contentClassName}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-xl font-medium tracking-tight">Pryladova</h1>
          {classificationToggle}
        </div>
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

        <section className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
          <h2 className="mb-3 text-sm font-medium text-neutral-300">Classification</h2>
          {renderClassificationBody(telemetry, classificationEnabled)}
        </section>
      </div>
    </main>
  );
};
