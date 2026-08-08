import { describe, expect, it } from "vitest";
import { isIngestAuthorized } from "./ingest-auth.js";

describe("isIngestAuthorized", () => {
  it("allows requests when ingest secret is unset", () => {
    expect(isIngestAuthorized(undefined, undefined)).toBe(true);
  });

  it("rejects missing bearer token when secret is set", () => {
    expect(isIngestAuthorized(undefined, "test-secret")).toBe(false);
  });

  it("accepts a valid bearer token", () => {
    expect(isIngestAuthorized("Bearer test-secret", "test-secret")).toBe(true);
  });
});
