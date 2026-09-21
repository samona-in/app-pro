import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en.json';
import te from './locales/te.json';
import hi from './locales/hi.json';
import { getStoredLanguage, storeLanguage, type StoredLanguage } from '@/services/language-storage';

export type AppLanguage = StoredLanguage;

type TranslationKeyInner<T extends Record<string, unknown>> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? `${K}.${TranslationKeyInner<T[K]>}`
    : K;
}[keyof T & string];

/** All dotted translation keys, derived from the English resource. */
export type TranslationKey = TranslationKeyInner<typeof en>;

export const SUPPORTED_LANGUAGES: readonly { code: AppLanguage; nativeName: string }[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'te', nativeName: 'తెలుగు' },
  { code: 'hi', nativeName: 'हिन्दी' },
] as const;

/** True when the code is one of the languages SAMONA Pro ships. */
export function isSupportedLanguage(code: string | null | undefined): code is AppLanguage {
  return code === 'en' || code === 'te' || code === 'hi';
}

/** Maps a device language code to a supported app language, falling back to English. */
function supportedOrEnglish(code: string | null | undefined): AppLanguage {
  return isSupportedLanguage(code) ? code : 'en';
}

export const i18nInstance = i18n;

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    te: { translation: te },
    hi: { translation: hi },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});

/**
 * Resolves the language on startup: a stored choice wins; otherwise the device
 * locale picks Telugu or Hindi when supported, else English. The stored choice
 * is never overwritten by the device.
 */
export async function initAppLanguage(): Promise<void> {
  try {
    const stored = await getStoredLanguage();
    if (isSupportedLanguage(stored)) {
      await i18n.changeLanguage(stored);
      return;
    }
    const deviceCode = getLocales()[0]?.languageCode ?? null;
    await i18n.changeLanguage(supportedOrEnglish(deviceCode));
  } catch {
    await i18n.changeLanguage('en');
  }
}

/** Switches the active language and persists it for the next launch. */
export async function changeAppLanguage(language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language);
  try {
    await storeLanguage(language);
  } catch {
    // Non-fatal: the in-session switch already happened.
  }
}