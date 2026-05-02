import { describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env';

const validEnv = {
  DATABASE_URL: 'postgres://buena:buena@localhost:55432/buena',
  CORS_ORIGINS: 'http://localhost:3000,https://app.buena.test',
  OPENAI_API_KEY: 'sk-test-key',
};

describe('loadEnv', () => {
  it('parses a minimal valid env and applies defaults', () => {
    const env = loadEnv(validEnv as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.API_PORT).toBe(3001);
    expect(env.OPENAI_MODEL).toBe('gpt-4o-mini');
    expect(env.UPLOAD_MAX_BYTES).toBe(10_485_760);
  });

  it('splits CORS_ORIGINS into a trimmed string array', () => {
    const env = loadEnv(validEnv as NodeJS.ProcessEnv);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000', 'https://app.buena.test']);
  });

  it('coerces numeric string env vars to numbers', () => {
    const env = loadEnv({
      ...validEnv,
      API_PORT: '4000',
      RATE_LIMIT_EXTRACTION_PER_MIN: '10',
    } as NodeJS.ProcessEnv);
    expect(env.API_PORT).toBe(4000);
    expect(env.RATE_LIMIT_EXTRACTION_PER_MIN).toBe(10);
  });

  it('throws with grouped messages when required vars missing', () => {
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrowError(/env_validation_failed/);
    expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrowError(/DATABASE_URL/);
  });

  it('throws when no AI provider key is set (refinement runs after base passes)', () => {
    // superRefine only fires after the base object passes — so we have
    // to satisfy DATABASE_URL + CORS_ORIGINS before the AI-key check
    // surfaces. The error names ANTHROPIC_API_KEY because that's the
    // default-preferred provider.
    expect(() =>
      loadEnv({
        DATABASE_URL: validEnv.DATABASE_URL,
        CORS_ORIGINS: validEnv.CORS_ORIGINS,
      } as NodeJS.ProcessEnv),
    ).toThrowError(/ANTHROPIC_API_KEY/);
  });

  it('accepts ANTHROPIC_API_KEY alone (no OPENAI_API_KEY required)', () => {
    const env = loadEnv({
      DATABASE_URL: validEnv.DATABASE_URL,
      CORS_ORIGINS: validEnv.CORS_ORIGINS,
      ANTHROPIC_API_KEY: 'sk-ant-test',
    } as NodeJS.ProcessEnv);
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test');
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_MODEL).toBe('claude-haiku-4-5-20251001');
  });

  it('rejects when AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing', () => {
    expect(() =>
      loadEnv({
        ...validEnv,
        AI_PROVIDER: 'anthropic',
      } as NodeJS.ProcessEnv),
    ).toThrowError(/AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY/);
  });

  it('rejects when AI_PROVIDER=openai but OPENAI_API_KEY is missing', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: validEnv.DATABASE_URL,
        CORS_ORIGINS: validEnv.CORS_ORIGINS,
        ANTHROPIC_API_KEY: 'sk-ant-test',
        AI_PROVIDER: 'openai',
      } as NodeJS.ProcessEnv),
    ).toThrowError(/AI_PROVIDER=openai requires OPENAI_API_KEY/);
  });

  it('rejects an invalid DATABASE_URL', () => {
    expect(() =>
      loadEnv({ ...validEnv, DATABASE_URL: 'not-a-url' } as NodeJS.ProcessEnv),
    ).toThrowError(/DATABASE_URL/);
  });

  it('rejects an out-of-range API_PORT', () => {
    expect(() => loadEnv({ ...validEnv, API_PORT: '70000' } as NodeJS.ProcessEnv)).toThrowError(
      /API_PORT/,
    );
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => loadEnv({ ...validEnv, LOG_LEVEL: 'spam' } as NodeJS.ProcessEnv)).toThrowError(
      /LOG_LEVEL/,
    );
  });

  it('rejects CORS_ORIGINS that is whitespace-only after CSV parsing', () => {
    expect(() => loadEnv({ ...validEnv, CORS_ORIGINS: ' , ' } as NodeJS.ProcessEnv)).toThrowError(
      /CORS_ORIGINS/,
    );
    expect(() => loadEnv({ ...validEnv, CORS_ORIGINS: '   ' } as NodeJS.ProcessEnv)).toThrowError(
      /CORS_ORIGINS/,
    );
    expect(() => loadEnv({ ...validEnv, CORS_ORIGINS: '' } as NodeJS.ProcessEnv)).toThrowError(
      /CORS_ORIGINS/,
    );
  });

  it('rejects CORS_ORIGINS entries that are not absolute URLs', () => {
    expect(() =>
      loadEnv({ ...validEnv, CORS_ORIGINS: 'not-a-url' } as NodeJS.ProcessEnv),
    ).toThrowError(/CORS_ORIGINS/);
    expect(() =>
      loadEnv({
        ...validEnv,
        CORS_ORIGINS: 'http://localhost:3000, not-a-url',
      } as NodeJS.ProcessEnv),
    ).toThrowError(/CORS_ORIGINS/);
  });

  it('accepts a single valid CORS origin', () => {
    const env = loadEnv({
      ...validEnv,
      CORS_ORIGINS: 'http://localhost:3000',
    } as NodeJS.ProcessEnv);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });
});
