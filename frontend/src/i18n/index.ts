import en, { type TranslationKey } from "./en";
import ptBR from "./pt-BR";
import es from "./es";

export type Locale = "en" | "pt-BR" | "es";

export const locales: Record<Locale, string> = {
  en: "English",
  "pt-BR": "Português (BR)",
  es: "Español",
};

export function isLocale(value: string): value is Locale {
  return value in locales;
}

const translations: Record<Locale, Record<TranslationKey, string>> = {
  en,
  "pt-BR": ptBR,
  es,
};

export function getTranslation(locale: Locale) {
  const dict = translations[locale] ?? en;

  function t(key: TranslationKey, params?: Record<string, string | number>): string {
    let text = dict[key] ?? en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        text = text.replace(new RegExp(`\\{${escaped}\\}`, "g"), () => String(v));
      }
    }
    return text;
  }

  return t;
}

export type { TranslationKey };
