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

/**
 * Whether the Pro has explicitly chosen a language, as opposed to the app
 * falling back to the device locale. Resolved once by `initAppLanguage` before
 * the first screen mounts, then kept true for the session by
 * `changeAppLanguage`. Drives the one-time first-launch language step.
 */
let hasStoredLanguageChoice = false;

/** True once a language has been explicitly chosen and persisted. */
export function hasChosenLanguage(): boolean {
  return hasStoredLanguageChoice;
}

/** The active language, narrowed to a supported code (device codes can differ). */
export function activeLanguage(): AppLanguage {
  return isSupportedLanguage(i18n.language) ? i18n.language : 'en';
}

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
  // Reset each run so the flag always reflects storage, never a stale session.
  hasStoredLanguageChoice = false;
  try {
    const stored = await getStoredLanguage();
    if (isSupportedLanguage(stored)) {
      hasStoredLanguageChoice = true;
      await i18n.changeLanguage(stored);
      return;
    }
    const deviceCode = getLocales()[0]?.languageCode ?? null;
    await i18n.changeLanguage(supportedOrEnglish(deviceCode));
  } catch {
    await i18n.changeLanguage('en');
  }
}

/**
 * Switches the runtime language without persisting or marking it chosen — used
 * by the first-launch step to preview a selection before Continue commits it.
 */
export async function previewLanguage(language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language);
}

/** Switches the active language and persists it for the next launch. */
export async function changeAppLanguage(language: AppLanguage): Promise<void> {
  await i18n.changeLanguage(language);
  // Mark chosen even if the write fails: the in-session switch already happened,
  // so the first-launch step must not reappear until the next cold start.
  hasStoredLanguageChoice = true;
  try {
    await storeLanguage(language);
  } catch {
    // Non-fatal: the in-session switch already happened.
  }
}