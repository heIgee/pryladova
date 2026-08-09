import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Settings, SettingsPutResponse } from "@pryladova/shared";
import { readE2eClassificationEnabled } from "../classification/e2e-classification.stub.js";
import {
  formatPersistenceError,
  isPermissionDeniedError,
  isSchemaMissingError,
  PERMISSION_DENIED_MESSAGE,
  SCHEMA_MISSING_MESSAGE,
} from "../persistence/persistence-error.js";
import { SupabaseService } from "../persistence/supabase.service.js";

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private classificationEnabled = false;
  private schemaMissingLogged = false;

  constructor(private readonly supabaseService: SupabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.loadFromDatabase();
    if (readE2eClassificationEnabled()) {
      this.classificationEnabled = true;
    }
  }

  getSettings(): Settings {
    return { classificationEnabled: this.classificationEnabled };
  }

  applySettings(settings: Settings): Settings {
    if (settings.classificationEnabled !== this.classificationEnabled) {
      this.logger.log(
        `[api] classification ${settings.classificationEnabled ? "enabled" : "disabled"}`,
      );
    }
    this.classificationEnabled = settings.classificationEnabled;
    return this.getSettings();
  }

  async persistSettings(settings: Settings): Promise<boolean> {
    if (!this.supabaseService.isConfigured()) {
      return false;
    }

    try {
      const client = this.supabaseService.getClient();
      const { error } = await client.from("hub_settings").upsert({
        id: 1,
        classification_enabled: settings.classificationEnabled,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }

      return true;
    } catch (error: unknown) {
      this.logPersistenceFailure("settings persist", error);
      return false;
    }
  }

  async saveSettings(settings: Settings): Promise<SettingsPutResponse> {
    const next = this.applySettings(settings);
    const persisted = await this.persistSettings(next);
    return { ...next, persisted };
  }

  isClassificationEnabled(): boolean {
    return this.classificationEnabled;
  }

  private async loadFromDatabase(): Promise<void> {
    if (!this.supabaseService.isConfigured()) {
      return;
    }

    try {
      const client = this.supabaseService.getClient();
      const { data, error } = await client
        .from("hub_settings")
        .select("classification_enabled")
        .eq("id", 1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        this.classificationEnabled = data.classification_enabled;
      }
    } catch (error: unknown) {
      this.logPersistenceFailure("settings boot load", error);
    }
  }

  private logPersistenceFailure(context: string, error: unknown): void {
    const detail = formatPersistenceError(error);
    if (isSchemaMissingError(detail)) {
      if (!this.schemaMissingLogged) {
        this.schemaMissingLogged = true;
        this.logger.warn(`[persistence] ${SCHEMA_MISSING_MESSAGE}`);
      }
      return;
    }
    if (isPermissionDeniedError(detail)) {
      if (!this.schemaMissingLogged) {
        this.schemaMissingLogged = true;
        this.logger.warn(`[persistence] ${PERMISSION_DENIED_MESSAGE}`);
      }
      return;
    }
    this.logger.warn(`[persistence] ${context} failed: ${detail}`);
  }
}
