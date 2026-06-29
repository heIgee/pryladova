import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Injectable } from "@nestjs/common";
import {
  isRedactedTelemetry,
  type WindowClassification,
  windowClassificationSchema,
} from "@pryladova/shared";
import { generateObject } from "ai";
import { loadConfig } from "../config.js";
import { SettingsService } from "../settings/settings.service.js";

const CACHE_MAX_ENTRIES = 256;

@Injectable()
export class ClassificationService {
  private readonly cache = new Map<string, WindowClassification>();
  private warnedMissingKey = false;

  constructor(private readonly settingsService: SettingsService) {}

  async classify(appName: string, windowTitle: string): Promise<WindowClassification | null> {
    if (!this.settingsService.isClassificationEnabled()) {
      return null;
    }

    if (isRedactedTelemetry(appName, windowTitle)) {
      return null;
    }

    const cacheKey = `${appName}|${windowTitle}`;
    const cached = this.readCache(cacheKey);
    if (cached) {
      console.log(
        `[api] classification cache hit 0ms key=${JSON.stringify(cacheKey)} ${JSON.stringify(cached)}`,
      );
      return cached;
    }

    const config = loadConfig();
    if (!config.geminiApiKey) {
      if (!this.warnedMissingKey) {
        console.warn("[api] GEMINI_API_KEY not set — classification disabled");
        this.warnedMissingKey = true;
      }
      return null;
    }

    const started = performance.now();

    try {
      const google = createGoogleGenerativeAI({ apiKey: config.geminiApiKey });
      const { object } = await generateObject({
        model: google(config.geminiModel),
        schema: windowClassificationSchema,
        prompt: `Analyze the following active window.
Application name (from OS): "${appName}"
Window title: "${windowTitle}"

Categorize it strictly into one of the allowed categories.
Extract the base application name without extra document titles.
For workRelated: use "yes" only when clearly work/dev; "no" when clearly personal or leisure; "maybe" when ambiguous (e.g. generic browsing, mixed personal/work browser profile, title lacks enough context).`,
      });

      const elapsedMs = Math.round(performance.now() - started);
      this.writeCache(cacheKey, object);
      console.log(
        `[api] classification gemini ${elapsedMs}ms model=${config.geminiModel} key=${JSON.stringify(cacheKey)} ${JSON.stringify(object)}`,
      );
      return object;
    } catch (error: unknown) {
      const elapsedMs = Math.round(performance.now() - started);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[api] classification failed ${elapsedMs}ms: ${message}`);
      return null;
    }
  }

  private readCache(key: string): WindowClassification | undefined {
    const value = this.cache.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  private writeCache(key: string, value: WindowClassification): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);
    if (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
  }
}
