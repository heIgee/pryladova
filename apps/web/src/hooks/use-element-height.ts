import { type RefObject, useLayoutEffect, useState } from "react";

export const useElementHeight = <T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled: boolean,
): number | undefined => {
  const [height, setHeight] = useState<number | undefined>();

  useLayoutEffect(() => {
    if (!enabled) {
      setHeight(undefined);
      return;
    }

    const el = ref.current;
    if (!el) {
      return;
    }

    const desktop = window.matchMedia("(min-width: 768px)");

    const syncHeight = () => {
      if (!desktop.matches) {
        setHeight(undefined);
        return;
      }
      setHeight(el.offsetHeight);
    };

    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(el);
    desktop.addEventListener("change", syncHeight);
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", syncHeight);
    };
  }, [enabled, ref]);

  return height;
};
