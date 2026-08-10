import type {
  GithubStatusResponse,
  GoogleCalendarStatusResponse,
  GoogleTasksStatusResponse,
  SteamStatusResponse,
} from "@pryladova/shared";

export type IntegrationLoading = { status: "loading" };

export type GithubTileStatus = GithubStatusResponse | IntegrationLoading;
export type SteamTileStatus = SteamStatusResponse | IntegrationLoading;
export type GoogleCalendarTileStatus = GoogleCalendarStatusResponse | IntegrationLoading;
export type GoogleTasksTileStatus = GoogleTasksStatusResponse | IntegrationLoading;

export const integrationLoading: IntegrationLoading = { status: "loading" };

export const isIntegrationLoading = (
  status: GithubTileStatus | SteamTileStatus | GoogleCalendarTileStatus | GoogleTasksTileStatus,
): status is IntegrationLoading => status.status === "loading";

export const readGoogleAccountEmail = (
  calendar: GoogleCalendarTileStatus,
  tasks: GoogleTasksTileStatus,
): string | null => {
  if (calendar.status === "ready" && calendar.accountEmail) {
    return calendar.accountEmail;
  }
  if (tasks.status === "ready" && tasks.accountEmail) {
    return tasks.accountEmail;
  }
  return null;
};
