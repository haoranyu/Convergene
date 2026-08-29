import { setRequestLocale } from 'next-intl/server';

import { MeetingSetupSummary } from '@/features/meeting-creation/meeting-setup-summary';
import type { AppLocale } from '@/i18n/routing';

interface PrepareMeetingPageProps {
  params: Promise<{ locale: AppLocale; meetingId: string }>;
}

export default async function PrepareMeetingPage({ params }: PrepareMeetingPageProps) {
  const { locale, meetingId } = await params;
  setRequestLocale(locale);
  return <MeetingSetupSummary meetingId={meetingId} />;
}
