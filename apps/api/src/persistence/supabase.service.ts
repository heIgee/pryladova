import { Injectable } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ConfigService } from "../config.service.js";

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient | null;

  constructor(private readonly configService: ConfigService) {
    const { supabaseUrl, supabaseSecretKey } = this.configService.config;
    this.client =
      supabaseUrl && supabaseSecretKey ? createClient(supabaseUrl, supabaseSecretKey) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error("Supabase is not configured");
    }
    return this.client;
  }
}
