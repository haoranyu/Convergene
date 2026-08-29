import { setRequestLocale } from 'next-intl/server';

import { DashboardHome } from '@/features/dashboard/dashboard-home';
import type { AppLocale } from '@/i18n/routing';

interface HomePageProps {
  params: Promise<{ locale: AppLocale }>;
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <DashboardHome />;
}
