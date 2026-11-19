import type { WeatherResponse } from "@pryladova/shared";
import { useEffect, useState, useSyncExternalStore } from "react";
import type {
  GithubTileStatus,
  GoogleCalendarTileStatus,
  GoogleTasksTileStatus,
  SteamTileStatus,
} from "@/lib/integration-status";
import { integrationLoading } from "@/lib/integration-status";
import {
  fetchGithubStatus,
  fetchGoogleCalendarStatus,
  fetchGoogleTasksStatus,
  fetchSteamStatus,
} from "@/lib/integrations";
import {
  fetchSettings,
  INTEGRATIONS_POLL_INTERVAL_MS,
  isAgentLive,
  persistClassificationEnabled,
  readStoredClassificationEnabled,
  resolvePanelSubtitle,
  syncSettings,
  WEATHER_POLL_INTERVAL_MS,
} from "@/lib/panel";
import { getPanelPollSnapshot, refreshPanelPoll, subscribePanelPoll } from "@/lib/panel-poll";
import { persistTheme, resolveTheme, type Theme } from "@/lib/theme";
import { getWallClockMs, getWallClockServerMs, subscribeWallClock } from "@/lib/wall-clock";
import { fetchWeather } from "@/lib/weather";
import {
  persistWeatherLocation,
  readStoredWeatherLocation,
  type WeatherLocation,
} from "@/lib/weather-location";

export const useDashboard = () => {
  const { panel, streamConnected, connectFailed } = useSyncExternalStore(
    subscribePanelPoll,
    getPanelPollSnapshot,
    getPanelPollSnapshot,
  );
  const nowMs = useSyncExternalStore(subscribeWallClock, getWallClockMs, getWallClockServerMs);
  const [classificationEnabled, setClassificationEnabled] = useState(() =>
    readStoredClassificationEnabled(),
  );
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSyncing, setSettingsSyncing] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());
  const [weather, setWeather] = useState<WeatherResponse>({ status: "disabled" });
  const [githubStatus, setGithubStatus] = useState<GithubTileStatus>(integrationLoading);
  const [steamStatus, setSteamStatus] = useState<SteamTileStatus>(integrationLoading);
  const [googleCalendarStatus, setGoogleCalendarStatus] =
    useState<GoogleCalendarTileStatus>(integrationLoading);
  const [googleTasksStatus, setGoogleTasksStatus] =
    useState<GoogleTasksTileStatus>(integrationLoading);
  const [weatherLocation, setWeatherLocation] = useState<WeatherLocation | null>(() =>
    readStoredWeatherLocation(),
  );

  const loadWeather = async (location: WeatherLocation | null, refresh = false): Promise<void> => {
    const next = await fetchWeather(location, { refresh });
    setWeather(next);
  };

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

    const refreshIntegrations = (refresh = false): void => {
      const publish = <T>(load: () => Promise<T>, apply: (value: T) => void): void => {
        void load().then((value) => {
          if (active) {
            apply(value);
          }
        });
      };

      publish(() => fetchGithubStatus({ refresh }), setGithubStatus);
      publish(() => fetchSteamStatus({ refresh }), setSteamStatus);
      publish(() => fetchGoogleCalendarStatus({ refresh }), setGoogleCalendarStatus);
      publish(() => fetchGoogleTasksStatus({ refresh }), setGoogleTasksStatus);
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

  const panelSubtitle = resolvePanelSubtitle(panel, streamConnected, nowMs, connectFailed);
  const showAgentHint = panelSubtitle === "agent-unavailable";
  const agentLive = streamConnected && isAgentLive(panel, nowMs);

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
    panelSubtitle,
    showAgentHint,
    agentLive,
    streamConnected,
    connectFailed,
    theme,
    weather,
    weatherLocation,
    githubStatus,
    steamStatus,
    googleCalendarStatus,
    googleTasksStatus,
    nowMs,
    handleClassificationToggle,
    handleThemeChange,
    handleWeatherLocationChange,
    handleWeatherRefresh,
  };
};
