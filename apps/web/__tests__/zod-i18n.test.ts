import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodI18nResolver } from '@/lib/zod-i18n';
import enMessages from '@/messages/en.json';
import deMessages from '@/messages/de.json';

interface Catalog {
  errors: { zod: Record<string, string> };
}

function makeTranslator(catalog: Catalog) {
  return (key: string, values?: Record<string, string | number>) => {
    const stripped = key.startsWith('zod.') ? key.slice('zod.'.length) : key;
    const template = catalog.errors.zod[stripped] ?? key;
    if (!values) return template;
    return template.replaceAll(/{(\w+)}/g, (_, name: string) =>
      String(values[name] ?? `{${name}}`),
    );
  };
}

describe('zodI18nResolver', () => {
  const enT = makeTranslator(enMessages as Catalog);
  const deT = makeTranslator(deMessages as Catalog);

  it('localises required (undefined) into the requested locale', () => {
    const Schema = z.string({ errorMap: zodI18nResolver(enT) });
    const enResult = Schema.safeParse(undefined);
    expect(enResult.success).toBe(false);
    if (!enResult.success) {
      expect(enResult.error.issues[0]?.message).toBe('This field is required.');
    }

    const SchemaDe = z.string({ errorMap: zodI18nResolver(deT) });
    const deResult = SchemaDe.safeParse(undefined);
    if (!deResult.success) {
      expect(deResult.error.issues[0]?.message).toBe('Dieses Feld ist erforderlich.');
    }
  });

  it('localises email validation', () => {
    const Schema = z
      .string()
      .email({})
      .refine(() => true);
    const result = z
      .string({ errorMap: zodI18nResolver(enT) })
      .email()
      .safeParse('not-an-email');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Invalid email address.');
    }
    void Schema;
  });

  it('localises too_small for strings with minimum interpolated', () => {
    const Schema = z.string({ errorMap: zodI18nResolver(enT) }).min(3);
    const result = Schema.safeParse('a');
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Must be at least 3 characters.');
    }
  });

  it('localises too_big for numbers', () => {
    const Schema = z.number({ errorMap: zodI18nResolver(deT) }).max(100);
    const result = Schema.safeParse(150);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Darf höchstens 100 betragen.');
    }
  });

  it('falls back to the default message for unmapped issue codes', () => {
    const Schema = z
      .object({ a: z.string() })
      .refine((v) => v.a.length > 0, { message: 'custom-fallback' });
    const result = Schema.safeParse({ a: '' }, { errorMap: zodI18nResolver(enT) });
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('custom-fallback');
    }
  });
});
