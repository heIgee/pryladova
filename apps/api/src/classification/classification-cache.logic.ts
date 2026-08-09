import { type WindowClassification, windowClassificationSchema } from "@pryladova/shared";
import { z } from "zod";

export const CLASSIFICATION_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const DASHES = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D-]/g;
const COUNTED_OVERFLOW = /\s+and\s+\d+\s+more(?:\s+\w+)*/gi;
const LEADING_STATE_MARKERS = /^[\s*●•◦·+~!]+/u;
const TRAILING_STATE_MARKERS = /[\s*●•◦·+~!]+$/u;
const INLINE_STATE_MARKERS = /\s*[*●•◦·+~!]+(?=\s*-|\s*$)/gu;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeDashes = (value: string): string => value.replace(DASHES, "-");

const stripAppEcho = (title: string, appName: string): string => {
  const escaped = escapeRegExp(appName);
  return title
    .replace(new RegExp(`\\s-\\s${escaped}\\s*$`, "i"), "")
    .replace(new RegExp(`^${escaped}\\s-\\s`, "i"), "")
    .trim();
};

const stripAnnotations = (title: string): string => {
  let previous = "";
  while (previous !== title) {
    previous = title;
    title = title.replace(/\s*\([^)]*\)/g, " ").replace(/\s*\[[^\]]*\]/g, " ");
  }
  return title;
};

const collapseRepeatedLeadToken = (title: string): string => {
  const match = /^(\S+)\s+\1(\s|$)/i.exec(title);
  if (!match) {
    return title;
  }

  return collapseRepeatedLeadToken(title.replace(/^(\S+)\s+\1/i, "$1"));
};

/** Stable cache key — raw title still goes to Gemini. */
export const normalizeClassificationCacheTitle = (appName: string, windowTitle: string): string => {
  let title = windowTitle.trim();
  if (!title) {
    return title;
  }

  title = normalizeDashes(title);
  title = title.replace(COUNTED_OVERFLOW, "").trim();
  title = stripAppEcho(title, appName);
  title = stripAnnotations(title);
  title = title.replace(LEADING_STATE_MARKERS, "").replace(TRAILING_STATE_MARKERS, "").trim();
  title = title.replace(INLINE_STATE_MARKERS, "").trim();
  title = collapseRepeatedLeadToken(title);

  return title.replace(/\s+/g, " ").trim().toLowerCase();
};

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
