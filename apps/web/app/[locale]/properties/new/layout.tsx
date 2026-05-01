import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { WizardProvider } from '@/components/wizard/wizard-context';
import { WizardChrome } from '@/components/wizard/wizard-chrome';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function WizardLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <WizardProvider>
      <WizardChrome>{children}</WizardChrome>
    </WizardProvider>
  );
}
