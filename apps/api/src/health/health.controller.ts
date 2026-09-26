import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';

/**
 * Unauthenticated liveness probe for the platform's health check.
 *
 * It has to be public: pointing a health check at an authenticated route returns
 * 401, which a platform reads as unhealthy and never routes traffic to.
 *
 * It touches the database on purpose. A process that is listening but can't
 * reach Postgres serves nothing useful, and reporting it healthy just hides the
 * outage behind a green tick.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // Deliberately no error detail — this endpoint is world-readable.
      throw new ServiceUnavailableException('Database unavailable.');
    }
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }
}
