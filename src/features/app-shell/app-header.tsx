'use client';

import { IconLanguage, IconSettings } from '@arco-design/web-react/icon';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Suspense } from 'react';

import { Link, usePathname, useRouter } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';

import styles from './app-shell.module.css';
import { LocalDataDrawer } from './local-data-drawer';
import { ModelStatusControl } from './model-status-control';

const appLocales: AppLocale[] = ['en-US', 'zh-CN', 'zh-TW'];
const compactLocaleLabels: Record<AppLocale, string> = {
  'en-US': 'EN',
  'zh-CN': '简',
  'zh-TW': '繁',
};

interface AppHeaderProps {
  showModelStatus?: boolean;
  title?: string;
}

function LocaleSelect({ pathname }: { pathname: string }) {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('appShell');
  const query = searchParams.toString();
  const href = `${pathname}${query ? `?${query}` : ''}`;

  return (
    <label className={styles.localeSelect} title={t('languageLabel')}>
      <IconLanguage aria-hidden="true" />
      <span className={styles.visuallyHidden}>{t('languageLabel')}</span>
      <select
        aria-label={t('languageLabel')}
        onChange={(event) => router.replace(href, { locale: event.target.value as AppLocale })}
        value={locale}
      >
        {appLocales.map((candidate) => (
          <option aria-label={t(`languages.${candidate}`)} key={candidate} value={candidate}>
            {compactLocaleLabels[candidate]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AppHeader({ showModelStatus = true, title }: AppHeaderProps) {
  const pathname = usePathname();
  const t = useTranslations('appShell');

  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <strong className={styles.brand}>
          <Link aria-label="Convergene" className={styles.brandLink} href="/">
            <Image
              alt=""
              aria-hidden="true"
              className={styles.brandMark}
              height={24}
              src="/brand/convergene-mark.svg"
              unoptimized
              width={24}
            />
            <span className={styles.brandName}>Convergene</span>
          </Link>
        </strong>
        {title ? <span className={styles.pageTitle}>{title}</span> : null}
      </div>
      <nav aria-label={t('navigationLabel')} className={styles.headerActions}>
        <LocalDataDrawer />
        {showModelStatus ? <ModelStatusControl /> : null}
        <Link aria-label={t('settings')} className={styles.iconLink} href="/settings/model">
          <IconSettings aria-hidden="true" />
        </Link>
        <Suspense
          fallback={
            <span aria-label={t('languageLabel')} className={styles.localeLoading}>
              <IconLanguage aria-hidden="true" />
            </span>
          }
        >
          <LocaleSelect pathname={pathname} />
        </Suspense>
      </nav>
    </header>
  );
}
