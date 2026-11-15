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

type HubSettingsUpsert = Record<string, unknown>;

const createHubSettingsMock = (options: {
  selectResults?: { data: unknown; error: unknown }[];
  upsertErrors?: unknown[];
}) => {
  const selectResults = [...(options.selectResults ?? [])];
  const upsertErrors = [...(options.upsertErrors ?? [])];
  const upserts: HubSettingsUpsert[] = [];
  const selectedColumns: string[] = [];

  const from = vi.fn(() => ({
    upsert: vi.fn(async (row: HubSettingsUpsert) => {
      upserts.push(row);
      return { error: upsertErrors.shift() ?? null };
    }),
    select: vi.fn((columns: string) => {
      selectedColumns.push(columns);
      return {
        eq: () => ({
          maybeSingle: async () => selectResults.shift() ?? { data: null, error: null },
        }),
      };
    }),
  }));

  const supabase = {
    isConfigured: () => true,
    getClient: () => ({ from }),
  } as unknown as SupabaseService;

  return { supabase, upserts, selectedColumns };
};

describe("SettingsService Google OAuth storage", () => {
  it("loads the encrypted token and account email on boot", async () => {
    const { supabase } = createHubSettingsMock({
      selectResults: [
        {
          data: {
            classification_enabled: false,
            google_refresh_token_encrypted: "enc-token",
            google_account_email: "me@example.com",
          },
          error: null,
        },
      ],
    });
    const service = new SettingsService(supabase);
    await service.onModuleInit();

    expect(service.hasGoogleRefreshTokenEncrypted()).toBe(true);
    expect(service.getGoogleRefreshTokenEncrypted()).toBe("enc-token");
    expect(service.getGoogleAccountEmail()).toBe("me@example.com");
    expect(service.canPersistGoogleOAuth()).toBe(true);
  });

  it("retries the boot load without the email column on older schemas", async () => {
    const { supabase, selectedColumns } = createHubSettingsMock({
      selectResults: [
        { data: null, error: { message: "column missing", code: "PGRST204" } },
        {
          data: { classification_enabled: true, google_refresh_token_encrypted: "enc-token" },
          error: null,
        },
      ],
    });
    const service = new SettingsService(supabase);
    await service.onModuleInit();

    expect(selectedColumns).toEqual([
      "classification_enabled, google_refresh_token_encrypted, google_account_email",
      "classification_enabled, google_refresh_token_encrypted",
    ]);
    expect(service.isClassificationEnabled()).toBe(true);
    expect(service.getGoogleRefreshTokenEncrypted()).toBe("enc-token");
    expect(service.getGoogleAccountEmail()).toBeNull();
  });

  it("keeps defaults when the boot load fails", async () => {
    const { supabase } = createHubSettingsMock({
      selectResults: [{ data: null, error: { message: "boom" } }],
    });
    const service = new SettingsService(supabase);
    await service.onModuleInit();

    expect(service.getSettings()).toEqual({ classificationEnabled: false });
    expect(service.hasGoogleRefreshTokenEncrypted()).toBe(false);
  });

  it("stores the token only after a successful upsert", async () => {
    const { supabase, upserts } = createHubSettingsMock({
      upsertErrors: [{ message: "write failed" }],
    });
    const service = new SettingsService(supabase);

    await expect(service.saveGoogleRefreshTokenEncrypted("enc-1")).resolves.toBe(false);
    expect(service.hasGoogleRefreshTokenEncrypted()).toBe(false);

    await expect(service.saveGoogleRefreshTokenEncrypted("enc-2")).resolves.toBe(true);
    expect(service.getGoogleRefreshTokenEncrypted()).toBe("enc-2");
    expect(upserts.at(-1)).toMatchObject({ id: 1, google_refresh_token_encrypted: "enc-2" });
  });

  it("does not persist the token without Supabase", async () => {
    const service = new SettingsService(createSupabaseServiceMock());
    await expect(service.saveGoogleRefreshTokenEncrypted("enc")).resolves.toBe(false);
    expect(service.hasGoogleRefreshTokenEncrypted()).toBe(false);
    expect(service.canPersistGoogleOAuth()).toBe(false);
  });

  it("keeps the stored token when classification settings are persisted", async () => {
    const { supabase, upserts } = createHubSettingsMock({});
    const service = new SettingsService(supabase);
    await service.saveGoogleRefreshTokenEncrypted("enc");

    await expect(service.saveSettings({ classificationEnabled: true })).resolves.toEqual({
      classificationEnabled: true,
      persisted: true,
    });
    expect(upserts.at(-1)).toMatchObject({
      classification_enabled: true,
      google_refresh_token_encrypted: "enc",
    });
  });

  it("reports persisted false when the settings upsert fails", async () => {
    const { supabase } = createHubSettingsMock({ upsertErrors: [{ message: "nope" }] });
    const service = new SettingsService(supabase);
    await expect(service.saveSettings({ classificationEnabled: true })).resolves.toEqual({
      classificationEnabled: true,
      persisted: false,
    });
  });

  it("remembers the account email in memory even when persistence fails", async () => {
    const { supabase } = createHubSettingsMock({
      upsertErrors: [{ message: "permission denied", code: "42501" }],
    });
    const service = new SettingsService(supabase);

    await expect(service.saveGoogleAccountEmail("me@example.com")).resolves.toBe(false);
    expect(service.getGoogleAccountEmail()).toBe("me@example.com");

    const offline = new SettingsService(createSupabaseServiceMock());
    await expect(offline.saveGoogleAccountEmail("me@example.com")).resolves.toBe(false);
    expect(offline.getGoogleAccountEmail()).toBe("me@example.com");
  });

  it("clears the token and email, then nulls the email column", async () => {
    const { supabase, upserts } = createHubSettingsMock({});
    const service = new SettingsService(supabase);
    await service.saveGoogleRefreshTokenEncrypted("enc");
    await service.saveGoogleAccountEmail("me@example.com");

    await expect(service.clearGoogleRefreshTokenEncrypted()).resolves.toBe(true);

    expect(service.hasGoogleRefreshTokenEncrypted()).toBe(false);
    expect(service.getGoogleAccountEmail()).toBeNull();
    expect(upserts.slice(-2)).toEqual([
      expect.objectContaining({ google_refresh_token_encrypted: null }),
      expect.objectContaining({ google_refresh_token_encrypted: null, google_account_email: null }),
    ]);
  });

  it("keeps the token when clearing fails", async () => {
    const { supabase } = createHubSettingsMock({ upsertErrors: [null, { message: "down" }] });
    const service = new SettingsService(supabase);
    await service.saveGoogleRefreshTokenEncrypted("enc");

    await expect(service.clearGoogleRefreshTokenEncrypted()).resolves.toBe(false);
    expect(service.getGoogleRefreshTokenEncrypted()).toBe("enc");
  });

  it("clears in memory without Supabase", async () => {
    const service = new SettingsService(createSupabaseServiceMock());
    await service.saveGoogleAccountEmail("me@example.com");

    await expect(service.clearGoogleRefreshTokenEncrypted()).resolves.toBe(true);
    expect(service.getGoogleAccountEmail()).toBeNull();
  });
});
