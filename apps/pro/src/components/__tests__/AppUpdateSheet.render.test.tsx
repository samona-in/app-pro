/**
 * Regression coverage for the update sheet CTAs.
 *
 * Both action buttons must render in every dismissible mode. A previous
 * device-only regression (NativeWind's css-interop silently dropping
 * function-valued `style` props on Pressable) left the primary CTA invisible
 * while tree-level assertions still passed — keep these role/label checks
 * strict so a missing CTA fails the suite.
 */
import { render } from '@testing-library/react-native';
import { AppUpdateSheet } from '@samona/app-updates';

jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const BottomSheetModal = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
    return <View>{props.children}</View>;
  });
  return { BottomSheetModal };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function renderSheet(props: { mode?: 'optional' | 'mandatory' } = {}) {
  return render(
    <AppUpdateSheet
      visible
      mode="optional"
      isStarting={false}
      error={null}
      onUpdate={jest.fn()}
      onDismiss={jest.fn()}
      onRestart={jest.fn()}
      {...props}
    />,
  );
}

describe('AppUpdateSheet CTAs', () => {
  it('optional mode renders Update Now and Maybe Later as buttons', () => {
    const { getByRole } = renderSheet();
    expect(getByRole('button', { name: 'Update Now' })).toBeTruthy();
    expect(getByRole('button', { name: 'Maybe Later' })).toBeTruthy();
  });

  it('mandatory mode renders only the blocking Update Now CTA', () => {
    const { getByRole, queryByRole } = renderSheet({ mode: 'mandatory' });
    expect(getByRole('button', { name: 'Update Now' })).toBeTruthy();
    expect(queryByRole('button', { name: 'Maybe Later' })).toBeNull();
  });
});
