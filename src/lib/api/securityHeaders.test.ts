import { describe, expect, it } from 'vitest';
import { reportOnlyPolicy, securityHeaders, type SecurityEnv } from './securityHeaders';

// The headers on every response: framing by other origins refused (enforced),
// and a Content-Security-Policy that only reports — listing what the site
// really loads in each environment, so the reports are about real surprises.

const PRODUCTION: SecurityEnv = {
  NODE_ENV: 'production',
  VERCEL_ENV: 'production',
  R2_PUBLIC_BASE: 'https://pub-123.r2.dev/',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'resonance-stories.firebaseapp.com',
};

const directives = (policy: string) =>
  Object.fromEntries(policy.split('; ').map((d) => { const [name, ...sources] = d.split(' '); return [name, sources]; }));

describe('securityHeaders', () => {
  it('refuses framing by other origins, sniffing and device access; the CSP only reports', () => {
    const headers = Object.fromEntries(securityHeaders(PRODUCTION).map((h) => [h.key, h.value]));
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
    // The one enforced CSP directive; the rest is report-only.
    expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'self'");
    expect(headers['Content-Security-Policy-Report-Only']).toBe(reportOnlyPolicy(PRODUCTION));
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['Permissions-Policy']).toContain('geolocation=()');
  });

  it('are what next.config serves on every path', async () => {
    const { default: config } = await import('../../../next.config');
    const rules = await config.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe('/:path*');
    expect(rules[0].headers.map((h) => h.key)).toEqual(securityHeaders(PRODUCTION).map((h) => h.key));
  });
});

describe('reportOnlyPolicy', () => {
  it('lists what production loads: Firebase Auth and Firestore, the stored pictures, Google Fonts', () => {
    const d = directives(reportOnlyPolicy(PRODUCTION));
    expect(d['default-src']).toEqual(["'self'"]);
    expect(d['script-src']).toEqual(["'self'", "'unsafe-inline'", 'https://apis.google.com', 'https://challenges.cloudflare.com']);
    expect(d['img-src']).toContain('https://pub-123.r2.dev');
    expect(d['media-src']).toContain('https://pub-123.r2.dev');
    expect(d['frame-src']).toEqual(["'self'", 'https://resonance-stories.firebaseapp.com', 'https://apis.google.com', 'https://challenges.cloudflare.com']);
    expect(d['connect-src']).toEqual(
      expect.arrayContaining(['https://firestore.googleapis.com', 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com']),
    );
    expect(d['style-src']).toContain('https://fonts.googleapis.com');
    expect(d['font-src']).toEqual(expect.arrayContaining(['https://fonts.gstatic.com', 'https://cdn.jsdelivr.net']));
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['report-uri']).toEqual(['/api/csp-report']);
    // Nothing development-only, no preview toolbar, no reCAPTCHA unless phone sign-in is on.
    expect(reportOnlyPolicy(PRODUCTION)).not.toMatch(/unsafe-eval|127\.0\.0\.1|vercel\.live|recaptcha/);
  });

  it('lists a former storage host beside the current one while pictures still name it', () => {
    const moving = directives(reportOnlyPolicy({
      ...PRODUCTION,
      R2_PUBLIC_BASE: 'https://img.resonance.channel',
      R2_FORMER_PUBLIC_BASES: 'https://pub-123.r2.dev/,https://img.resonance.channel/',
    }));
    expect(moving['img-src']).toEqual(["'self'", 'data:', 'blob:', 'https://img.resonance.channel', 'https://pub-123.r2.dev']);
    expect(moving['media-src']).toEqual(["'self'", 'blob:', 'https://img.resonance.channel', 'https://pub-123.r2.dev']);
  });

  it('adds the emulators and React Refresh in development, the toolbar on previews, reCAPTCHA with phone sign-in', () => {
    const dev = directives(
      reportOnlyPolicy({
        NODE_ENV: 'development',
        NEXT_PUBLIC_FIREBASE_EMULATOR: 'true',
        NEXT_PUBLIC_EMULATOR_AUTH_PORT: '9491',
        NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT: '8481',
      }),
    );
    expect(dev['script-src']).toContain("'unsafe-eval'");
    expect(dev['connect-src']).toEqual(expect.arrayContaining(['http://127.0.0.1:9491', 'http://127.0.0.1:8481']));
    expect(dev['frame-src']).toContain('http://127.0.0.1:9491');
    expect(dev['frame-src']).not.toContain('http://127.0.0.1:8481');
    // Without R2 or an auth domain configured: no stored-picture host, any Firebase auth domain.
    expect(dev['img-src']).toEqual(["'self'", 'data:', 'blob:']);
    expect(dev['frame-src']).toContain('https://*.firebaseapp.com');

    const preview = directives(reportOnlyPolicy({ ...PRODUCTION, VERCEL_ENV: 'preview' }));
    expect(preview['script-src']).toContain('https://vercel.live');
    expect(preview['frame-src']).toContain('https://vercel.live');

    const phone = directives(reportOnlyPolicy({ ...PRODUCTION, NEXT_PUBLIC_ENABLE_PHONE_OTP: 'true' }));
    expect(phone['script-src']).toEqual(expect.arrayContaining(['https://www.google.com', 'https://www.gstatic.com']));
    expect(phone['frame-src']).toContain('https://www.google.com');
  });
});
