import { Test } from "@nestjs/testing";
import { SECURE_APP_NAME, SECURE_WINDOW_TITLE } from "@pryladova/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigService } from "../config.service.js";
import { SettingsService } from "../settings/settings.service.js";
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

const createService = async (options?: { geminiApiKey?: string | undefined }) => {
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
          },
        },
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
    settingsService.setSettings({ classificationEnabled: true });
    await expect(service.classify(SECURE_APP_NAME, SECURE_WINDOW_TITLE)).resolves.toBeNull();
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("uses cache on repeated inputs", async () => {
    const { service, settingsService } = await createService();
    settingsService.setSettings({ classificationEnabled: true });

    await expect(service.classify("Code", "app.tsx")).resolves.toEqual(classification);
    await expect(service.classify("Code", "app.tsx")).resolves.toEqual(classification);

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("escapes quotes in prompt metadata", async () => {
    const { service, settingsService } = await createService();
    settingsService.setSettings({ classificationEnabled: true });
    await service.classify('App "evil"', 'Title with "quotes"');
    const call = generateObjectMock.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain('App \\"evil\\"');
    expect(call.prompt).toContain('Title with \\"quotes\\"');
  });

  it("returns null when Gemini fails", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("upstream failure"));
    const { service, settingsService } = await createService();
    settingsService.setSettings({ classificationEnabled: true });
    await expect(service.classify("Code", "app.tsx")).resolves.toBeNull();
  });

  it("returns null when API key is missing", async () => {
    const { service, settingsService } = await createService({ geminiApiKey: undefined });
    settingsService.setSettings({ classificationEnabled: true });
    await expect(service.classify("Code", "app.tsx")).resolves.toBeNull();
    expect(generateObjectMock).not.toHaveBeenCalled();
  });
});
