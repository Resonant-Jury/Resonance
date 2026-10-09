'use client';

import type { CSSProperties } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/appStores';
import { INK_LIGHT } from '@/lib/design/strokes';
import { useDevicePlatform } from '@/lib/hooks/useDevicePlatform';
import { badgeArt, badgeGeometry, type Store } from './badges';
import styles from './GetTheApp.module.css';

/** The QR code's paper tile (the code itself is QR_SIZE inside it). */
export const QR_TILE = 112;
const QR_SIZE = 96;

export interface GetTheAppProps {
  /**
   * Show computers the QR code (public/download-qr.svg → /download) beside
   * the badges. Leave it on for the page's one download block; a second
   * place on the same page (the footer, a closing section) shows badges only.
   */
  qr?: boolean;
  /** The badges' visible height: md 44px, sm 40px (Apple's minimum). Phones always get 40px. */
  size?: 'md' | 'sm';
  /** What it stands on: the cream page, the terracotta band or the dark footer. */
  tone?: 'paper' | 'terracotta' | 'ink';
  /** An anchor for links (the landing page's download block is `download`). */
  id?: string;
  className?: string;
}

/**
 * The apps' download badges, Apple's and Google's official art at one visible
 * height, App Store first. Every render on the server, and hydration, offers
 * both stores (and the QR code, which CSS shows only to a mouse-and-hover
 * device); once the browser has told its platform, an iPhone or iPad keeps the
 * App Store, an Android device Google Play, and only a computer or an unknown
 * device keeps the QR code. The two badges fit one row on any phone, so
 * dropping one moves nothing below it.
 */
export function GetTheApp({ qr = true, size = 'md', tone = 'paper', id, className }: GetTheAppProps) {
  const t = useTranslations('download');
  const locale = useLocale();
  const platform = useDevicePlatform();
  const stores: Store[] = platform === 'ios' ? ['appStore'] : platform === 'android' ? ['googlePlay'] : ['appStore', 'googlePlay'];
  const showQr = qr && platform !== 'ios' && platform !== 'android';

  return (
    <div
      id={id}
      role="group"
      aria-label={t('title')}
      data-platform={platform ?? undefined}
      className={[styles.root, styles[tone], size === 'sm' ? styles.sm : '', showQr ? styles.withQr : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {showQr && (
        <figure className={styles.qr}>
          <div className={styles.qrTile}>
            <HandDrawnBorder
              w={QR_TILE}
              h={QR_TILE}
              R={14}
              seed={61}
              fillColor="var(--color-card-bg)"
              strokeColor={tone === 'paper' ? 'var(--field-border)' : 'transparent'}
              strokeWidth={INK_LIGHT}
            />
            {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG, drawn crisp at its own size */}
            <img src="/download-qr.svg" alt={t('qr')} width={QR_SIZE} height={QR_SIZE} className={styles.qrImage} />
          </div>
          <figcaption className={styles.caption}>{t('scan')}</figcaption>
        </figure>
      )}
      <div className={styles.badges}>
        {stores.map((store) => (
          <StoreBadge
            key={store}
            store={store}
            locale={locale}
            href={store === 'appStore' ? APP_STORE_URL : PLAY_STORE_URL}
            alt={t(store)}
          />
        ))}
      </div>
    </div>
  );
}

function StoreBadge({ store, locale, href, alt }: { store: Store; locale: string; href: string; alt: string }) {
  const art = badgeArt(store, locale);
  const g = badgeGeometry(art);
  const geometry = {
    '--box-w': g.boxWidth,
    '--img-w': g.imageWidth,
    '--img-h': g.imageHeight,
    '--off-x': g.offsetX,
    '--off-y': g.offsetY,
  } as CSSProperties;
  return (
    <a href={href} className={styles.badge} style={geometry} data-store={store}>
      <span className={styles.badgeArt}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the store's official art, served as published */}
        <img src={art.src} alt={alt} width={art.width} height={art.height} decoding="async" />
      </span>
    </a>
  );
}
