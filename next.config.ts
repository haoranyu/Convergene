import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

export default withNextIntl({
  experimental: { globalNotFound: true },
  reactStrictMode: true,
});
