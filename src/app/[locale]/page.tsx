import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ScaffoldHome } from '@/features/dashboard/scaffold-home';
import type { AppLocale } from '@/i18n/routing';

interface HomePageProps {
  params: Promise<{ locale: AppLocale }>;
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'Home' });

  return (
    <ScaffoldHome
      copy={{
        description: t('description'),
        eyebrow: t('eyebrow'),
        general: t('modes.general'),
        localOnly: t('localOnly'),
        modes: [
          { description: t('modes.decisionDescription'), title: t('modes.decision') },
          { description: t('modes.brainstormDescription'), title: t('modes.brainstorm') },
          { description: t('modes.retroDescription'), title: t('modes.retro') },
        ],
        readiness: t('readiness'),
        readinessItems: [
          t('readinessItems.routing'),
          t('readinessItems.ui'),
          t('readinessItems.quality'),
        ],
        title: t('title'),
      }}
    />
  );
}
