import '@arco-design/web-react/dist/css/arco.css';
import '../globals.css';

import type { Metadata } from 'next';
import { connection } from 'next/server';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { routing } from '@/i18n/routing';
import { AppProviders } from '@/ui/app-providers';

export const metadata: Metadata = {
  description: 'A personal meeting copilot for people who would rather leave with an answer.',
  icons: {
    apple: [
      {
        sizes: '180x180',
        type: 'image/png',
        url: '/brand/apple-touch-icon-180.png',
      },
    ],
    icon: [
      {
        sizes: '32x32',
        type: 'image/png',
        url: '/brand/favicon-32.png',
      },
      {
        sizes: 'any',
        type: 'image/x-icon',
        url: '/brand/favicon.ico',
      },
    ],
    shortcut: '/brand/favicon.ico',
  },
  title: 'Convergene',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  await connection();
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <AppProviders locale={locale}>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
