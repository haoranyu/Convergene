'use client';

import { Button, Card, Progress, Space, Tag, Typography } from '@arco-design/web-react';
import { IconSafe, IconSettings } from '@arco-design/web-react/icon';
import { useTranslations } from 'next-intl';

import { ProviderConfigGate } from '@/features/provider-config';
import { Link, usePathname } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';

import styles from './scaffold-home.module.css';

const localeLabels: Record<AppLocale, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

interface ModeCopy {
  description: string;
  title: string;
}

interface ScaffoldHomeCopy {
  description: string;
  eyebrow: string;
  general: string;
  localOnly: string;
  modes: ModeCopy[];
  readiness: string;
  readinessItems: string[];
  title: string;
}

interface ScaffoldHomeProps {
  copy: ScaffoldHomeCopy;
}

export function ScaffoldHome({ copy }: ScaffoldHomeProps) {
  const pathname = usePathname();
  const providerCopy = useTranslations('ProviderConfig');

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <strong className={styles.brand}>Convergene</strong>
        <div className={styles.headerActions}>
          <Link className={styles.settingsLink} href="/settings/model">
            <IconSettings />
            <span>{providerCopy('actions.manage')}</span>
          </Link>
          <Space aria-label="Language" size="mini" wrap>
            {(Object.entries(localeLabels) as [AppLocale, string][]).map(([locale, label]) => (
              <Link className={styles.localeLink} href={pathname} key={locale} locale={locale}>
                {label}
              </Link>
            ))}
          </Space>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <Typography.Text className={styles.eyebrow}>{copy.eyebrow}</Typography.Text>
          <Typography.Title className={styles.title} heading={1}>
            {copy.title}
          </Typography.Title>
          <Typography.Paragraph className={styles.description}>
            {copy.description}
          </Typography.Paragraph>
          <Space wrap>
            <Tag color="arcoblue">{copy.localOnly}</Tag>
            <Tag>{copy.general}</Tag>
          </Space>
          <div className={styles.heroActions}>
            <ProviderConfigGate>
              {({ open }) => (
                <Button icon={<IconSafe />} onClick={open} type="primary">
                  {providerCopy('actions.open')}
                </Button>
              )}
            </ProviderConfigGate>
            <Link className={styles.heroSettingsLink} href="/settings/model">
              <IconSettings />
              <span>{providerCopy('actions.manage')}</span>
            </Link>
          </div>
        </div>

        <Card className={styles.readinessCard} title={copy.readiness}>
          <Progress percent={100} showText={false} status="success" />
          <ul className={styles.checklist}>
            {copy.readinessItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      </section>

      <section className={styles.modeGrid}>
        {copy.modes.map((mode, index) => (
          <Card
            className={styles.modeCard}
            key={mode.title}
            title={
              <Space>
                <span aria-hidden="true" className={styles.modeIndex}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{mode.title}</span>
              </Space>
            }
          >
            <Typography.Paragraph>{mode.description}</Typography.Paragraph>
          </Card>
        ))}
      </section>
    </main>
  );
}
