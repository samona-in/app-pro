type ClassValue = string | false | null | undefined;

/**
 * Joins conditional class names.
 *
 * Intentionally dependency-free. Note NativeWind does NOT resolve conflicting
 * utilities by className order — equal-specificity rules are decided by their
 * order in the compiled stylesheet — so never rely on `cn` to break a tie
 * between two classes that set the same property.
 */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}
