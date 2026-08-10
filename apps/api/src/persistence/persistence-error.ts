type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

export const formatPersistenceError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const record = error as SupabaseErrorLike;
    const parts = [record.message, record.code, record.details, record.hint].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );
    if (parts.length > 0) {
      return parts.join(" — ");
    }
  }

  return String(error);
};

export const isSchemaMissingError = (detail: string): boolean =>
  detail.includes("PGRST205") || detail.includes("PGRST202") || detail.includes("PGRST204");

export const isPermissionDeniedError = (detail: string): boolean =>
  detail.includes("42501") || detail.toLowerCase().includes("permission denied");

export const SCHEMA_MISSING_MESSAGE =
  "Database schema not applied. From repo root: supabase link --project-ref jzotgcusyrzmzytldnba && supabase db push";

export const PERMISSION_DENIED_MESSAGE =
  "Database grants missing for service_role. From repo root: pnpm db:push";

export const persistenceFailureMessage = (detail: string, fallback: string): string => {
  if (isSchemaMissingError(detail)) {
    return SCHEMA_MISSING_MESSAGE;
  }
  if (isPermissionDeniedError(detail)) {
    return PERMISSION_DENIED_MESSAGE;
  }
  return fallback;
};
