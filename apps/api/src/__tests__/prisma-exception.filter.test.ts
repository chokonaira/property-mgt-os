import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { ArgumentsHost } from '@nestjs/common';
import { PrismaExceptionFilter } from '../shared/prisma-exception.filter';

interface MockResponse {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function makeHost(headers: Record<string, string> = {}): {
  host: ArgumentsHost;
  res: MockResponse;
} {
  const res: MockResponse = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  const req = { headers, url: '/properties' };
  const host = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('PrismaExceptionFilter', () => {
  const filter = new PrismaExceptionFilter();

  it('maps P2002 unique constraint violation to 409 CONFLICT envelope', () => {
    const { host, res } = makeHost({ 'x-request-id': 'req_1' });
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['tenantId', 'uniqueNumber'] },
    });

    filter.catch(err, host);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0]?.[0];
    expect(body).toMatchObject({
      error: {
        code: 'CONFLICT',
        message: expect.stringContaining('tenantId, uniqueNumber') as unknown,
        requestId: 'req_1',
      },
    });
  });

  it('maps P2025 record-not-found to 404 NOT_FOUND envelope', () => {
    const { host, res } = makeHost();
    const err = new Prisma.PrismaClientKnownRequestError('Record to update not found', {
      code: 'P2025',
      clientVersion: '5.22.0',
    });

    filter.catch(err, host);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0]?.[0]).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('rethrows unmapped Prisma codes so the global filter takes over', () => {
    const { host } = makeHost();
    const err = new Prisma.PrismaClientKnownRequestError('Some other failure', {
      code: 'P2010',
      clientVersion: '5.22.0',
    });

    expect(() => filter.catch(err, host)).toThrow(err);
  });
});
