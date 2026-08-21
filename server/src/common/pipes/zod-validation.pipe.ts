import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates a request payload against a Zod schema.
 *
 * The server is the authority on validity; the client's own checks are a UX
 * convenience only (CLAUDE.md "Validation"). Sharing schemas through
 * `@samona/validation` keeps the two in agreement.
 *
 * Usage:
 *   `@Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput`
 */
@Injectable()
export class ZodValidationPipe<TSchema extends ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const details: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        (details[key] ??= []).push(issue.message);
      }

      throw new BadRequestException({
        message: 'Some fields need attention.',
        details,
      });
    }

    return result.data;
  }
}
