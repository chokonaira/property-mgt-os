import { describe, expect, it } from 'vitest';
import { defaultLocale, locales, routing } from '@/i18n/routing';

describe('i18n routing config', () => {
  it('declares de + en locales', () => {
    expect(locales).toEqual(['de', 'en']);
  });

  it('defaults to de', () => {
    expect(defaultLocale).toBe('de');
    expect(routing.defaultLocale).toBe('de');
  });

  it('uses as-needed prefix policy so / serves de and /en serves en', () => {
    expect(routing.localePrefix).toBe('as-needed');
  });

  it('persists the choice in a long-lived cookie', () => {
    expect(routing.localeCookie).toBeTypeOf('object');
    if (routing.localeCookie && typeof routing.localeCookie === 'object') {
      expect(routing.localeCookie.name).toBe('BUENA_LOCALE');
    }
  });
});
