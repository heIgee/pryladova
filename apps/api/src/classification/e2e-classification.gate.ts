import { readE2eClassificationEnabled } from "./e2e-classification.stub.js";

type GateWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
};

let latched = false;
let waiters: GateWaiter[] = [];

export const resetE2eClassificationGate = (): void => {
  latched = false;
  for (const waiter of waiters) {
    waiter.reject(new Error("e2e classification gate reset"));
  }
  waiters = [];
};

export const waitForE2eClassificationRelease = (): Promise<void> => {
  if (!readE2eClassificationEnabled()) {
    return Promise.resolve();
  }

  if (latched) {
    latched = false;
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    waiters.push({ resolve, reject });
  });
};

/** Opens the gate for the next classify, or resolves one already waiting. */
export const releaseE2eClassificationGate = (): number => {
  const waiter = waiters.shift();
  if (waiter) {
    waiter.resolve();
    return 1;
  }

  latched = true;
  return 0;
};
