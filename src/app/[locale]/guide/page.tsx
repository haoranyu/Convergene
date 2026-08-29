import { setRequestLocale } from 'next-intl/server';

import { GuideSandbox } from '@/features/guide/guide-sandbox';
import type { AppLocale } from '@/i18n/routing';

interface GuidePageProps {
  params: Promise<{ locale: AppLocale }>;
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <GuideSandbox />;
}
