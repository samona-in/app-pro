import { changeAppLanguage, hasChosenLanguage, initAppLanguage, i18nInstance } from '@/i18n';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';

const LANGUAGE_KEY = 'samona.language';

describe('initAppLanguage', () => {
  beforeEach(async () => {
    await SecureStore.deleteItemAsync(LANGUAGE_KEY);
    (getLocales as jest.Mock).mockReturnValue([{ languageCode: 'en', languageTag: 'en-IN' }]);
  });

  it('uses the stored language when one has been chosen', async () => {
    await SecureStore.setItemAsync(LANGUAGE_KEY, 'hi');
    await initAppLanguage();
    expect(i18nInstance.language).toBe('hi');
  });

  it('falls back to a supported device language when nothing is stored', async () => {
    (getLocales as jest.Mock).mockReturnValue([{ languageCode: 'te', languageTag: 'te-IN' }]);
    await initAppLanguage();
    expect(i18nInstance.language).toBe('te');
  });

  it('defaults to English for unsupported device languages', async () => {
    (getLocales as jest.Mock).mockReturnValue([{ languageCode: 'fr', languageTag: 'fr-FR' }]);
    await initAppLanguage();
    expect(i18nInstance.language).toBe('en');
  });

  it('never overwrites a stored choice with the device locale', async () => {
    await SecureStore.setItemAsync(LANGUAGE_KEY, 'en');
    (getLocales as jest.Mock).mockReturnValue([{ languageCode: 'hi', languageTag: 'hi-IN' }]);
    await initAppLanguage();
    expect(i18nInstance.language).toBe('en');
    expect(await SecureStore.getItemAsync(LANGUAGE_KEY)).toBe('en');
  });
});

describe('changeAppLanguage', () => {
  it('switches the runtime language and persists it', async () => {
    await changeAppLanguage('te');
    expect(i18nInstance.language).toBe('te');
    expect(await SecureStore.getItemAsync(LANGUAGE_KEY)).toBe('te');
  });
});

describe('hasChosenLanguage', () => {
  beforeEach(async () => {
    await SecureStore.deleteItemAsync(LANGUAGE_KEY);
    (getLocales as jest.Mock).mockReturnValue([{ languageCode: 'en', languageTag: 'en-IN' }]);
  });

  it('is false when the device locale is doing the work', async () => {
    (getLocales as jest.Mock).mockReturnValue([{ languageCode: 'te', languageTag: 'te-IN' }]);
    await initAppLanguage();
    expect(hasChosenLanguage()).toBe(false);
  });

  it('is true when a stored choice is applied', async () => {
    await SecureStore.setItemAsync(LANGUAGE_KEY, 'hi');
    await initAppLanguage();
    expect(hasChosenLanguage()).toBe(true);
  });

  it('becomes true after an explicit change', async () => {
    await initAppLanguage();
    await changeAppLanguage('te');
    expect(hasChosenLanguage()).toBe(true);
  });

  it('reflects storage again on the next init', async () => {
    await changeAppLanguage('te');
    await SecureStore.deleteItemAsync(LANGUAGE_KEY);
    await initAppLanguage();
    expect(hasChosenLanguage()).toBe(false);
  });
});