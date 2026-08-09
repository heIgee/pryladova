import { Module } from "@nestjs/common";
import { IngestModule } from "../ingest/ingest.module.js";
import { HistoryController } from "./history.controller.js";
import { SegmentService } from "./segment.service.js";
import { SupabaseService } from "./supabase.service.js";

@Module({
  imports: [IngestModule],
  controllers: [HistoryController],
  providers: [SupabaseService, SegmentService],
  exports: [SupabaseService, SegmentService],
})
export class PersistenceModule {}
