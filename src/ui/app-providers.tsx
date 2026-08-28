'use client';

import { ConfigProvider } from '@arco-design/web-react';
import enUS from '@arco-design/web-react/es/locale/en-US';
import zhCN from '@arco-design/web-react/es/locale/zh-CN';
import zhTW from '@arco-design/web-react/es/locale/zh-TW';
import type { ReactNode } from 'react';

import type { AppLocale } from '@/i18n/routing';

const arcoLocales = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
} satisfies Record<AppLocale, typeof enUS>;

interface AppProvidersProps {
  children: ReactNode;
  locale: AppLocale;
}

export function AppProviders({ children, locale }: AppProvidersProps) {
  return <ConfigProvider locale={arcoLocales[locale]}>{children}</ConfigProvider>;
}
