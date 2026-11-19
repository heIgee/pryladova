import { describe, expect, it } from "vitest";
import {
  formatPersistenceError,
  isPermissionDeniedError,
  isSchemaMissingError,
} from "./persistence-error.js";

describe("formatPersistenceError", () => {
  it("formats native errors", () => {
    expect(formatPersistenceError(new Error("boom"))).toBe("boom");
  });

  it("formats Supabase PostgREST error objects", () => {
    expect(
      formatPersistenceError({
        message: "Could not find the function",
        code: "PGRST202",
        hint: "Check migrations",
      }),
    ).toBe("Could not find the function — PGRST202 — Check migrations");
  });

  it("detects schema-missing PostgREST errors", () => {
    expect(isSchemaMissingError("table missing — PGRST205")).toBe(true);
    expect(isSchemaMissingError("function missing — PGRST202")).toBe(true);
    expect(isSchemaMissingError("connection reset")).toBe(false);
  });

  it("detects permission denied errors", () => {
    expect(isPermissionDeniedError("permission denied for table window_segments — 42501")).toBe(
      true,
    );
    expect(isPermissionDeniedError("connection reset")).toBe(false);
  });
});
