import { badRequest } from './errors';

/**
 * Reads a `:id` route parameter.
 *
 * Express 5's route param types are string or repeated string — and strict
 * `noUncheckedIndexedAccess` adds undefined. A real route match always yields a
 * string, so this both asserts that and produces the idiomatic `badRequest`
 * when it somehow does not.
 */
export function routeParamId(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw badRequest('A valid resource id is required in the path.');
  }
  return value;
}