import { z } from 'zod';

const CorsOriginsSchema = z
  .string()
  .transform((raw) =>
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(
        z.string().url('CORS_ORIGINS entries must be absolute URLs (e.g. https://app.buena.test)'),
      )
      .min(1, 'CORS_ORIGINS must list at least one origin after parsing'),
  );

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid postgres URL'),
  CORS_ORIGINS: CorsOriginsSchema,
  OPENAI_API_KEY: z
    .string()
    .min(1, 'OPENAI_API_KEY is required (set to a placeholder if AI is disabled)'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  EXTRACTION_MAX_TOKENS: z.coerce.number().int().positive().default(25_000),
  EXTRACTION_PROMPT_VERSION: z.string().default('extract.v1'),
  CHAT_MODEL: z.string().default('gpt-4o-mini'),
  CHAT_MAX_TURNS: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_EXTRACTION_PER_MIN: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_CHAT_PER_MIN: z.coerce.number().int().positive().default(30),
  UPLOAD_DIR: z.string().default('./uploads'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10_485_760),
  TENANT_DEFAULT_ID: z.string().default('demo'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(`env_validation_failed\n${lines.join('\n')}`);
  }
  return result.data;
}
