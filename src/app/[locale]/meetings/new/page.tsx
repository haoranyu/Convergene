import { setRequestLocale } from 'next-intl/server';

import { MeetingCreation } from '@/features/meeting-creation/meeting-creation';
import type { AppLocale } from '@/i18n/routing';

interface NewMeetingPageProps {
  params: Promise<{ locale: AppLocale }>;
}

export default async function NewMeetingPage({ params }: NewMeetingPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MeetingCreation />;
}
