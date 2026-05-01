import { setRequestLocale } from 'next-intl/server';
import { PropertyDetailView } from '@/components/property-detail/detail-view';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function PropertyDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <PropertyDetailView id={id} />
    </main>
  );
}
