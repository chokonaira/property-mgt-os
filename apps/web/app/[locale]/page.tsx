import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { PropertiesTable } from '@/components/properties-table';
import { ThemeToggle } from '@/components/theme-toggle';
import { Link } from '@/i18n/navigation';

interface DashboardPageProps {
  params: Promise<{ locale: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Dashboard />;
}

function Dashboard() {
  const t = useTranslations('dashboard');
  return (
    <main className="flex min-h-screen flex-col">
      {/* Sticky chrome keeps the Create CTA in reach when the table
          scrolls past a screenful of properties. The wrapper is the
          full-bleed sticky container; the inner div re-applies the
          page's max width + padding so the row still looks centred. */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        {/* Single horizontal row at every breakpoint so mobile shows
            title + theme + locale + Create on one line. The CTA
            shrinks to an icon + "New" on narrow screens (the title
            already says "Properties", so the redundant "property"
            word is the easiest character budget to recover). */}
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-2xl">
              {t('title')}
            </h1>
            <p className="hidden text-xs text-muted-foreground sm:block sm:text-sm">
              {t('subtitle')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <ThemeToggle />
            <LocaleSwitcher />
            <Button asChild className="h-8 px-2.5 text-xs sm:h-9 sm:px-4 sm:text-sm">
              <Link href="/properties/new" aria-label={t('createCta')}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="sm:hidden">{t('createCtaShort')}</span>
                <span className="hidden sm:inline">{t('createCta')}</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <PropertiesTable />
      </div>
    </main>
  );
}
