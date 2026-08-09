import { describe, expect, it } from "vitest";
import { readApiErrorMessage } from "./api-error.js";

describe("readApiErrorMessage", () => {
  it("reads Nest-style message strings", async () => {
    const response = new Response(JSON.stringify({ message: "Database schema not applied" }), {
      status: 503,
    });
    await expect(readApiErrorMessage(response)).resolves.toBe("Database schema not applied");
  });

  it("joins validation message arrays", async () => {
    const response = new Response(JSON.stringify({ message: ["from must be before to"] }), {
      status: 400,
    });
    await expect(readApiErrorMessage(response)).resolves.toBe("from must be before to");
  });

  it("falls back to status code", async () => {
    const response = new Response("nope", { status: 502 });
    await expect(readApiErrorMessage(response)).resolves.toBe("Request failed (502)");
  });
});
