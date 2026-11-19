import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Injectable, Logger } from "@nestjs/common";
import {
  formatPersistenceError,
  isRedactedTelemetry,
  isSchemaMissingError,
  type WindowClassification,
  windowClassificationSchema,
} from "@pryladova/shared";
import { generateObject } from "ai";
import { ConfigService } from "../config.service.js";
import { SupabaseService } from "../persistence/supabase.service.js";
import { SettingsService } from "../settings/settings.service.js";
import {
  normalizeClassificationCacheTitle,
  parseClassificationCacheRow,
} from "./classification-cache.logic.js";

const CACHE_MAX_ENTRIES = 256;

export type ClassificationPrepareResult =
  | { outcome: "skip" }
  | { outcome: "hit"; classification: WindowClassification }
  | {
      outcome: "miss";
      appName: string;
      windowTitle: string;
      cacheKey: string;
      cacheTitle: string;
    };

const escapePromptField = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);
  private readonly cache = new Map<string, WindowClassification>();
  private warnedMissingKey = false;
  private schemaMissingLogged = false;

  constructor(
    protected readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly supabaseService: SupabaseService,
  ) {}

  isGeminiConfigured(): boolean {
    return Boolean(this.configService.config.geminiApiKey);
  }

  resetMemoryCacheForE2e(): void {
    if (!this.configService.config.runtime.isTest) {
      return;
    }
    this.clearMemoryCacheForE2e();
  }

  protected prepareClassificationInputs(
    appName: string,
    windowTitle: string,
  ): ClassificationPrepareResult {
    if (!this.settingsService.isClassificationEnabled()) {
      return { outcome: "skip" };
    }

    if (isRedactedTelemetry(appName, windowTitle)) {
      return { outcome: "skip" };
    }

    const cacheTitle = normalizeClassificationCacheTitle(appName, windowTitle);
    const cacheKey = `${appName}|${cacheTitle}`;
    const memoryCached = this.readMemoryCache(cacheKey);
    if (memoryCached) {
      this.logger.log(
        `classification cache hit memory category=${memoryCached.category} workRelated=${memoryCached.workRelated}`,
      );
      return { outcome: "hit", classification: memoryCached };
    }

    return { outcome: "miss", appName, windowTitle, cacheKey, cacheTitle };
  }

  async classify(appName: string, windowTitle: string): Promise<WindowClassification | null> {
    const prepared = this.prepareClassificationInputs(appName, windowTitle);
    if (prepared.outcome === "skip") {
      return null;
    }
    if (prepared.outcome === "hit") {
      return prepared.classification;
    }

    return this.classifyAfterMemoryMiss(
      prepared.appName,
      prepared.windowTitle,
      prepared.cacheKey,
      prepared.cacheTitle,
    );
  }

  protected async classifyAfterMemoryMiss(
    appName: string,
    windowTitle: string,
    cacheKey: string,
    cacheTitle: string,
  ): Promise<WindowClassification | null> {
    const dbCached = await this.readDbCache(appName, cacheTitle);
    if (dbCached) {
      this.storeMemoryCacheHit(cacheKey, dbCached);
      this.logger.log(
        `classification cache hit db category=${dbCached.category} workRelated=${dbCached.workRelated}`,
      );
      return dbCached;
    }

    const { config } = this.configService;
    if (!config.geminiApiKey) {
      if (!this.warnedMissingKey) {
        this.logger.warn("GEMINI_API_KEY not set — classification disabled");
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
      this.storeMemoryCacheHit(cacheKey, object);
      void this.writeDbCache(appName, cacheTitle, object);
      this.logger.log(
        `classification gemini ${elapsedMs}ms model=${config.geminiModel} category=${object.category} workRelated=${object.workRelated}`,
      );
      return object;
    } catch (error: unknown) {
      const elapsedMs = Math.round(performance.now() - started);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`classification failed ${elapsedMs}ms: ${message}`);
      return null;
    }
  }

  protected clearMemoryCacheForE2e(): void {
    this.cache.clear();
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

  protected storeMemoryCacheHit(key: string, value: WindowClassification): void {
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
