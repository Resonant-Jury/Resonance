'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { OrganicMenuPanel, menuPanelHeight } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { seedFromId } from '@/lib/design/bubble';
import { MessageCore } from './MessageRow';
import { chooseMenuItem, messageMenuItems, useThreadActions, type PressedMessage } from './threadActions';
import styles from './Thread.module.css';

/** The step between the lifted message and its menu, and the room kept from the window's edges. */
const GAP = 10;
const MARGIN = 12;

export interface MessageMenuOverlayProps {
  pressed: PressedMessage;
  own: boolean;
  /** The message's full time, the menu's quiet last line. */
  fullTime: string;
  onClose: () => void;
}

/**
 * What a press-and-hold on a message opens (the apps' — Messenger's and
 * Instagram's feel): the thread dims under an ink scrim, the message — its
 * quote and its bubble with all it carries — is lifted out where it lies, a
 * little larger, and the menu hangs under it (over it when there is no room
 * below; when there is room for neither, the message gives way): Reply, Copy,
 * the link's Open and Copy, Retry and Delete for one that didn't go, and its
 * full time. A tap on the scrim, Escape or a choice puts it away.
 */
export function MessageMenuOverlay({ pressed, own, fullTime, onClose }: MessageMenuOverlayProps) {
  const t = useTranslations('messages');
  const tNative = useTranslations('native');
  const tSafety = useTranslations('safety');
  const tClose = useTranslations('card.note');
  const actions = useThreadActions();
  const { message, link, rect } = pressed;
  const [leaving, setLeaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  const items = messageMenuItems(
    message,
    link,
    {
      reply: t('reply'),
      copy: tNative('copy'),
      openLink: t('openLink'),
      copyLink: t('copyLink'),
      retry: t('retry'),
      discard: t('discardFailed'),
    },
    true,
  );

  const dismiss = (after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    setLeaving(true);
    window.setTimeout(() => {
      onClose();
      after?.();
    }, 120);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The menu takes the focus (not its first row, which would wear a ring under a finger), so Tab walks its rows
  // and a screen reader is in it at once.
  useLayoutEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  // Under the message if the menu fits there, else over it; else the message gives way.
  const vw = window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const menuH = menuPanelHeight(items.length, true);
  const safeTop = MARGIN;
  const safeBottom = vh - MARGIN;
  let below = true;
  let shift = 0;
  let menuY = rect.bottom + GAP;
  if (menuY + menuH > safeBottom) {
    if (rect.top - GAP - menuH >= safeTop) {
      below = false;
      menuY = rect.top - GAP - menuH;
    } else {
      menuY = Math.max(safeTop, safeBottom - menuH);
      shift = -Math.min(Math.max(0, rect.bottom + GAP - menuY), Math.max(0, rect.top - safeTop));
    }
  }
  // A message taller than the window, held by its foot: the menu stays in the window all the same.
  menuY = Math.max(safeTop, menuY);
  const side = own ? 'right' : 'left';
  const menuStyle: CSSProperties = {
    top: menuY,
    ...(own ? { right: Math.max(MARGIN, vw - rect.right) } : { left: Math.max(MARGIN, rect.left) }),
  };

  return createPortal(
    <div className={styles.overlay} data-leaving={leaving || undefined} role="dialog" aria-modal="true" aria-label={tSafety('menuLabel')}>
      <button type="button" className={styles.scrim} aria-label={tClose('close')} onClick={() => dismiss()} />
      <div
        className={styles.lifted}
        data-own={own || undefined}
        style={{ left: rect.left, top: rect.top + shift, width: rect.width, transformOrigin: `${side} center` }}
        aria-hidden="true"
      >
        <MessageCore message={message} own={own} position={pressed.position} carried={pressed.carried} interactive={false} />
      </div>
      <div ref={panelRef} className={styles.overlayMenu} style={menuStyle} tabIndex={-1}>
        <OrganicMenuPanel
          items={items}
          seed={seedFromId(message.key, 23)}
          footer={fullTime}
          origin={`${below ? 'top' : 'bottom'} ${side}`}
          onChoose={(key) =>
            // A tap is shorter than the ink's spread: the menu stays long enough to show it.
            window.setTimeout(() => dismiss(() => chooseMenuItem(key, message, link, actions)), 150)
          }
        />
      </div>
    </div>,
    document.body,
  );
}
