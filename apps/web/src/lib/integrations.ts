import {
  GITHUB_STATUS_ROUTE,
  type GithubStatusResponse,
  GOOGLE_CALENDAR_STATUS_ROUTE,
  GOOGLE_TASKS_STATUS_ROUTE,
  type GoogleCalendarStatusResponse,
  type GoogleTasksStatusResponse,
  parseGithubStatusResponse,
  parseGoogleCalendarStatusResponse,
  parseGoogleTasksStatusResponse,
  parseSteamStatusResponse,
  STEAM_STATUS_ROUTE,
  type SteamStatusResponse,
} from "@pryladova/shared";
import { apiFetch } from "./api-fetch.js";

const buildIntegrationUrl = (route: string, refresh = false): string =>
  refresh ? `${route}?refresh=1` : route;

export const fetchGithubStatus = async (options?: {
  refresh?: boolean;
}): Promise<GithubStatusResponse> => {
  try {
    const response = await apiFetch(buildIntegrationUrl(GITHUB_STATUS_ROUTE, options?.refresh));
    if (!response.ok) {
      return { status: "unavailable" };
    }
    const json: unknown = await response.json();
    return parseGithubStatusResponse(json);
  } catch {
    return { status: "unavailable" };
  }
};

export const fetchSteamStatus = async (options?: {
  refresh?: boolean;
}): Promise<SteamStatusResponse> => {
  try {
    const response = await apiFetch(buildIntegrationUrl(STEAM_STATUS_ROUTE, options?.refresh));
    if (!response.ok) {
      return { status: "unavailable" };
    }
    const json: unknown = await response.json();
    return parseSteamStatusResponse(json);
  } catch {
    return { status: "unavailable" };
  }
};

export const fetchGoogleCalendarStatus = async (options?: {
  refresh?: boolean;
}): Promise<GoogleCalendarStatusResponse> => {
  try {
    const response = await apiFetch(
      buildIntegrationUrl(GOOGLE_CALENDAR_STATUS_ROUTE, options?.refresh),
    );
    if (!response.ok) {
      return { status: "unavailable" };
    }
    const json: unknown = await response.json();
    return parseGoogleCalendarStatusResponse(json);
  } catch {
    return { status: "unavailable" };
  }
};

export const fetchGoogleTasksStatus = async (options?: {
  refresh?: boolean;
}): Promise<GoogleTasksStatusResponse> => {
  try {
    const response = await apiFetch(
      buildIntegrationUrl(GOOGLE_TASKS_STATUS_ROUTE, options?.refresh),
    );
    if (!response.ok) {
      return { status: "unavailable" };
    }
    const json: unknown = await response.json();
    return parseGoogleTasksStatusResponse(json);
  } catch {
    return { status: "unavailable" };
  }
};
