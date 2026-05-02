import { Controller, Get, Param, Query } from '@nestjs/common';
import type { AuditLogListResponse } from '@buena/shared';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { AuditService } from './audit.service';

const TENANT_ID = process.env.TENANT_DEFAULT_ID ?? 'demo';

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

@Controller('properties')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get(':id/history')
  history(
    @Param('id') id: string,
    @Query('take') takeRaw?: string,
    @Query('skip') skipRaw?: string,
  ): Promise<AuditLogListResponse> {
    const take = clampInt(takeRaw, DEFAULT_TAKE, 1, MAX_TAKE);
    const skip = clampInt(skipRaw, 0, 0, Number.MAX_SAFE_INTEGER);
    return this.audit.listForProperty(TENANT_ID, id, { take, skip });
  }
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
