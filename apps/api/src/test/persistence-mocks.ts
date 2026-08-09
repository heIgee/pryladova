import { vi } from "vitest";
import type { SegmentService } from "../persistence/segment.service.js";
import type { SupabaseService } from "../persistence/supabase.service.js";

export const createSupabaseServiceMock = (): SupabaseService =>
  ({
    isConfigured: () => false,
    getClient: () => {
      throw new Error("Supabase is not configured");
    },
  }) as unknown as SupabaseService;

export const createSegmentServiceMock = (): Pick<
  SegmentService,
  | "onFocusChange"
  | "onHostTick"
  | "updateClassification"
  | "updateOpenSegmentClassification"
  | "closeForShutdown"
  | "closeForAgentDisconnect"
  | "flushHeartbeats"
  | "sweepStaleHeartbeats"
> => ({
  onFocusChange: vi.fn().mockResolvedValue(undefined),
  onHostTick: vi.fn().mockResolvedValue(undefined),
  updateClassification: vi.fn().mockResolvedValue(undefined),
  updateOpenSegmentClassification: vi.fn().mockResolvedValue(undefined),
  closeForShutdown: vi.fn().mockResolvedValue(undefined),
  closeForAgentDisconnect: vi.fn().mockResolvedValue(undefined),
  flushHeartbeats: vi.fn().mockResolvedValue(undefined),
  sweepStaleHeartbeats: vi.fn().mockResolvedValue(undefined),
});
