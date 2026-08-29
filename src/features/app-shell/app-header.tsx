'use client';

import { IconSettings } from '@arco-design/web-react/icon';
import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';

import styles from './app-shell.module.css';
import { LocalDataDrawer } from './local-data-drawer';
import { ModelStatusControl } from './model-status-control';

const localeLabels: Record<AppLocale, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

interface AppHeaderProps {
  title?: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  const pathname = usePathname();
  const t = useTranslations('appShell');

  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <Link className={styles.brand} href="/">
          Convergene
        </Link>
        {title ? <span className={styles.pageTitle}>{title}</span> : null}
      </div>
      <nav aria-label={t('navigationLabel')} className={styles.headerActions}>
        <LocalDataDrawer />
        <ModelStatusControl />
        <Link aria-label={t('settings')} className={styles.iconLink} href="/settings/model">
          <IconSettings aria-hidden="true" />
        </Link>
        <div aria-label={t('languageLabel')} className={styles.locales} role="group">
          {(Object.entries(localeLabels) as [AppLocale, string][]).map(([locale, label]) => (
            <Link className={styles.localeLink} href={pathname} key={locale} locale={locale}>
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
