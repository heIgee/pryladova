import { describe, expect, it } from "vitest";
import { e2eClassificationStub } from "./e2e-classification.stub.js";

describe("e2eClassificationStub", () => {
  it("maps deadlock.exe to Deadlock gaming classification", () => {
    expect(e2eClassificationStub("deadlock.exe", "Deadlock")).toEqual({
      category: "Gaming",
      displayAppName: "Deadlock",
      workRelated: "no",
    });
  });
});
