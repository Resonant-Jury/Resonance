import { describe, expect, it } from 'vitest';
import { UA } from '@/../test/userAgents';
import { GET } from './route';

const visit = (userAgent?: string) =>
  GET(new Request('https://resonance.channel/download', { headers: userAgent ? { 'user-agent': userAgent } : {} }));

describe('GET /download', () => {
  it('sends a phone to its own store', () => {
    const iphone = visit(UA.iPhoneSafari);
    expect(iphone.status).toBe(302);
    expect(iphone.headers.get('location')).toBe('https://apps.apple.com/tw/app/resonance/id6817604797');
    expect(visit(UA.androidChrome).headers.get('location')).toBe(
      'https://play.google.com/store/apps/details?id=com.resonance.stories',
    );
  });

  it('sends a computer, an unknown browser or none to the landing page’s download block', () => {
    for (const ua of [UA.macChrome, UA.windowsEdge, UA.linuxFirefox, UA.harmonyNext, undefined]) {
      const res = visit(ua);
      expect(res.status, String(ua)).toBe(302);
      expect(res.headers.get('location'), String(ua)).toBe('https://resonance.channel/#download');
    }
  });

  it('is never cached, since the answer depends on the device', () => {
    const res = visit(UA.iPhoneSafari);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('vary')).toBe('User-Agent');
  });
});
