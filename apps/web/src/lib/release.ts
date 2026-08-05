export const readAppRelease = (): string => import.meta.env.VITE_APP_RELEASE;

export const formatReleaseShort = (release: string): string => release.slice(0, 7);
