import { useEffect, useState } from "react";

export type ThemeMode = "auto" | "light" | "dark";

const THEME_STORAGE_KEY = "family-cart.theme";
const THEME_CHANGE_EVENT = "family-cart-theme-change";

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "auto" || value === "light" || value === "dark";
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "auto";
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(value) ? value : "auto";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const shouldUseDark = mode === "dark" || (mode === "auto" && prefersDark);
  document.documentElement.classList.toggle("dark", shouldUseDark);
  document.documentElement.dataset.theme = mode;
}

export function setStoredTheme(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  applyTheme(mode);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: mode }));
}

export function useThemePreference() {
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    setTheme(getStoredTheme());
    applyTheme(getStoredTheme());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMediaChange = () => {
      if (getStoredTheme() === "auto") applyTheme("auto");
    };
    const onThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<ThemeMode>).detail ?? getStoredTheme();
      setTheme(nextTheme);
      applyTheme(nextTheme);
    };

    media.addEventListener("change", onMediaChange);
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
    return () => {
      media.removeEventListener("change", onMediaChange);
      window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
    };
  }, []);

  return { theme, setTheme: setStoredTheme };
}
