'use client';

import { Card, Space, Typography } from '@arco-design/web-react';
import { IconArrowLeft, IconCloud, IconLock, IconSafe } from '@arco-design/web-react/icon';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

import { ProviderConfigPanel } from './provider-config-panel';
import styles from './provider-config-settings.module.css';

export function ProviderConfigSettings() {
  const t = useTranslations('ProviderConfig');

  return (
    <main className={styles.shell}>
      <nav aria-label={t('page.backLabel')} className={styles.topNav}>
        <Link className={styles.backLink} href="/">
          <IconArrowLeft />
          <span>{t('page.back')}</span>
        </Link>
        <strong className={styles.brand}>Convergene</strong>
      </nav>

      <div className={styles.layout}>
        <aside className={styles.contextPanel}>
          <Typography.Text className={styles.eyebrow}>{t('page.eyebrow')}</Typography.Text>
          <Typography.Title className={styles.pageTitle} heading={1}>
            {t('page.title')}
          </Typography.Title>
          <Typography.Paragraph className={styles.lede}>
            {t('page.description')}
          </Typography.Paragraph>

          <Card className={styles.routeCard} bordered={false}>
            <Typography.Text bold>{t('route.title')}</Typography.Text>
            <div className={styles.routeDiagram}>
              <div className={styles.routeStop}>
                <span className={styles.routeIcon}>
                  <IconLock />
                </span>
                <div>
                  <strong>{t('route.browserTitle')}</strong>
                  <span>{t('route.browserDescription')}</span>
                </div>
              </div>
              <span aria-hidden="true" className={styles.routeLine} />
              <div className={styles.routeStop}>
                <span className={styles.routeIcon}>
                  <IconSafe />
                </span>
                <div>
                  <strong>{t('route.vaultTitle')}</strong>
                  <span>{t('route.vaultDescription')}</span>
                </div>
              </div>
              <span aria-hidden="true" className={styles.routeLine} />
              <div className={styles.routeStop}>
                <span className={styles.routeIcon}>
                  <IconCloud />
                </span>
                <div>
                  <strong>{t('route.providerTitle')}</strong>
                  <span>{t('route.providerDescription')}</span>
                </div>
              </div>
            </div>
          </Card>

          <Space className={styles.boundaryNote} direction="vertical" size="mini">
            <Typography.Text bold>{t('privacy.title')}</Typography.Text>
            <Typography.Text>{t('privacy.encrypted')}</Typography.Text>
            <Typography.Text>{t('privacy.meetings')}</Typography.Text>
            <Typography.Text>{t('privacy.expiry')}</Typography.Text>
            <Typography.Text>{t('privacy.provider')}</Typography.Text>
          </Space>
        </aside>

        <section aria-labelledby="provider-config-section" className={styles.configColumn}>
          <h2 className={styles.visuallyHidden} id="provider-config-section">
            {t('form.title')}
          </h2>
          <ProviderConfigPanel />
        </section>
      </div>
    </main>
  );
}
