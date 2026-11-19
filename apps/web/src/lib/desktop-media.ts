const DESKTOP_MEDIA = "(min-width: 768px)";

const getMediaQuery = (): MediaQueryList | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.matchMedia(DESKTOP_MEDIA);
};

export const subscribeDesktopMedia = (onStoreChange: () => void): (() => void) => {
  const media = getMediaQuery();
  if (!media) {
    return () => {};
  }
  media.addEventListener("change", onStoreChange);
  return () => {
    media.removeEventListener("change", onStoreChange);
  };
};

export const getDesktopMediaSnapshot = (): boolean => getMediaQuery()?.matches ?? false;

export const getDesktopMediaServerSnapshot = (): boolean => false;
