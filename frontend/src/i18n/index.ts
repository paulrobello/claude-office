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
  return Object.hasOwn(locales, value);
}

const translations: Record<Locale, Record<TranslationKey, string>> = {
  en,
  "pt-BR": ptBR,
  es,
};

const i18nDebug = typeof process !== "undefined" && process.env.NEXT_PUBLIC_I18N_DEBUG === "true";

export function getTranslation(locale: Locale) {
  const dict = translations[locale] ?? en;

  function t(key: TranslationKey, params?: Record<string, string | number>): string {
    const localeValue = dict[key];
    const text = localeValue ?? en[key] ?? key;

    if (i18nDebug && locale !== "en") {
      if (localeValue === undefined) {
        console.warn(`[i18n] Missing "${locale}" translation for key: "${key}"`);
      } else if (localeValue === en[key]) {
        console.warn(`[i18n] Key "${key}" in "${locale}" is identical to English — intentional?`);
      }
    }

    if (params) {
      let result = text;
      for (const [k, v] of Object.entries(params)) {
        const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        result = result.replace(new RegExp(`\\{${escaped}\\}`, "g"), () => String(v));
      }
      return result;
    }
    return text;
  }

  return t;
}

export type { TranslationKey };
