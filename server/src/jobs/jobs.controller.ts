import { Controller } from '@nestjs/common';
import { JobsService } from './jobs.service';

/**
 * HTTP surface for the jobs domain.
 *
 * Scaffold only — no routes are exposed yet. Every protected route added here
 * must authorise on the server (CLAUDE.md "Security").
 */
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}
}
