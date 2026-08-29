import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';

import { routing } from '@/i18n/routing';

const handleI18nRouting = createMiddleware(routing);
const publicBrandAssets = new Set([
  '/brand/apple-touch-icon-180.png',
  '/brand/convergene-app-icon-1024.png',
  '/brand/convergene-app-icon-192.png',
  '/brand/convergene-app-icon-512.png',
  '/brand/convergene-app-icon-maskable.svg',
  '/brand/convergene-app-icon.svg',
  '/brand/convergene-logo-horizontal-1280.png',
  '/brand/convergene-logo-horizontal.svg',
  '/brand/convergene-mark-monochrome.svg',
  '/brand/convergene-mark.svg',
  '/brand/favicon-32.png',
  '/brand/favicon.ico',
]);

function contentSecurityPolicy(nonce: string): string {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self'${isDevelopment ? ' ws:' : ''}`,
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
  ].join('; ');
}

export default function proxy(request: NextRequest) {
  if (publicBrandAssets.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', policy);
  requestHeaders.set('x-nonce', nonce);

  const response = handleI18nRouting(new NextRequest(request, { headers: requestHeaders }));
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher:
    '/((?!api(?:/|$)|trpc(?:/|$)|_next(?:/|$)|_vercel(?:/|$)|favicon\\.ico$|manifest\\.webmanifest$|sitemap\\.xml$|robots\\.txt$).*)',
};
