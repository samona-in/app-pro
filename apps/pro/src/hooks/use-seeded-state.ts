import { useCallback, useState } from 'react';

/**
 * Local form state seeded from server data that may arrive after first render.
 *
 * The obvious approach — `useEffect(() => setValue(fromServer))` — fights React
 * twice: it renders once with the wrong value, and it clobbers whatever the
 * user typed if the query refetches.
 *
 * Instead the server value is used until the user touches the field, after
 * which their edit wins. No effect, no flash, no lost input.
 *
 * The edit is wrapped in an object rather than tracked with a boolean ref, so
 * "not yet edited" stays distinguishable from "edited to null" and nothing is
 * read during render.
 */
export function useSeededState<T>(seed: T | undefined | null, fallback: T) {
  const [edit, setEdit] = useState<{ value: T } | null>(null);

  const value = edit ? edit.value : (seed ?? fallback);

  const setValue = useCallback((next: T) => {
    setEdit({ value: next });
  }, []);

  return [value, setValue] as const;
}
