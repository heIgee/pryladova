import { type WindowClassification, windowClassificationSchema } from "@pryladova/shared";
import { z } from "zod";

export const CLASSIFICATION_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type ClassificationCacheRow = {
  app_name: string;
  window_title: string;
  classification: unknown;
  updated_at: string;
};

const classificationCacheRowSchema = z.object({
  classification: windowClassificationSchema,
});

export const isClassificationCacheFresh = (updatedAt: string, nowMs = Date.now()): boolean => {
  const updatedMs = Date.parse(updatedAt);
  if (Number.isNaN(updatedMs)) {
    return false;
  }

  return nowMs - updatedMs <= CLASSIFICATION_CACHE_TTL_MS;
};

export const parseClassificationCacheRow = (
  row: ClassificationCacheRow,
  nowMs = Date.now(),
): WindowClassification | null => {
  if (!isClassificationCacheFresh(row.updated_at, nowMs)) {
    return null;
  }

  const parsed = classificationCacheRowSchema.safeParse(row);
  if (!parsed.success) {
    return null;
  }

  return parsed.data.classification;
};
