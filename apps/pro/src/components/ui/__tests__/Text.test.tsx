import { render } from '@testing-library/react-native';
import { Text } from '../Text';

describe('Text', () => {
  it('renders the variant classes', () => {
    const { getByText } = render(<Text>Hello</Text>);

    expect(getByText('Hello').props.className).toContain('text-body');
  });

  it('keeps the variant colour when className has none', () => {
    const { getByText } = render(<Text className="mt-2">Hello</Text>);

    expect(getByText('Hello').props.className).toContain('text-text-primary');
  });

  it('drops the variant colour when className overrides it', () => {
    // Regression: Tailwind emits colour utilities alphabetically, so the
    // variant's `text-text-primary` used to win over `text-brand-contrast`,
    // leaving near-black label text on the near-black primary button.
    const { getByText } = render(
      <Text variant="body" className="font-semibold text-brand-contrast">
        Send code
      </Text>,
    );

    const classes = getByText('Send code').props.className as string;
    expect(classes).toContain('text-brand-contrast');
    expect(classes).not.toContain('text-text-primary');
    expect(classes).toContain('text-body');
  });

  it('does not treat size utilities as colour overrides', () => {
    const { getByText } = render(<Text variant="body" className="text-display mt-1" />);

    const classes = getByText('').props.className as string;
    expect(classes).toContain('text-text-primary');
    expect(classes).toContain('text-display');
  });
});
