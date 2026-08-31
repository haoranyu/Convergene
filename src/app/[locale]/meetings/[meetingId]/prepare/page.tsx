import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PreparationWorkspace } from '@/features/preparation/preparation-workspace';
import type { AppLocale } from '@/i18n/routing';

interface PrepareMeetingPageProps {
  params: Promise<{ locale: AppLocale; meetingId: string }>;
}

export async function generateMetadata({ params }: PrepareMeetingPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'preparation.metadata' });
  return { description: t('description'), title: `${t('title')} · Convergene` };
}

export default async function PrepareMeetingPage({ params }: PrepareMeetingPageProps) {
  const { locale, meetingId } = await params;
  setRequestLocale(locale);
  return <PreparationWorkspace meetingId={meetingId} />;
}
