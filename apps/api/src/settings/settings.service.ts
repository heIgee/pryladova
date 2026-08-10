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
  private googleRefreshTokenEncrypted: string | null = null;
  private googleAccountEmail: string | null = null;
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
        google_refresh_token_encrypted: this.googleRefreshTokenEncrypted,
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

  hasGoogleRefreshTokenEncrypted(): boolean {
    return this.googleRefreshTokenEncrypted !== null;
  }

  getGoogleRefreshTokenEncrypted(): string | null {
    return this.googleRefreshTokenEncrypted;
  }

  canPersistGoogleOAuth(): boolean {
    return this.supabaseService.isConfigured();
  }

  getGoogleAccountEmail(): string | null {
    return this.googleAccountEmail;
  }

  async saveGoogleRefreshTokenEncrypted(encrypted: string): Promise<boolean> {
    if (!this.supabaseService.isConfigured()) {
      return false;
    }

    try {
      const client = this.supabaseService.getClient();
      const { error } = await client.from("hub_settings").upsert({
        id: 1,
        classification_enabled: this.classificationEnabled,
        google_refresh_token_encrypted: encrypted,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }

      this.googleRefreshTokenEncrypted = encrypted;
      return true;
    } catch (error: unknown) {
      this.logPersistenceFailure("google oauth token persist", error);
      return false;
    }
  }

  async saveGoogleAccountEmail(email: string): Promise<boolean> {
    this.googleAccountEmail = email;

    if (!this.supabaseService.isConfigured()) {
      return false;
    }

    try {
      const client = this.supabaseService.getClient();
      const { error } = await client.from("hub_settings").upsert({
        id: 1,
        classification_enabled: this.classificationEnabled,
        google_refresh_token_encrypted: this.googleRefreshTokenEncrypted,
        google_account_email: email,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }

      return true;
    } catch (error: unknown) {
      this.logPersistenceFailure("google account email persist", error);
      return false;
    }
  }

  async clearGoogleRefreshTokenEncrypted(): Promise<boolean> {
    if (!this.supabaseService.isConfigured()) {
      this.googleRefreshTokenEncrypted = null;
      this.googleAccountEmail = null;
      return true;
    }

    try {
      const client = this.supabaseService.getClient();
      const { error } = await client.from("hub_settings").upsert({
        id: 1,
        classification_enabled: this.classificationEnabled,
        google_refresh_token_encrypted: null,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }

      this.googleRefreshTokenEncrypted = null;
      this.googleAccountEmail = null;
      await this.clearGoogleAccountEmailInDatabase();
      return true;
    } catch (error: unknown) {
      this.logPersistenceFailure("google oauth token clear", error);
      return false;
    }
  }

  private async loadFromDatabase(): Promise<void> {
    if (!this.supabaseService.isConfigured()) {
      return;
    }

    try {
      const client = this.supabaseService.getClient();
      const loaded = await this.loadHubSettingsRow(client, true);
      if (loaded) {
        this.classificationEnabled = loaded.classification_enabled;
        this.googleRefreshTokenEncrypted = loaded.google_refresh_token_encrypted ?? null;
        this.googleAccountEmail = loaded.google_account_email ?? null;
      }
    } catch (error: unknown) {
      this.logPersistenceFailure("settings boot load", error);
    }
  }

  private async loadHubSettingsRow(
    client: ReturnType<SupabaseService["getClient"]>,
    includeAccountEmail: boolean,
  ): Promise<{
    classification_enabled: boolean;
    google_refresh_token_encrypted: string | null;
    google_account_email?: string | null;
  } | null> {
    const columns = includeAccountEmail
      ? "classification_enabled, google_refresh_token_encrypted, google_account_email"
      : "classification_enabled, google_refresh_token_encrypted";

    const { data, error } = await client
      .from("hub_settings")
      .select(columns)
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      const detail = formatPersistenceError(error);
      if (includeAccountEmail && isSchemaMissingError(detail)) {
        return this.loadHubSettingsRow(client, false);
      }
      throw error;
    }

    return data as {
      classification_enabled: boolean;
      google_refresh_token_encrypted: string | null;
      google_account_email?: string | null;
    } | null;
  }

  private async clearGoogleAccountEmailInDatabase(): Promise<void> {
    if (!this.supabaseService.isConfigured()) {
      return;
    }

    try {
      const client = this.supabaseService.getClient();
      const { error } = await client.from("hub_settings").upsert({
        id: 1,
        classification_enabled: this.classificationEnabled,
        google_refresh_token_encrypted: this.googleRefreshTokenEncrypted,
        google_account_email: null,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }
    } catch (error: unknown) {
      this.logPersistenceFailure("google account email clear", error);
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
