import { useCallback, useState } from 'react';

export function useSeededState<T>(seed: T | undefined | null, fallback: T) {
  const [edit, setEdit] = useState<{ value: T } | null>(null);

  const value = edit ? edit.value : (seed ?? fallback);

  const setValue = useCallback((next: T) => {
    setEdit({ value: next });
  }, []);

  return [value, setValue] as const;
}
