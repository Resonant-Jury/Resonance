import { serveLinkImage } from '@/lib/links/imageProxy';

// The fetch uses node:http and sharp, never the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A fetch (5 s at most) and a decode of a picture of up to 5 MB.
export const maxDuration = 20;

/**
 * GET /api/link-image?u=<url>&s=<signature> — the picture of a link preview,
 * re-encoded as a small WebP (see lib/links/imageProxy). Public, because
 * images are loaded without credentials; the signature `s` — an HMAC of `u`
 * made when a message was unfurled — is what keeps it from being an open
 * proxy. Anything wrong is the same bare 404.
 */
export async function GET(req: Request) {
  return serveLinkImage(new URL(req.url));
}
