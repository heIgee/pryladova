import {
  GITHUB_STATUS_ROUTE,
  type GithubStatusResponse,
  parseGithubStatusResponse,
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
