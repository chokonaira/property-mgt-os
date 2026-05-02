'use client';

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
      className="inline-flex items-center rounded-md border border-input bg-background"
    >
      {locales.map((code, idx) => {
        const isActive = code === active;
        return (
          <button
            key={code}
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
              'h-9 px-2.5 text-xs uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              idx === 0 ? 'rounded-l-md' : 'rounded-r-md',
              isActive
                ? 'cursor-default font-bold text-foreground'
                : 'cursor-pointer font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
              isPending && 'opacity-60',
            )}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
