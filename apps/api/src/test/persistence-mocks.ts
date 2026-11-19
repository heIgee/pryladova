import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";
import { ConfigService } from "../config.service.js";
import type { SegmentService } from "../persistence/segment.service.js";
import { SupabaseService } from "../persistence/supabase.service.js";

type QueryClient = {
  from(table: string): unknown;
  rpc?: unknown;
};

class SupabaseServiceDouble extends SupabaseService {
  constructor(private readonly queries: QueryClient | null) {
    super(new ConfigService());
  }

  override isConfigured(): boolean {
    return this.queries !== null;
  }

  override getClient(): SupabaseClient {
    if (!this.queries) {
      throw new Error("Supabase is not configured");
    }
    // Callers under test only use from() and rpc(). The Supabase client type is the boundary.
    return this.queries as SupabaseClient;
  }
}

export const supabaseServiceFromClient = (client: QueryClient | null): SupabaseService =>
  new SupabaseServiceDouble(client);

export const createSupabaseServiceMock = (): SupabaseService => supabaseServiceFromClient(null);

export const createSegmentServiceMock = (): Pick<
  SegmentService,
  | "onFocusChange"
  | "onHostTick"
  | "updateClassification"
  | "updateOpenSegmentClassification"
  | "closeForShutdown"
  | "closeForSessionLock"
  | "closeForAgentDisconnect"
  | "flushHeartbeats"
  | "sweepStaleHeartbeats"
> => ({
  onFocusChange: vi.fn().mockResolvedValue(undefined),
  onHostTick: vi.fn().mockResolvedValue(undefined),
  updateClassification: vi.fn().mockResolvedValue(undefined),
  updateOpenSegmentClassification: vi.fn().mockResolvedValue(undefined),
  closeForShutdown: vi.fn().mockResolvedValue(undefined),
  closeForSessionLock: vi.fn().mockResolvedValue(undefined),
  closeForAgentDisconnect: vi.fn().mockResolvedValue(undefined),
  flushHeartbeats: vi.fn().mockResolvedValue(undefined),
  sweepStaleHeartbeats: vi.fn().mockResolvedValue(undefined),
});
