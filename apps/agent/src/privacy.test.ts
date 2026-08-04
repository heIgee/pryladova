import { SECURE_APP_NAME, SECURE_WINDOW_TITLE } from "@pryladova/shared";
import { describe, expect, it } from "vitest";
import { createBlockedAppsSet, sanitizeSnapshot } from "./privacy.js";

const snapshot = (title: string, name: string, path?: string) => ({
  title,
  owner: { name, path },
});

describe("sanitizeSnapshot", () => {
  it("redacts default blocklisted apps", () => {
    const blocked = createBlockedAppsSet([]);
    const result = sanitizeSnapshot(snapshot("Secrets", "1Password"), blocked);
    expect(result).toEqual({
      appName: SECURE_APP_NAME,
      windowTitle: SECURE_WINDOW_TITLE,
    });
  });

  it("redacts custom blocked apps", () => {
    const blocked = createBlockedAppsSet(["MySecretApp"]);
    const result = sanitizeSnapshot(snapshot("Title", "MySecretApp"), blocked);
    expect(result.appName).toBe(SECURE_APP_NAME);
  });

  it("redacts emails in window titles", () => {
    const blocked = createBlockedAppsSet([]);
    const result = sanitizeSnapshot(snapshot("Inbox — user@example.com", "Outlook"), blocked);
    expect(result.windowTitle).toBe("Inbox — [email]");
    expect(result.appName).toBe("Outlook");
  });

  it("redacts Windows paths in window titles", () => {
    const blocked = createBlockedAppsSet([]);
    const result = sanitizeSnapshot(snapshot("Editing C:\\Users\\me\\secret.txt", "Code"), blocked);
    expect(result.windowTitle).toBe("Editing [path]");
  });

  it("redacts UNC paths in window titles", () => {
    const blocked = createBlockedAppsSet([]);
    const result = sanitizeSnapshot(
      snapshot("File on \\\\server\\share\\doc.txt", "Code"),
      blocked,
    );
    expect(result.windowTitle).toBe("File on [path]");
  });

  it("passes through normal titles", () => {
    const blocked = createBlockedAppsSet([]);
    const result = sanitizeSnapshot(snapshot("app.tsx — pryladova", "Code"), blocked);
    expect(result).toEqual({
      appName: "Code",
      windowTitle: "app.tsx — pryladova",
    });
  });

  it("matches blocklist via executable path token", () => {
    const blocked = createBlockedAppsSet([]);
    const result = sanitizeSnapshot(
      snapshot("Session", "Remote Desktop", "C:\\Windows\\System32\\mstsc.exe"),
      blocked,
    );
    expect(result.appName).toBe(SECURE_APP_NAME);
  });
});
