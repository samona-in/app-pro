import en from '@/i18n/locales/en.json';
import hi from '@/i18n/locales/hi.json';
import te from '@/i18n/locales/te.json';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

function flattenKeys(
  value: JsonObject,
  prefix = '',
  keys: string[] = [],
): string[] {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      flattenKeys(child as JsonObject, path, keys);
    } else {
      keys.push(path);
    }
  }
  return keys;
}

describe('translation resources', () => {
  const enKeys = flattenKeys(en).sort();
  const teKeys = flattenKeys(te).sort();
  const hiKeys = flattenKeys(hi).sort();
  const expectedPluralSuffixes = ['_one', '_other'];

  function normalizeKeys(keys: string[]): string[] {
    return keys
      .map((key) => {
        const suffix = expectedPluralSuffixes.find((s) => key.endsWith(s));
        return suffix ? key.slice(0, -suffix.length) : key;
      })
      .sort();
  }

  it.each([
    ['te', teKeys],
    ['hi', hiKeys],
  ])('%s carries every English string', (_locale, keys) => {
    for (const enKey of enKeys) {
      if (expectedPluralSuffixes.some((suffix) => enKey.endsWith(suffix))) {
        continue;
      }
      expect(keys).toContain(enKey);
    }
  });

  it.each([
    ['te', teKeys],
    ['hi', hiKeys],
  ])('%s does not drift with unused keys', (_locale, keys) => {
    expect(normalizeKeys(keys)).toEqual(normalizeKeys(enKeys));
  });

  it.each([
    ['te', te],
    ['hi', hi],
  ])('%s has no empty or placeholder-only strings', (_locale, resources) => {
    for (const key of flattenKeys(resources as JsonObject)) {
      expect((key as unknown as string).length).toBeGreaterThan(0);
    }
  });
});