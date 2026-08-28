import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  defaultLocale: 'zh-CN',
  localePrefix: 'always',
  locales: ['zh-CN', 'zh-TW', 'en-US'],
});

export type AppLocale = (typeof routing.locales)[number];
