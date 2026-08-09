import { Test } from "@nestjs/testing";
import { SECURE_APP_NAME, SECURE_WINDOW_TITLE } from "@pryladova/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigService } from "../config.service.js";
import { SupabaseService } from "../persistence/supabase.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { createSupabaseServiceMock } from "../test/persistence-mocks.js";
import { ClassificationService } from "./classification.service.js";

const { generateObjectMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
}));

vi.mock("ai", () => ({
  generateObject: generateObjectMock,
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => (model: string) => model),
}));

const classification = {
  category: "Coding" as const,
  displayAppName: "Code",
  workRelated: "yes" as const,
};

const createService = async (options?: {
  geminiApiKey?: string | undefined;
  supabase?: SupabaseService;
}) => {
  const geminiApiKey =
    options !== undefined && "geminiApiKey" in options ? options.geminiApiKey : "test-key";

  const moduleRef = await Test.createTestingModule({
    providers: [
      ClassificationService,
      SettingsService,
      {
        provide: ConfigService,
        useValue: {
          config: {
            geminiApiKey,
            geminiModel: "gemini-3.1-flash-lite",
            ingestSecret: undefined,
            supabaseUrl: undefined,
            supabaseSecretKey: undefined,
          },
        },
      },
      {
        provide: SupabaseService,
        useValue: options?.supabase ?? createSupabaseServiceMock(),
      },
    ],
  }).compile();

  return {
    service: moduleRef.get(ClassificationService),
    settingsService: moduleRef.get(SettingsService),
  };
};

describe("ClassificationService", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
    generateObjectMock.mockResolvedValue({ object: classification });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when classification is disabled", async () => {
    const { service } = await createService();
    await expect(service.classify("Code", "app.tsx")).resolves.toBeNull();
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("returns null for redacted telemetry", async () => {
    const { service, settingsService } = await createService();
    settingsService.applySettings({ classificationEnabled: true });
    await expect(service.classify(SECURE_APP_NAME, SECURE_WINDOW_TITLE)).resolves.toBeNull();
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("uses memory cache on repeated inputs", async () => {
    const { service, settingsService } = await createService();
    settingsService.applySettings({ classificationEnabled: true });

    await expect(service.classify("Code", "app.tsx")).resolves.toEqual(classification);
    await expect(service.classify("Code", "app.tsx")).resolves.toEqual(classification);

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("uses db cache when memory is cold", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        app_name: "Code",
        window_title: "app.tsx",
        classification,
        updated_at: new Date().toISOString(),
      },
      error: null,
    });
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      })),
    }));
    const { service, settingsService } = await createService({
      supabase: {
        isConfigured: () => true,
        getClient: () => ({ from }),
      },
    });
    settingsService.applySettings({ classificationEnabled: true });

    await expect(service.classify("Code", "app.tsx")).resolves.toEqual(classification);
    await expect(service.classify("Code", "app.tsx")).resolves.toEqual(classification);

    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("classification_cache");
  });

  it("reclassifies when the db cache row is expired", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        app_name: "Code",
        window_title: "app.tsx",
        classification,
        updated_at: "2026-01-01T12:00:00.000Z",
      },
      error: null,
    });
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockReturnThis(),
        maybeSingle,
      })),
    }));
    const { service, settingsService } = await createService({
      supabase: {
        isConfigured: () => true,
        getClient: () => ({ from }),
      },
    });
    settingsService.applySettings({ classificationEnabled: true });

    await expect(service.classify("Code", "app.tsx")).resolves.toEqual(classification);

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("persists gemini results to db", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "classification_cache") {
        return { upsert };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      };
    });
    const { service, settingsService } = await createService({
      supabase: {
        isConfigured: () => true,
        getClient: () => ({ from }),
      },
    });
    settingsService.applySettings({ classificationEnabled: true });

    await service.classify("Code", "app.tsx");
    await vi.waitFor(() => {
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          app_name: "Code",
          window_title: "app.tsx",
          classification,
        }),
        { onConflict: "app_name,window_title" },
      );
    });
  });

  it("escapes quotes in prompt metadata", async () => {
    const { service, settingsService } = await createService();
    settingsService.applySettings({ classificationEnabled: true });
    await service.classify('App "evil"', 'Title with "quotes"');
    const call = generateObjectMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain('App \\"evil\\"');
    expect(call.prompt).toContain('Title with \\"quotes\\"');
  });

  it("returns null when Gemini fails", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("upstream failure"));
    const { service, settingsService } = await createService();
    settingsService.applySettings({ classificationEnabled: true });
    await expect(service.classify("Code", "app.tsx")).resolves.toBeNull();
  });

  it("returns null when API key is missing", async () => {
    const { service, settingsService } = await createService({ geminiApiKey: undefined });
    settingsService.applySettings({ classificationEnabled: true });
    await expect(service.classify("Code", "app.tsx")).resolves.toBeNull();
    expect(generateObjectMock).not.toHaveBeenCalled();
  });
});
