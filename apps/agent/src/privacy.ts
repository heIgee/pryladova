import { basename } from "node:path/win32";
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

const WINDOWS_PATH_PATTERN = /[A-Za-z]:\\(?:[^"<>|*?]+(?:\\[^"<>|*?]+)*)/g;
const UNC_PATH_PATTERN = /\\\\(?:[^"<>|*?]+(?:\\[^"<>|*?]+)*)/g;

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
  return tokens.filter((token) => token.length > 0);
};

export const resolveAppName = (snapshot: RawWindowSnapshot): string | null => {
  const fromName = snapshot.owner.name.trim();
  if (fromName) {
    return fromName;
  }

  if (snapshot.owner.path) {
    const fromPath = basename(snapshot.owner.path)
      .replace(/\.exe$/i, "")
      .trim();
    if (fromPath) {
      return fromPath;
    }
  }

  return null;
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
    appName: resolveAppName(snapshot)!,
    windowTitle: redactWindowTitle(snapshot.title.trim()),
  };
};

export const createBlockedAppsSet = (extraApps: string[]): Set<string> =>
  buildBlockedApps(extraApps);

export const shouldOmitHostMedia = (
  snapshot: RawWindowSnapshot | undefined,
  blockedApps: Set<string>,
): boolean => snapshot !== undefined && isBlockedApp(snapshot, blockedApps);
