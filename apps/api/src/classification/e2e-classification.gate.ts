import { readE2eClassificationEnabled } from "./e2e-classification.stub.js";

type GateWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
};

let open = false;
let waiters: GateWaiter[] = [];

export const resetE2eClassificationGate = (): void => {
  open = false;
  for (const waiter of waiters) {
    waiter.reject(new Error("e2e classification gate reset"));
  }
  waiters = [];
};

export const waitForE2eClassificationRelease = (): Promise<void> => {
  if (!readE2eClassificationEnabled()) {
    return Promise.resolve();
  }

  if (open) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    waiters.push({ resolve, reject });
  });
};

/** Lets every current and later classify through until the next reset. */
export const releaseE2eClassificationGate = (): number => {
  open = true;
  const pending = waiters;
  waiters = [];
  for (const waiter of pending) {
    waiter.resolve();
  }
  return pending.length;
};
