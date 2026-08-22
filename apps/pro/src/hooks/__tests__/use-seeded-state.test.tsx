import { act, renderHook } from '@testing-library/react-native';
import { useSeededState } from '../use-seeded-state';

/**
 * Seeding form state from a query that resolves after first render.
 *
 * The behaviour that matters: the server value shows up when it arrives, but
 * never overwrites something the Pro has already typed.
 */
describe('useSeededState', () => {
  it('uses the fallback before the server value arrives', () => {
    const { result } = renderHook(() => useSeededState<string>(undefined, ''));

    expect(result.current[0]).toBe('');
  });

  it('adopts the server value once it loads', () => {
    const { result, rerender } = renderHook(
      ({ seed }: { seed?: string }) => useSeededState<string>(seed, ''),
      { initialProps: { seed: undefined as string | undefined } },
    );

    expect(result.current[0]).toBe('');
    rerender({ seed: 'Asha Kumar' });
    expect(result.current[0]).toBe('Asha Kumar');
  });

  it('keeps the user edit when the query refetches', () => {
    const { result, rerender } = renderHook(
      ({ seed }: { seed?: string }) => useSeededState<string>(seed, ''),
      { initialProps: { seed: 'Asha Kumar' as string | undefined } },
    );

    act(() => result.current[1]('Asha K'));
    expect(result.current[0]).toBe('Asha K');

    // A refetch must not clobber what the Pro is typing.
    rerender({ seed: 'Asha Kumar' });
    expect(result.current[0]).toBe('Asha K');
  });

  it('distinguishes "not edited" from "edited to empty"', () => {
    const { result, rerender } = renderHook(
      ({ seed }: { seed?: string[] }) => useSeededState<string[]>(seed, []),
      { initialProps: { seed: ['a'] as string[] | undefined } },
    );

    // Deselecting everything is a real answer, not an absence of one.
    act(() => result.current[1]([]));
    rerender({ seed: ['a'] });
    expect(result.current[0]).toEqual([]);
  });
});
