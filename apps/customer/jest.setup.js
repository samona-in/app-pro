jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

// The library's own Jest mock (see its `jest/` folder): the real components
// are host views backed by native modules, while tests only need them to
// render as plain primitives. `Screen` imports `KeyboardAwareScrollView`.
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);
