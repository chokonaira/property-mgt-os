import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { ComingSoon } from '@/components/coming-soon';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function NewPropertyPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NewPropertyStub />;
}

function NewPropertyStub() {
  const t = useTranslations('comingSoon.wizard');
  return <ComingSoon title={t('title')} description={t('description')} ticketRef="T-201" />;
}
