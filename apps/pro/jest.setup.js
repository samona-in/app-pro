// Haptics touch native APIs that do not exist under Jest.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

// `expo-localization` reads the device locale via native APIs. Default it to
// English; individual tests can override the return value.
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-IN' }]),
}));

// `expo-secure-store` needs a running native module. Back it with an in-memory
// map so language persistence can be tested without a device.
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (key) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
  };
});

// `env.ts` throws at module load when these are unset, and several service
// singletons (`api.ts`, `overlay-alert.ts`) import it transitively. Provide
// inert values so any test file can import them.
process.env.EXPO_PUBLIC_API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
process.env.EXPO_PUBLIC_SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'test-key';
