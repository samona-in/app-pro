import { Controller } from '@nestjs/common';
import { ReviewsService } from './reviews.service';

/**
 * HTTP surface for the reviews domain.
 *
 * Scaffold only — no routes are exposed yet. Every protected route added here
 * must authorise on the server (CLAUDE.md "Security").
 */
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}
}
