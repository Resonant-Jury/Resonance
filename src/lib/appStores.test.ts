import { describe, expect, it } from 'vitest';
import { UA } from '@/../test/userAgents';
import { APP_STORE_URL, PLAY_STORE_URL, devicePlatform, downloadTarget } from './appStores';

describe('devicePlatform', () => {
  it('sends iPhones, iPads and their in-app browsers to the App Store', () => {
    for (const ua of [UA.iPhoneSafari, UA.iPhoneLine, UA.iPadMobileSite]) expect(devicePlatform(ua), ua).toBe('ios');
  });

  it('tells an iPad asking for the desktop site from a Mac by touch, which only a browser knows', () => {
    expect(devicePlatform(UA.iPadDesktopSite, 5)).toBe('ios');
    expect(devicePlatform(UA.iPadDesktopSite)).toBe('desktop');
    expect(devicePlatform(UA.macChrome, 0)).toBe('desktop');
  });

  it('sends Android phones, tablets and in-app browsers to Google Play, though they also say Linux', () => {
    for (const ua of [UA.androidChrome, UA.androidTablet, UA.androidInstagram]) expect(devicePlatform(ua), ua).toBe('android');
  });

  it('knows Mac, Windows, Linux and ChromeOS as computers', () => {
    for (const ua of [UA.macChrome, UA.windowsEdge, UA.linuxFirefox, UA.chromebook]) expect(devicePlatform(ua), ua).toBe('desktop');
  });

  it('leaves anything else unknown, with or without a User-Agent', () => {
    for (const ua of [UA.harmonyNext, UA.curl, '', null, undefined]) expect(devicePlatform(ua), String(ua)).toBe('other');
  });
});

describe('downloadTarget', () => {
  it('is the store for a phone, else the landing page’s download block', () => {
    expect(downloadTarget('ios')).toBe(APP_STORE_URL);
    expect(downloadTarget('android')).toBe(PLAY_STORE_URL);
    expect(downloadTarget('desktop')).toBe('/#download');
    expect(downloadTarget('other')).toBe('/#download');
  });

  it('names the store pages the owner published', () => {
    expect(APP_STORE_URL).toBe('https://apps.apple.com/tw/app/resonance/id6817604797');
    expect(PLAY_STORE_URL).toBe('https://play.google.com/store/apps/details?id=com.resonance.stories');
  });
});
