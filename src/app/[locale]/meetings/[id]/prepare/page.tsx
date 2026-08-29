import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PreparationWorkspace } from '@/features/preparation/preparation-workspace';
import type { AppLocale } from '@/i18n/routing';

interface PreparationPageProps {
  params: Promise<{ id: string; locale: AppLocale }>;
}

export async function generateMetadata({ params }: PreparationPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'preparation.metadata' });
  return { description: t('description'), title: t('title') };
}

export default async function PreparationPage({ params }: PreparationPageProps) {
  const { id, locale } = await params;
  setRequestLocale(locale);
  return <PreparationWorkspace meetingId={id} />;
}
