import type { MetadataRoute } from 'next';

// PWA install manifest. Next.js serves this at /manifest.webmanifest and injects
// the <link rel="manifest"> automatically. Colors mirror the brand tokens (cream
// surface / terracotta accent) used by public/icon.svg.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Resonance — Let lives influence lives',
    short_name: 'Resonance',
    description: 'A space for real life stories from around the world to connect.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#faf2e9',
    theme_color: '#faf2e9',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/icon-192.png', type: 'image/png', sizes: '192x192', purpose: 'any' },
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512', purpose: 'any' },
      { src: '/icon-maskable-192.png', type: 'image/png', sizes: '192x192', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ],
  };
}
