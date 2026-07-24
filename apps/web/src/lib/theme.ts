export const THEME_STORAGE_KEY = "pryladova.theme";

export type Theme = "light" | "dark";

export const isTheme = (value: string | null): value is Theme =>
  value === "light" || value === "dark";

export const getSystemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export const readStoredTheme = (): Theme | null => {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : null;
};

export const resolveTheme = (): Theme => readStoredTheme() ?? getSystemTheme();

export const applyTheme = (theme: Theme): void => {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
};

export const persistTheme = (theme: Theme): void => {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
};
