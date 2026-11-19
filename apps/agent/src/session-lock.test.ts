import { describe, expect, it } from "vitest";
import { sessionLockWtsEvent, WTS_SESSION_LOCK, WTS_SESSION_UNLOCK } from "./session-lock.js";

describe("sessionLockWtsEvent", () => {
  it("maps WTS lock and unlock codes", () => {
    expect(WTS_SESSION_LOCK).toBe(0x7);
    expect(WTS_SESSION_UNLOCK).toBe(0x8);
    expect(sessionLockWtsEvent(WTS_SESSION_LOCK)).toBe("lock");
    expect(sessionLockWtsEvent(WTS_SESSION_UNLOCK)).toBe("unlock");
    expect(sessionLockWtsEvent(0)).toBeNull();
  });
});
