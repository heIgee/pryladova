import { useEffect, useState } from "react";
import {
  AGENT_HINT_AFTER_MS,
  CLASSIFICATION_ENABLED_KEY,
  fetchTelemetry,
  getAgentLastSeenMs,
  type PanelState,
  POLL_INTERVAL_MS,
  readStoredClassificationEnabled,
  syncSettings,
} from "@/lib/panel";
import { persistTheme, resolveTheme, type Theme } from "@/lib/theme";

export const useDashboard = () => {
  const [panel, setPanel] = useState<PanelState>({ status: "loading" });
  const [classificationEnabled, setClassificationEnabled] = useState(false);
  const [showAgentHint, setShowAgentHint] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());

  useEffect(() => {
    const preferred = readStoredClassificationEnabled();
    setClassificationEnabled(preferred);
    void syncSettings(preferred).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[web] ${message}`);
    });
  }, []);

  useEffect(() => {
    if (panel.status === "loading") {
      setShowAgentHint(false);
      return;
    }

    if (panel.status === "error" || panel.status === "empty") {
      const timer = window.setTimeout(() => {
        setShowAgentHint(true);
      }, AGENT_HINT_AFTER_MS);

      return () => {
        window.clearTimeout(timer);
      };
    }

    const lastSeenMs = getAgentLastSeenMs(panel);
    if (lastSeenMs === null) {
      setShowAgentHint(false);
      return;
    }

    setShowAgentHint(Date.now() - lastSeenMs >= AGENT_HINT_AFTER_MS);
  }, [panel]);

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
    void syncSettings(enabled)
      .then(async () => {
        const next = await fetchTelemetry();
        setPanel(next);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`[web] ${message}`);
      });
  };

  const handleThemeChange = (next: Theme): void => {
    setTheme(next);
    persistTheme(next);
  };

  return {
    panel,
    classificationEnabled,
    showAgentHint,
    theme,
    handleClassificationToggle,
    handleThemeChange,
  };
};
