import { useEffect, useState } from "react";

/** True while focusKey changed but async work (e.g. classification) has not finished. */
export const useUnsettledFocusKey = (
  focusKey: string,
  options: { enabled: boolean; isPending: boolean },
): boolean => {
  const [settledFocusKey, setSettledFocusKey] = useState<string | null>(null);

  useEffect(() => {
    if (!options.enabled) {
      setSettledFocusKey(focusKey);
      return;
    }

    if (options.isPending) {
      return;
    }

    setSettledFocusKey(focusKey);
  }, [focusKey, options.enabled, options.isPending]);

  return options.enabled && settledFocusKey !== focusKey;
};
