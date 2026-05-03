import { defineRouting } from 'next-intl/routing';

export const locales = ['de', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'de';

export const routing = defineRouting({
  locales: [...locales],
  defaultLocale,
  localePrefix: 'as-needed',
  // Pin first-load to defaultLocale (DE) regardless of the browser's
  // Accept-Language. Buena's product is German-first; an English-
  // speaking visitor still lands in DE and can flip to EN via the
  // header switcher. The persisted BUENA_LOCALE cookie respects the
  // user's choice on subsequent loads.
  localeDetection: false,
  localeCookie: { name: 'BUENA_LOCALE', maxAge: 60 * 60 * 24 * 365 },
});
