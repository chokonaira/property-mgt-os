import {
  HttpException,
  HttpStatus,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { GlobalErrorFilter } from '../shared/error.filter';

interface MockResponse {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function makeHost(): { host: ArgumentsHost; res: MockResponse } {
  const res: MockResponse = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  const req = { headers: {}, url: '/documents' };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

const noopLogger = { warn: vi.fn(), error: vi.fn() } as unknown as Logger;

describe('GlobalErrorFilter status → code mapping', () => {
  it('maps PayloadTooLargeException (413) to PAYLOAD_TOO_LARGE', () => {
    const { host, res } = makeHost();
    new GlobalErrorFilter(noopLogger).catch(new PayloadTooLargeException('File too large'), host);
    expect(res.status).toHaveBeenCalledWith(413);
    const body = res.json.mock.calls[0]?.[0];
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('maps UnsupportedMediaTypeException (415) to UNSUPPORTED_MEDIA_TYPE', () => {
    const { host, res } = makeHost();
    new GlobalErrorFilter(noopLogger).catch(new UnsupportedMediaTypeException('Wrong type'), host);
    expect(res.status).toHaveBeenCalledWith(415);
    const body = res.json.mock.calls[0]?.[0];
    expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('maps ServiceUnavailableException (503) to SERVICE_UNAVAILABLE', () => {
    const { host, res } = makeHost();
    new GlobalErrorFilter(noopLogger).catch(
      new ServiceUnavailableException('Storage offline'),
      host,
    );
    expect(res.status).toHaveBeenCalledWith(503);
    const body = res.json.mock.calls[0]?.[0];
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('falls through to INTERNAL for an unmapped HttpException status', () => {
    const { host, res } = makeHost();
    new GlobalErrorFilter(noopLogger).catch(
      new HttpException('Teapot', HttpStatus.I_AM_A_TEAPOT),
      host,
    );
    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json.mock.calls[0]?.[0].error.code).toBe('INTERNAL');
  });
});
