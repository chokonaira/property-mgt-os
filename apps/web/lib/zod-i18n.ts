import { z, type ZodErrorMap } from 'zod';

type Translator = (key: string, values?: Record<string, string | number>) => string;

// Maps a Zod issue to a key under errors.zod.* and resolves it via a
// next-intl translator. Falls back to the raw default message when no
// dedicated key exists, so we never silently lose the underlying error.
export function zodI18nResolver(t: Translator): ZodErrorMap {
  return (issue, ctx) => {
    switch (issue.code) {
      case z.ZodIssueCode.invalid_type:
        if (issue.received === 'undefined' || issue.received === 'null') {
          return { message: t('zod.required') };
        }
        return {
          message: t('zod.invalid_type', { expected: issue.expected, received: issue.received }),
        };
      case z.ZodIssueCode.invalid_string: {
        const validation =
          typeof issue.validation === 'object'
            ? Object.keys(issue.validation)[0]
            : issue.validation;
        if (validation === 'email') return { message: t('zod.invalid_email') };
        if (validation === 'url') return { message: t('zod.invalid_url') };
        return { message: t('zod.invalid_string') };
      }
      case z.ZodIssueCode.too_small:
        return {
          message: t(issue.type === 'string' ? 'zod.too_small_string' : 'zod.too_small_number', {
            minimum: String(issue.minimum),
          }),
        };
      case z.ZodIssueCode.too_big:
        return {
          message: t(issue.type === 'string' ? 'zod.too_big_string' : 'zod.too_big_number', {
            maximum: String(issue.maximum),
          }),
        };
      case z.ZodIssueCode.invalid_enum_value:
        return { message: t('zod.invalid_enum_value') };
      case z.ZodIssueCode.invalid_union_discriminator:
        return { message: t('zod.invalid_union_discriminator') };
      default:
        return { message: ctx.defaultError };
    }
  };
}
