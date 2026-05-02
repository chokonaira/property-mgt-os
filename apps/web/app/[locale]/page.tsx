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
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <LocaleSwitcher />
          <Button asChild size="default">
            <Link href="/properties/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{t('createCta')}</span>
            </Link>
          </Button>
        </div>
      </header>
      <PropertiesTable />
    </main>
  );
}
