// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { renderWithIntl, screen, within } from '@/../test/render';
import { UA } from '@/../test/userAgents';
import en from '@/messages/en.json';
import zh from '@/messages/zh-TW.json';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/appStores';
import { GetTheApp } from './GetTheApp';

// jsdom has no maxTouchPoints; a browser always does.
function device(userAgent: string, maxTouchPoints = 0) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => maxTouchPoints });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
});

const group = () => screen.getByRole('group', { name: en.download.title });
const appStore = () => screen.queryByRole('link', { name: en.download.appStore });
const googlePlay = () => screen.queryByRole('link', { name: en.download.googlePlay });
const qr = () => screen.queryByRole('img', { name: en.download.qr });

describe('GetTheApp', () => {
  it('offers a computer both stores, App Store first, and the QR code with its caption', () => {
    device(UA.macChrome);
    renderWithIntl(<GetTheApp />);

    const links = within(group()).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([APP_STORE_URL, PLAY_STORE_URL]);
    expect(within(links[0]).getByRole('img')).toHaveAttribute('src', '/badges/appstore-en-us.svg');
    expect(within(links[1]).getByRole('img')).toHaveAttribute('src', '/badges/googleplay-en.png');
    expect(qr()).toHaveAttribute('src', '/download-qr.svg');
    expect(screen.getByText(en.download.scan)).toBeInTheDocument();
  });

  it('offers an iPhone, and an iPad asking for the desktop site, the App Store alone', () => {
    device(UA.iPhoneSafari);
    const { unmount } = renderWithIntl(<GetTheApp />);
    expect(appStore()).toHaveAttribute('href', APP_STORE_URL);
    expect(googlePlay()).toBeNull();
    expect(qr()).toBeNull();
    unmount();

    device(UA.iPadDesktopSite, 5);
    renderWithIntl(<GetTheApp />);
    expect(appStore()).toBeInTheDocument();
    expect(googlePlay()).toBeNull();
    expect(qr()).toBeNull();
  });

  it('offers an Android device Google Play alone', () => {
    device(UA.androidChrome);
    renderWithIntl(<GetTheApp />);
    expect(googlePlay()).toHaveAttribute('href', PLAY_STORE_URL);
    expect(appStore()).toBeNull();
    expect(qr()).toBeNull();
  });

  it('offers an unknown device both stores', () => {
    device(UA.harmonyNext);
    renderWithIntl(<GetTheApp />);
    expect(appStore()).toBeInTheDocument();
    expect(googlePlay()).toBeInTheDocument();
  });

  it('leaves the QR code out where the page has it already', () => {
    device(UA.windowsEdge);
    renderWithIntl(<GetTheApp qr={false} />);
    expect(appStore()).toBeInTheDocument();
    expect(googlePlay()).toBeInTheDocument();
    expect(qr()).toBeNull();
  });

  it('shows the Traditional Chinese badges, named in Chinese, on a zh-TW page', () => {
    device(UA.macChrome);
    renderWithIntl(<GetTheApp />, { locale: 'zh-TW', messages: zh });
    expect(screen.getByRole('group', { name: zh.download.title })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: zh.download.appStore })).toHaveAttribute('src', '/badges/appstore-zh-tw.svg');
    expect(screen.getByRole('img', { name: zh.download.googlePlay })).toHaveAttribute('src', '/badges/googleplay-zh-tw.png');
    expect(screen.getByRole('img', { name: zh.download.qr })).toBeInTheDocument();
  });

  it('serves both badges and the QR code, then keeps a phone’s own store once hydrated', async () => {
    const ui: ReactElement = (
      <NextIntlClientProvider locale="en" messages={en}>
        <GetTheApp id="download" />
      </NextIntlClientProvider>
    );
    const host = document.createElement('div');
    host.innerHTML = renderToString(ui);
    document.body.appendChild(host);
    const served = within(host);
    expect(served.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([APP_STORE_URL, PLAY_STORE_URL]);
    expect(served.getByRole('img', { name: en.download.qr })).toBeInTheDocument();

    device(UA.iPhoneSafari);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(host, ui);
    });
    expect(errors).not.toHaveBeenCalled();
    expect(served.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([APP_STORE_URL]);
    expect(served.queryByRole('img', { name: en.download.qr })).toBeNull();
    expect(host.querySelector('#download')).toHaveAttribute('data-platform', 'ios');
    act(() => root?.unmount());
    host.remove();
  });
});
