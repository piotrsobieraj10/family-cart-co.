import { useEffect, useMemo, useState } from "react";
import { pl } from "./pl";
import { en } from "./en";

export type Language = "pl" | "en";
export type TranslationKey = keyof typeof pl;

const LANGUAGE_STORAGE_KEY = "family-cart.language";
const LANGUAGE_CHANGE_EVENT = "family-cart-language-change";
const dictionaries: Record<Language, Record<TranslationKey, string>> = {
  pl,
  en: { ...pl, ...en },
};

function isLanguage(value: string | null): value is Language {
  return value === "pl" || value === "en";
}

export function getStoredLanguage(): Language {
  if (typeof window === "undefined") return "pl";
  const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguage(value) ? value : "pl";
}

export function setStoredLanguage(language: Language) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.documentElement.lang = language;
  window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: language }));
}

export function useI18n() {
  const [language, setLanguageState] = useState<Language>(() => getStoredLanguage());

  useEffect(() => {
    const nextLanguage = getStoredLanguage();
    setLanguageState(nextLanguage);
    document.documentElement.lang = nextLanguage;

    const onLanguageChange = (event: Event) => {
      const next = (event as CustomEvent<Language>).detail ?? getStoredLanguage();
      setLanguageState(next);
      document.documentElement.lang = next;
    };

    window.addEventListener(LANGUAGE_CHANGE_EVENT, onLanguageChange);
    return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, onLanguageChange);
  }, []);

  const dictionary = dictionaries[language];
  const t = useMemo(
    () => (key: TranslationKey) => dictionary[key] ?? dictionaries.pl[key],
    [dictionary],
  );

  return { language, setLanguage: setStoredLanguage, t };
}
