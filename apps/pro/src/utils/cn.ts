type ClassValue = string | false | null | undefined;

/**
 * Joins conditional class names.
 *
 * Intentionally dependency-free: NativeWind resolves conflicting utilities in
 * source order, so the merge behaviour of `tailwind-merge` is not needed here.
 */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}
