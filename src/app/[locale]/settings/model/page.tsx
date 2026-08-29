import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ProviderConfigSettings } from '@/features/provider-config';
import type { AppLocale } from '@/i18n/routing';

interface ModelSettingsPageProps {
  params: Promise<{ locale: AppLocale }>;
}

export async function generateMetadata({ params }: ModelSettingsPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ProviderConfig.page' });

  return {
    description: t('metadataDescription'),
    title: `${t('title')} · Convergene`,
  };
}

export default async function ModelSettingsPage({ params }: ModelSettingsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ProviderConfigSettings />;
}
