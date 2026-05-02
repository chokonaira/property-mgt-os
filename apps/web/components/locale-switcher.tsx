'use client';

import { Fragment } from 'react';
import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { locales, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

const fullName: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
};

export function LocaleSwitcher() {
  const active = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label="Locale"
      className={cn(
        'inline-flex items-center gap-1 text-xs uppercase tracking-wide',
        isPending && 'opacity-60',
      )}
    >
      {locales.map((code, idx) => {
        const isActive = code === active;
        return (
          <Fragment key={code}>
            {idx > 0 ? (
              <span aria-hidden="true" className="text-muted-foreground/40">
                /
              </span>
            ) : null}
            <button
              type="button"
              disabled={isPending || isActive}
              aria-pressed={isActive}
              aria-label={fullName[code]}
              onClick={() => {
                startTransition(() => {
                  router.replace(pathname, { locale: code });
                });
              }}
              className={cn(
                'rounded-sm px-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'cursor-default font-bold text-foreground'
                  : 'cursor-pointer font-medium text-muted-foreground hover:text-foreground',
              )}
            >
              {code.toUpperCase()}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
