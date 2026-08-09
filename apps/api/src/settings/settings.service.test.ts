import { describe, expect, it, vi } from "vitest";
import type { SupabaseService } from "../persistence/supabase.service.js";
import { createSupabaseServiceMock } from "../test/persistence-mocks.js";
import { SettingsService } from "./settings.service.js";

const createConfiguredSupabaseMock = (options?: {
  upsertError?: Error | null;
  bootRow?: { classification_enabled: boolean } | null;
}): SupabaseService => {
  const upsert = vi.fn().mockResolvedValue({ error: options?.upsertError ?? null });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: options?.bootRow ?? { classification_enabled: true },
    error: null,
  });

  const from = vi.fn((table: string) => {
    if (table !== "hub_settings") {
      throw new Error(`unexpected table: ${table}`);
    }
    return {
      upsert,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle }),
      }),
    };
  });

  return {
    isConfigured: () => true,
    getClient: () => ({ from }),
  } as unknown as SupabaseService;
};

describe("SettingsService", () => {
  it("defaults classification to disabled and applies toggles in memory", () => {
    const service = new SettingsService(createSupabaseServiceMock());
    expect(service.getSettings()).toEqual({ classificationEnabled: false });

    service.applySettings({ classificationEnabled: true });
    expect(service.getSettings()).toEqual({ classificationEnabled: true });
    expect(service.isClassificationEnabled()).toBe(true);

    service.applySettings({ classificationEnabled: false });
    expect(service.isClassificationEnabled()).toBe(false);
  });

  it("returns persisted false when Supabase is not configured", async () => {
    const service = new SettingsService(createSupabaseServiceMock());
    const result = await service.saveSettings({ classificationEnabled: true });
    expect(result).toEqual({ classificationEnabled: true, persisted: false });
  });

  it("returns persisted true when Supabase upsert succeeds", async () => {
    const service = new SettingsService(createConfiguredSupabaseMock());
    const result = await service.saveSettings({ classificationEnabled: true });
    expect(result).toEqual({ classificationEnabled: true, persisted: true });
  });

  it("loads settings from the database on boot", async () => {
    const service = new SettingsService(
      createConfiguredSupabaseMock({ bootRow: { classification_enabled: true } }),
    );
    await service.onModuleInit();
    expect(service.getSettings()).toEqual({ classificationEnabled: true });
  });
});
