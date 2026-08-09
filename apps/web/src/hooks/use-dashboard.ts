import type { WeatherResponse } from "@pryladova/shared";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { GithubTileStatus, SteamTileStatus } from "@/lib/integration-status";
import { integrationLoading } from "@/lib/integration-status";
import { fetchGithubStatus, fetchSteamStatus } from "@/lib/integrations";
import {
  AGENT_HINT_AFTER_MS,
  fetchSettings,
  INTEGRATIONS_POLL_INTERVAL_MS,
  isAgentStale,
  persistClassificationEnabled,
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
  const [classificationEnabled, setClassificationEnabled] = useState(() =>
    readStoredClassificationEnabled(),
  );
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSyncing, setSettingsSyncing] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [showAgentHint, setShowAgentHint] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());
  const [weather, setWeather] = useState<WeatherResponse>({ status: "disabled" });
  const [githubStatus, setGithubStatus] = useState<GithubTileStatus>(integrationLoading);
  const [steamStatus, setSteamStatus] = useState<SteamTileStatus>(integrationLoading);
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
    let active = true;

    const loadSettings = async (): Promise<void> => {
      try {
        const settings = await fetchSettings();
        if (!active) {
          return;
        }
        setClassificationEnabled(settings.classificationEnabled);
        persistClassificationEnabled(settings.classificationEnabled);
        setSettingsError(null);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`[web] ${message}`);

        if (!active) {
          return;
        }

        setSettingsError("Could not load classification setting");
      } finally {
        if (active) {
          setSettingsReady(true);
        }
      }
    };

    void loadSettings();

    return () => {
      active = false;
    };
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
    let active = true;

    const refreshIntegrations = async (refresh = false): Promise<void> => {
      const [github, steam] = await Promise.all([
        fetchGithubStatus({ refresh }),
        fetchSteamStatus({ refresh }),
      ]);
      if (active) {
        setGithubStatus(github);
        setSteamStatus(steam);
      }
    };

    void refreshIntegrations(true);
    const timer = window.setInterval(() => {
      void refreshIntegrations();
    }, INTEGRATIONS_POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
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

    const evaluate = (): void => {
      setShowAgentHint(isAgentStale(panel));
    };

    evaluate();
    const timer = window.setInterval(evaluate, 1_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [panel]);

  const handleClassificationToggle = (enabled: boolean): void => {
    if (settingsSyncing) {
      return;
    }

    setSettingsSyncing(true);
    setSettingsError(null);

    void syncSettings(enabled)
      .then((result) => {
        setClassificationEnabled(result.classificationEnabled);
        persistClassificationEnabled(result.classificationEnabled);
        if (!result.persisted) {
          setSettingsError("Setting applied but not saved to database");
        }
        refreshPanelPoll();
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`[web] ${message}`);
        setSettingsError("Could not save classification setting");
      })
      .finally(() => {
        setSettingsSyncing(false);
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
    settingsError,
    settingsSyncing,
    settingsReady,
    showAgentHint,
    theme,
    weather,
    weatherLocation,
    githubStatus,
    steamStatus,
    handleClassificationToggle,
    handleThemeChange,
    handleWeatherLocationChange,
    handleWeatherRefresh,
  };
};
