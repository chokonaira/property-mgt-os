import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { Providers } from '../providers';
import { locales, routing, type Locale } from '@/i18n/routing';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Property OS — A Buena Case Study',
  description:
    'Property dashboard with guided creation flow + AI-powered Teilungserklärung extraction.',
  icons: {
    // Next App Router auto-discovers `app/icon.svg`; the explicit
    // declaration here keeps the manifest predictable and lets the
    // PNG variant slot in later for older browsers.
    icon: '/icon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#020817' },
  ],
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  if (!(locales as readonly string[]).includes(locale)) notFound();

  setRequestLocale(locale as Locale);
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      {/* `suppressHydrationWarning` on body neutralises attributes that
          browser extensions (Grammarly, Honey, password managers) inject
          on `<body>` before React hydrates. Without it, the React
          dev-overlay throws a hydration error pointing at the extension's
          own data-* attrs even though our markup is fine. Suppression
          here is scoped to body's own attribute list, not its children. */}
      <body
        className="min-h-screen bg-background font-sans text-foreground antialiased"
        suppressHydrationWarning
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
