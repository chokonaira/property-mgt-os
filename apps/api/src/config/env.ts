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

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid postgres URL'),
    CORS_ORIGINS: CorsOriginsSchema,
    // AI provider selection. Both keys are optional individually so a
    // dev can run with just one; the cross-validation below requires
    // at least one to be present.
    AI_PROVIDER: z.enum(['anthropic', 'openai']).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().default('gpt-4o-mini'),
    OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5-20251001'),
    ANTHROPIC_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    ANTHROPIC_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(4_096),
    EXTRACTION_MAX_TOKENS: z.coerce.number().int().positive().default(25_000),
    EXTRACTION_PROMPT_VERSION: z.string().default('extract.v1'),
    CHAT_MODEL: z.string().default('gpt-4o-mini'),
    CHAT_MAX_TURNS: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_EXTRACTION_PER_MIN: z.coerce.number().int().positive().default(5),
    RATE_LIMIT_CHAT_PER_MIN: z.coerce.number().int().positive().default(30),
    UPLOAD_DIR: z.string().default('./uploads'),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10_485_760),
    TENANT_DEFAULT_ID: z.string().default('demo'),
  })
  .superRefine((env, ctx) => {
    // At least one AI provider key must be present — otherwise every
    // extraction call will 401 at the LLM boundary and the user gets a
    // misleading INTERNAL 500. Surfacing the gap at boot is cheaper.
    if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ANTHROPIC_API_KEY'],
        message:
          'Set at least one of ANTHROPIC_API_KEY or OPENAI_API_KEY. (Use AI_PROVIDER to pick when both are set.)',
      });
    }
    // If AI_PROVIDER is explicitly pinned, require the matching key —
    // otherwise the runtime would silently downgrade to the present
    // key and ignore the operator's intent.
    if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ANTHROPIC_API_KEY'],
        message: 'AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY.',
      });
    }
    if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_API_KEY'],
        message: 'AI_PROVIDER=openai requires OPENAI_API_KEY.',
      });
    }
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
