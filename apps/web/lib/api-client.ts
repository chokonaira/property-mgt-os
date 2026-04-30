import type { ZodSchema } from 'zod';
import { ZodError } from 'zod';

const ErrorEnvelopeSchema = {
  parse: (raw: unknown): ApiErrorBody | null => {
    if (typeof raw !== 'object' || raw === null) return null;
    const error = (raw as { error?: unknown }).error;
    if (typeof error !== 'object' || error === null) return null;
    const e = error as Record<string, unknown>;
    if (typeof e.code !== 'string' || typeof e.message !== 'string') return null;
    return {
      code: e.code,
      message: e.message,
      details: e.details,
      requestId: typeof e.requestId === 'string' ? e.requestId : undefined,
    };
  },
};

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
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
  const parsed: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const envelope = ErrorEnvelopeSchema.parse(parsed) ?? {
      code: 'UNKNOWN',
      message: res.statusText || 'Request failed',
    };
    throw new ApiError(res.status, envelope);
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
