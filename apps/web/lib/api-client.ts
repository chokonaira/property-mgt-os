import type { ZodSchema } from 'zod';
import { ZodError } from 'zod';
import { ApiErrorEnvelopeSchema } from '@buena/shared';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

function parseEnvelope(raw: unknown): ApiErrorBody | null {
  const result = ApiErrorEnvelopeSchema.safeParse(raw);
  if (!result.success) return null;
  return result.data.error;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = 'ApiError';
  }
}

export class ApiSchemaError extends Error {
  constructor(
    public readonly issues: ZodError['issues'],
    public readonly raw: unknown,
  ) {
    super('API response failed schema validation.');
    this.name = 'ApiSchemaError';
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  baseUrl?: string;
}

const DEFAULT_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function apiFetch<T>(
  path: string,
  schema: ZodSchema<T>,
  { baseUrl, body, headers, ...init }: ApiFetchOptions = {},
): Promise<T> {
  const url = `${baseUrl ?? DEFAULT_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown = null;
  let parseFailed = false;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parseFailed = true;
    }
  }

  if (!res.ok) {
    const envelope = parseFailed ? null : parseEnvelope(parsed);
    throw new ApiError(
      res.status,
      envelope ?? {
        code: 'UNKNOWN',
        message: text || res.statusText || 'Request failed',
      },
    );
  }

  if (parseFailed) {
    throw new ApiSchemaError(
      [
        { code: 'custom', path: [], message: 'Response body is not valid JSON.' },
      ] as ZodError['issues'],
      text,
    );
  }

  try {
    return schema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiSchemaError(error.issues, parsed);
    }
    throw error;
  }
}
