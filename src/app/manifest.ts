import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: '#F8FAFC',
    display: 'standalone',
    icons: [
      {
        sizes: '192x192',
        src: '/brand/convergene-app-icon-192.png',
        type: 'image/png',
      },
      {
        sizes: '512x512',
        src: '/brand/convergene-app-icon-512.png',
        type: 'image/png',
      },
      {
        purpose: 'maskable',
        sizes: 'any',
        src: '/brand/convergene-app-icon-maskable.svg',
        type: 'image/svg+xml',
      },
    ],
    name: 'Convergene',
    short_name: 'Convergene',
    start_url: '/',
    theme_color: '#1D4ED8',
  };
}
