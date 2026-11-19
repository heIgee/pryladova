export const readAppRelease = (): string => import.meta.env.VITE_APP_RELEASE;

export const formatReleaseShort = (release: string): string => release.slice(0, 7);

export const resolveDisplayedRelease = (
  buildRelease: string,
  options: { healthSynced: boolean; apiRelease: string | undefined },
): string => (options.healthSynced ? (options.apiRelease ?? "") : buildRelease);
