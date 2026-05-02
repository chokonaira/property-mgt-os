'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/**
 * Light/dark theme toggle. `next-themes` ships an HTML class on the
 * <html> element; every Tailwind `dark:` variant in the codebase
 * keys off it. The first render is intentionally inert (icon
 * placeholder) — `theme` is only available after hydration; rendering
 * the real icon before that mismatches SSR vs client and Next yells.
 */
export function ThemeToggle() {
  const t = useTranslations('theme');
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" aria-label={t('toggle')} disabled>
        <Sun className="h-4 w-4" aria-hidden="true" />
      </Button>
    );
  }

  const isDark = resolvedTheme === 'dark';
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={isDark ? t('switchToLight') : t('switchToDark')}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}
