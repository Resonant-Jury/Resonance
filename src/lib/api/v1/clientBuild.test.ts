import { describe, expect, it } from 'vitest';
import { clientBuild, isPreLetterBuild, LAST_PRE_LETTER_BUILD, PRE_LETTER_VERSION, preferredLanguage } from './clientBuild';

// Which app build a request comes from, by the User-Agent both apps send
// (iOS AppHTTP, Android AppHttp: the same at 7136d72, the store builds) —
// and whether it is one made before letters, which the server still answers
// in the ways it understands (./preLetter).

const ios = (build: string | number, os = '18.5') => `Resonance/2.0.0 (iOS ${os}; build ${build})`;
const android = (build: string | number, os = '15') => `Resonance/2.0.0 (Android ${os}; build ${build})`;
const request = (headers: Record<string, string>) => new Request('http://localhost/api/v1/me', { headers });

describe('clientBuild', () => {
  it("reads the apps' own User-Agent, as AppHTTP and AppHttp write it", () => {
    expect(clientBuild(ios(6))).toEqual({ platform: 'ios', version: '2.0.0', build: 6 });
    expect(clientBuild(android(7))).toEqual({ platform: 'android', version: '2.0.0', build: 7 });
    expect(clientBuild('Resonance/2.1.0 (iOS 26.0.1; build 12)')).toEqual({ platform: 'ios', version: '2.1.0', build: 12 });
    expect(clientBuild('Resonance/2.0.0 (Android Baklava; build 8)')).toEqual({ platform: 'android', version: '2.0.0', build: 8 });
  });

  it('names no build for anything else: the web, scripts, OkHttp itself, a malformed or other platform', () => {
    for (const agent of [
      null,
      undefined,
      '',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
      'node',
      'okhttp/4.12.0',
      'Resonance/test',
      'Resonance/2.0.0 (Windows 11; build 1)',
      'Resonance/2.0.0 (iOS 18.5; build )',
      'Resonance/2.0.0 (iOS 18.5; build six)',
      'resonance/2.0.0 (ios 18.5; build 6)',
      'Something Resonance/2.0.0 (iOS 18.5; build 6)',
    ]) {
      expect(clientBuild(agent)).toBeNull();
    }
  });
});

describe('isPreLetterBuild', () => {
  it('is the store builds and every tester build before them: 2.0.0, iOS ≤ 6, Android ≤ 7', () => {
    expect(PRE_LETTER_VERSION).toBe('2.0.0');
    expect(LAST_PRE_LETTER_BUILD).toEqual({ ios: 6, android: 7 });
    for (const build of [1, 2, 3, 4, 5, 6]) expect(isPreLetterBuild(ios(build))).toBe(true);
    for (const build of [3, 4, 5, 6, 7]) expect(isPreLetterBuild(android(build))).toBe(true);
  });

  it('is never a build after them, nor anything that is no app build', () => {
    expect(isPreLetterBuild(ios(7))).toBe(false);
    expect(isPreLetterBuild(ios(70))).toBe(false);
    expect(isPreLetterBuild(android(8))).toBe(false);
    // Each platform counts its own builds: Android's 7 is a store build, iOS's 7 the first after letters.
    expect(isPreLetterBuild(android(7, '16'))).toBe(true);
    expect(isPreLetterBuild(ios(7, '26.0'))).toBe(false);
    expect(isPreLetterBuild(null)).toBe(false);
    expect(isPreLetterBuild('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36')).toBe(false);
  });

  it('is never another version, even one whose build numbers start again from 1', () => {
    // App Store Connect lets a new version reuse build numbers, so 2.1.0 (1) is not 2.0.0 (1).
    expect(isPreLetterBuild('Resonance/2.1.0 (iOS 26.0; build 1)')).toBe(false);
    expect(isPreLetterBuild('Resonance/2.0.1 (Android 16; build 5)')).toBe(false);
    expect(isPreLetterBuild('Resonance/3.0.0 (iOS 26.0; build 6)')).toBe(false);
    expect(isPreLetterBuild('Resonance/2.0 (Android 15; build 7)')).toBe(false);
    expect(isPreLetterBuild('Resonance/2.0.0-debug (Android 15; build 7)')).toBe(false);
    expect(isPreLetterBuild('Resonance/0 (iOS 18.5; build 0)')).toBe(false);
  });

  it("reads a request's User-Agent header", () => {
    expect(isPreLetterBuild(request({ 'User-Agent': ios(6) }))).toBe(true);
    expect(isPreLetterBuild(request({ 'user-agent': android(7) }))).toBe(true);
    expect(isPreLetterBuild(request({ 'User-Agent': android(8) }))).toBe(false);
    expect(isPreLetterBuild(request({}))).toBe(false);
  });
});

describe('preferredLanguage', () => {
  it('takes the most wanted language, the first on a tie', () => {
    expect(preferredLanguage('zh-TW,zh-Hant;q=0.9,en;q=0.8')).toBe('zh-TW');
    expect(preferredLanguage('en-US,en;q=0.9')).toBe('en-US');
    expect(preferredLanguage('en;q=0.5, zh-Hant-TW;q=0.8')).toBe('zh-Hant-TW');
    expect(preferredLanguage('fr, de')).toBe('fr');
  });

  it('names none for no header, a wildcard, or nothing it can read', () => {
    expect(preferredLanguage(null)).toBeNull();
    expect(preferredLanguage('')).toBeNull();
    expect(preferredLanguage('*')).toBeNull();
    expect(preferredLanguage('en;q=0')).toBeNull();
    expect(preferredLanguage('<script>, en;q=abc')).toBeNull();
  });
});
