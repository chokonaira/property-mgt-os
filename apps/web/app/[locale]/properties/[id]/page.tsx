import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { ComingSoon } from '@/components/coming-soon';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function PropertyDetailPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PropertyDetailStub />;
}

function PropertyDetailStub() {
  const t = useTranslations('comingSoon.detail');
  return <ComingSoon title={t('title')} description={t('description')} ticketRef="T-103" />;
}
