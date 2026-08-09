import type { GithubStatusResponse, SteamStatusResponse } from "@pryladova/shared";

export type IntegrationLoading = { status: "loading" };

export type GithubTileStatus = GithubStatusResponse | IntegrationLoading;
export type SteamTileStatus = SteamStatusResponse | IntegrationLoading;

export const integrationLoading: IntegrationLoading = { status: "loading" };

export const isIntegrationLoading = (
  status: GithubTileStatus | SteamTileStatus,
): status is IntegrationLoading => status.status === "loading";
