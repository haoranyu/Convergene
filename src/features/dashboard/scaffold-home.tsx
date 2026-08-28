'use client';

import { Card, Progress, Space, Tag, Typography } from '@arco-design/web-react';

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

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <strong className={styles.brand}>Convergene</strong>
        <Space aria-label="Language" size="mini" wrap>
          {(Object.entries(localeLabels) as [AppLocale, string][]).map(([locale, label]) => (
            <Link className={styles.localeLink} href={pathname} key={locale} locale={locale}>
              {label}
            </Link>
          ))}
        </Space>
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
