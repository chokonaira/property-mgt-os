import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  root(): {
    name: string;
    description: string;
    version: string;
    docs: string;
    health: string;
    repository: string;
  } {
    // Reviewer-facing landing page for the API. Hitting the bare host
    // returns a small JSON envelope instead of "Cannot GET /" so the
    // service self-describes — what it is, where the contract lives,
    // where to look for health checks. Stable + machine-readable so
    // it doubles as an uptime probe target alongside /healthz.
    return {
      name: 'buena-tech-case-study-api',
      description:
        'Property dashboard + AI Teilungserklärung extraction. NestJS + Prisma + PostgreSQL.',
      version: process.env.npm_package_version ?? '0.1.0',
      docs: '/openapi.json',
      health: '/healthz',
      repository: 'https://github.com/chokonaira/property-mgt-os',
    };
  }

  @Get('healthz')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
