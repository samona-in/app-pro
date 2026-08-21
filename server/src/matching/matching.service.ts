import { Injectable } from '@nestjs/common';

/**
 * Matching domain service.
 *
 * Selects which professionals see a job request, from location, skills,
 * availability and rating. Internal domain service with no HTTP surface —
 * jobs drives it.
 *
 * Scaffold only — no behaviour is implemented yet.
 */
@Injectable()
export class MatchingService {}
