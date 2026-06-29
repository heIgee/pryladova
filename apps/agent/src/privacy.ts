import { basename } from "node:path";
import { SECURE_APP_NAME, SECURE_WINDOW_TITLE, type TelemetryPayload } from "@pryladova/shared";

export type RawWindowSnapshot = {
  title: string;
  owner: {
    name: string;
    path?: string;
  };
};

const DEFAULT_BLOCKED_APPS = [
  "1password",
  "bitwarden",
  "keepass",
  "keepassxc",
  "lastpass",
  "dashlane",
  "enpass",
  "nordpass",
  "roboform",
  "keeper",
  "putty",
  "puttygen",
  "mremoteng",
  "royalts",
  "termius",
  "mobaxterm",
  "mstsc",
  "teamviewer",
  "anydesk",
  "parsec",
  "rustdesk",
  "exodus",
  "electrum",
  "ledger live",
  "trezor suite",
  "wasabi",
  "authy",
  "winauth",
  "credentialuibroker",
] as const;

const EMAIL_PATTERN =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;

const WINDOWS_PATH_PATTERN = /[A-Za-z]:\\[^\s"<>|*?]+/g;
const UNC_PATH_PATTERN = /\\\\[^\s"<>|*?]+/g;

const normalizeAppToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, "");

const buildBlockedApps = (extraApps: string[]): Set<string> => {
  const blocked = new Set<string>();
  for (const app of DEFAULT_BLOCKED_APPS) {
    blocked.add(normalizeAppToken(app));
  }
  for (const app of extraApps) {
    const normalized = normalizeAppToken(app);
    if (normalized) {
      blocked.add(normalized);
    }
  }
  return blocked;
};

const collectAppTokens = (snapshot: RawWindowSnapshot): string[] => {
  const tokens = [normalizeAppToken(snapshot.owner.name)];
  if (snapshot.owner.path) {
    tokens.push(normalizeAppToken(basename(snapshot.owner.path)));
  }
  return tokens;
};

const isBlockedApp = (snapshot: RawWindowSnapshot, blockedApps: Set<string>): boolean =>
  collectAppTokens(snapshot).some((token) => blockedApps.has(token));

const redactWindowTitle = (title: string): string =>
  title
    .replace(EMAIL_PATTERN, "[email]")
    .replace(WINDOWS_PATH_PATTERN, "[path]")
    .replace(UNC_PATH_PATTERN, "[path]");

export const sanitizeSnapshot = (
  snapshot: RawWindowSnapshot,
  blockedApps: Set<string>,
): Pick<TelemetryPayload, "appName" | "windowTitle"> => {
  if (isBlockedApp(snapshot, blockedApps)) {
    return {
      appName: SECURE_APP_NAME,
      windowTitle: SECURE_WINDOW_TITLE,
    };
  }

  return {
    appName: snapshot.owner.name,
    windowTitle: redactWindowTitle(snapshot.title),
  };
};

export const createBlockedAppsSet = (extraApps: string[]): Set<string> =>
  buildBlockedApps(extraApps);
