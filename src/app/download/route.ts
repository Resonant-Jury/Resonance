import { devicePlatform, downloadTarget } from '@/lib/appStores';

/**
 * /download — the link the website's QR code encodes (public/download-qr.svg):
 * an iPhone or iPad goes to the App Store, an Android device to Google Play,
 * anything else (a computer, an unknown browser) to the landing page's
 * download block, whose locale the middleware then picks. Outside [locale],
 * so the middleware's matcher leaves the path alone (middleware.test.ts).
 *
 * The answer depends on the User-Agent, so it is never cached; a 302, since
 * the same address answers differently for each device.
 */
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const target = downloadTarget(devicePlatform(req.headers.get('user-agent')));
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(target, req.url).toString(),
      'Cache-Control': 'private, no-store',
      Vary: 'User-Agent',
    },
  });
}
