import { describe, expect, it } from "vitest";
import { SettingsService } from "./settings.service.js";

describe("SettingsService", () => {
  it("defaults classification to disabled", () => {
    const service = new SettingsService();
    expect(service.getSettings()).toEqual({ classificationEnabled: false });
  });

  it("persists classification toggle", () => {
    const service = new SettingsService();
    service.setSettings({ classificationEnabled: true });
    expect(service.getSettings()).toEqual({ classificationEnabled: true });
    expect(service.isClassificationEnabled()).toBe(true);
    service.setSettings({ classificationEnabled: false });
    expect(service.isClassificationEnabled()).toBe(false);
  });
});
