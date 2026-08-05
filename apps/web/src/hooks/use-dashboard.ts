import type { WeatherResponse } from "@pryladova/shared";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  AGENT_HINT_AFTER_MS,
  CLASSIFICATION_ENABLED_KEY,
  getAgentLastSeenMs,
  readStoredClassificationEnabled,
  syncSettings,
  WEATHER_POLL_INTERVAL_MS,
} from "@/lib/panel";
import { getPanelPollSnapshot, refreshPanelPoll, subscribePanelPoll } from "@/lib/panel-poll";
import { persistTheme, resolveTheme, type Theme } from "@/lib/theme";
import { fetchWeather } from "@/lib/weather";
import {
  persistWeatherLocation,
  readStoredWeatherLocation,
  type WeatherLocation,
} from "@/lib/weather-location";

export const useDashboard = () => {
  const panel = useSyncExternalStore(
    subscribePanelPoll,
    getPanelPollSnapshot,
    getPanelPollSnapshot,
  );
  const [classificationEnabled, setClassificationEnabled] = useState(false);
  const [showAgentHint, setShowAgentHint] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());
  const [weather, setWeather] = useState<WeatherResponse>({ status: "disabled" });
  const [weatherLocation, setWeatherLocation] = useState<WeatherLocation | null>(() =>
    readStoredWeatherLocation(),
  );

  const loadWeather = useCallback(
    async (location: WeatherLocation | null, refresh = false): Promise<void> => {
      const next = await fetchWeather(location, { refresh });
      setWeather(next);
    },
    [],
  );

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

    const refresh = async (): Promise<void> => {
      const next = await fetchWeather(weatherLocation);
      if (active) {
        setWeather(next);
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, WEATHER_POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [weatherLocation]);

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

  const handleClassificationToggle = (enabled: boolean): void => {
    setClassificationEnabled(enabled);
    localStorage.setItem(CLASSIFICATION_ENABLED_KEY, String(enabled));
    void syncSettings(enabled)
      .then(() => {
        refreshPanelPoll();
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

  const handleWeatherLocationChange = (location: WeatherLocation): void => {
    persistWeatherLocation(location);
    setWeatherLocation(location);
  };

  const handleWeatherRefresh = async (): Promise<void> => {
    await loadWeather(weatherLocation, true);
  };

  return {
    panel,
    classificationEnabled,
    showAgentHint,
    theme,
    weather,
    weatherLocation,
    handleClassificationToggle,
    handleThemeChange,
    handleWeatherLocationChange,
    handleWeatherRefresh,
  };
};
