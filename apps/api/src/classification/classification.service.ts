import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Injectable, Logger } from "@nestjs/common";
import {
  isRedactedTelemetry,
  type WindowClassification,
  windowClassificationSchema,
} from "@pryladova/shared";
import { generateObject } from "ai";
import { ConfigService } from "../config.service.js";
import { formatPersistenceError, isSchemaMissingError } from "../persistence/persistence-error.js";
import { SupabaseService } from "../persistence/supabase.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { parseClassificationCacheRow } from "./classification-cache.logic.js";

const CACHE_MAX_ENTRIES = 256;

const escapePromptField = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);
  private readonly cache = new Map<string, WindowClassification>();
  private warnedMissingKey = false;
  private schemaMissingLogged = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly supabaseService: SupabaseService,
  ) {}

  isGeminiConfigured(): boolean {
    return Boolean(this.configService.config.geminiApiKey);
  }

  async classify(appName: string, windowTitle: string): Promise<WindowClassification | null> {
    if (!this.settingsService.isClassificationEnabled()) {
      return null;
    }

    if (isRedactedTelemetry(appName, windowTitle)) {
      return null;
    }

    const cacheKey = `${appName}|${windowTitle}`;
    const memoryCached = this.readMemoryCache(cacheKey);
    if (memoryCached) {
      console.log(
        `[api] classification cache hit memory category=${memoryCached.category} workRelated=${memoryCached.workRelated}`,
      );
      return memoryCached;
    }

    const dbCached = await this.readDbCache(appName, windowTitle);
    if (dbCached) {
      this.writeMemoryCache(cacheKey, dbCached);
      console.log(
        `[api] classification cache hit db category=${dbCached.category} workRelated=${dbCached.workRelated}`,
      );
      return dbCached;
    }

    const { config } = this.configService;
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
      const safeAppName = escapePromptField(appName);
      const safeWindowTitle = escapePromptField(windowTitle);
      const { object } = await generateObject({
        model: google(config.geminiModel),
        schema: windowClassificationSchema,
        prompt: `Analyze the following active window.
Application name (from OS): "${safeAppName}"
Window title: "${safeWindowTitle}"

Categorize it strictly into one of the allowed categories.
Extract the base application name without extra document titles.
For workRelated: use "yes" only when clearly work/dev; "no" when clearly personal or leisure; "maybe" when ambiguous (e.g. generic browsing, mixed personal/work browser profile, title lacks enough context).`,
      });

      const elapsedMs = Math.round(performance.now() - started);
      this.writeMemoryCache(cacheKey, object);
      void this.writeDbCache(appName, windowTitle, object);
      console.log(
        `[api] classification gemini ${elapsedMs}ms model=${config.geminiModel} category=${object.category} workRelated=${object.workRelated}`,
      );
      return object;
    } catch (error: unknown) {
      const elapsedMs = Math.round(performance.now() - started);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[api] classification failed ${elapsedMs}ms: ${message}`);
      return null;
    }
  }

  private readMemoryCache(key: string): WindowClassification | undefined {
    const value = this.cache.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  private writeMemoryCache(key: string, value: WindowClassification): void {
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

  private async readDbCache(
    appName: string,
    windowTitle: string,
  ): Promise<WindowClassification | null> {
    if (!this.supabaseService.isConfigured()) {
      return null;
    }

    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from("classification_cache")
        .select("app_name, window_title, classification, updated_at")
        .eq("app_name", appName)
        .eq("window_title", windowTitle)
        .maybeSingle();

      if (error) {
        this.logCachePersistenceFailure("read", error);
        return null;
      }

      if (!data) {
        return null;
      }

      return parseClassificationCacheRow(data);
    } catch (error: unknown) {
      this.logCachePersistenceFailure("read", error);
      return null;
    }
  }

  private async writeDbCache(
    appName: string,
    windowTitle: string,
    classification: WindowClassification,
  ): Promise<void> {
    if (!this.supabaseService.isConfigured()) {
      return;
    }

    try {
      const { error } = await this.supabaseService.getClient().from("classification_cache").upsert(
        {
          app_name: appName,
          window_title: windowTitle,
          classification,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "app_name,window_title" },
      );

      if (error) {
        this.logCachePersistenceFailure("write", error);
      }
    } catch (error: unknown) {
      this.logCachePersistenceFailure("write", error);
    }
  }

  private logCachePersistenceFailure(context: "read" | "write", error: unknown): void {
    const detail = formatPersistenceError(error);
    if (isSchemaMissingError(detail)) {
      if (!this.schemaMissingLogged) {
        this.schemaMissingLogged = true;
        this.logger.warn(`[classification] cache ${context} skipped — schema not applied`);
      }
      return;
    }

    this.logger.warn(`[classification] cache ${context} failed: ${detail}`);
  }
}
