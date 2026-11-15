import { describe, expect, it } from "vitest";
import { isIngestAuthorized } from "./ingest-auth.js";

describe("isIngestAuthorized", () => {
  it("rejects requests when ingest secret is unset", () => {
    expect(isIngestAuthorized(undefined, undefined)).toBe(false);
    expect(isIngestAuthorized("Bearer anything", undefined)).toBe(false);
  });

  it("rejects missing bearer token when secret is set", () => {
    expect(isIngestAuthorized(undefined, "test-secret")).toBe(false);
  });

  it("accepts a valid bearer token", () => {
    expect(isIngestAuthorized("Bearer test-secret", "test-secret")).toBe(true);
  });
});
