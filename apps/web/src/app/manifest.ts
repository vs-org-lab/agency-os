import type { MetadataRoute } from 'next';
import messages from '@agency-os/i18n/messages/pt-PT';

const CANVAS_DARK = '#0A0F15';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: messages.app.name,
    short_name: messages.app.name,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: CANVAS_DARK,
    background_color: CANVAS_DARK,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
