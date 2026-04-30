import { defineRouting } from 'next-intl/routing';

export const locales = ['de', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'de';

export const routing = defineRouting({
  locales: [...locales],
  defaultLocale,
  localePrefix: 'as-needed',
  localeCookie: { name: 'BUENA_LOCALE', maxAge: 60 * 60 * 24 * 365 },
});
