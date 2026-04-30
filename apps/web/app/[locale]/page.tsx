import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/locale-switcher';

interface HomeProps {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: HomeProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Home />;
}

function Home() {
  const tCommon = useTranslations('common');
  const tHome = useTranslations('home');

  return (
    <main className="container relative flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:px-6 sm:py-24">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <LocaleSwitcher />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">{tCommon('appName')}</h1>
      <p className="max-w-md text-balance text-muted-foreground">{tHome('tagline')}</p>
      <Button size="lg">{tHome('cta')}</Button>
    </main>
  );
}
