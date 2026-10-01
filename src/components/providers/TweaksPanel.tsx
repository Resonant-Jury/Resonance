'use client';

import { useCallback, useEffect, useState } from 'react';

const TWEAK_DEFAULTS: TweakState = {
  accentColor: 'terracotta',
  fontFamily: 'default',
  grainIntensity: 2,
};

/**
 * Each accent theme re-tints the whole neutral scale, not just the accent
 * pair: paper (cream), card fill, text inks, field borders and placeholder
 * all drift toward the accent's hue at low chroma, mirroring how the default
 * terracotta theme keeps its neutrals warm (hue 60–80). Every entry sets the
 * full token set so switching themes never leaves stale overrides behind —
 * `terracotta` restores the tokens.css defaults verbatim.
 * (`--field-border-focus` is var(--color-terracotta), so it follows for free.)
 */
export const ACCENT_MAP: Record<string, Record<string, string>> = {
  // Warm terracotta — the tokens.css defaults.
  terracotta: {
    '--color-terracotta': 'oklch(62% 0.14 45)',
    '--color-terracotta-light': 'oklch(88% 0.08 55)',
    '--color-cream': 'oklch(96.5% 0.015 75)',
    '--color-cream-dark': 'oklch(93% 0.018 75)',
    '--color-card-bg': 'oklch(97.5% 0.01 80)',
    '--color-text': 'oklch(26% 0.03 60)',
    '--color-text-muted': 'oklch(52% 0.04 70)',
    '--field-border': 'oklch(80% 0.02 75)',
    '--field-border-hover': 'oklch(60% 0.04 60)',
    '--placeholder': 'oklch(64% 0.03 70)',
  },
  // Sage — celadon paper, fir-green inks.
  sage: {
    '--color-terracotta': 'oklch(55% 0.13 140)',
    '--color-terracotta-light': 'oklch(86% 0.07 140)',
    '--color-cream': 'oklch(96.5% 0.013 140)',
    '--color-cream-dark': 'oklch(93% 0.016 140)',
    '--color-card-bg': 'oklch(97.5% 0.009 145)',
    '--color-text': 'oklch(26% 0.025 150)',
    '--color-text-muted': 'oklch(50% 0.035 145)',
    '--field-border': 'oklch(80% 0.02 140)',
    '--field-border-hover': 'oklch(58% 0.04 142)',
    '--placeholder': 'oklch(63% 0.03 142)',
  },
  // Lavender — cool lilac paper, plum-gray inks. Purple tints read strongly,
  // so the neutrals carry slightly less chroma than the warm themes.
  lavender: {
    '--color-terracotta': 'oklch(58% 0.14 290)',
    '--color-terracotta-light': 'oklch(87% 0.065 295)',
    '--color-cream': 'oklch(96.5% 0.012 300)',
    '--color-cream-dark': 'oklch(93.5% 0.015 300)',
    '--color-card-bg': 'oklch(97.5% 0.008 305)',
    '--color-text': 'oklch(26% 0.025 295)',
    '--color-text-muted': 'oklch(50% 0.035 295)',
    '--field-border': 'oklch(80% 0.02 295)',
    '--field-border-hover': 'oklch(58% 0.04 292)',
    '--placeholder': 'oklch(63% 0.03 295)',
  },
  // Gold — honeyed paper, umber inks. The accent sits a touch deeper than the
  // old 68%-lightness gold so cream text on primary buttons stays legible.
  yellow: {
    '--color-terracotta': 'oklch(64% 0.13 78)',
    '--color-terracotta-light': 'oklch(90% 0.09 90)',
    '--color-cream': 'oklch(96.5% 0.02 95)',
    '--color-cream-dark': 'oklch(93% 0.024 95)',
    '--color-card-bg': 'oklch(97.5% 0.013 98)',
    '--color-text': 'oklch(26% 0.03 80)',
    '--color-text-muted': 'oklch(52% 0.045 88)',
    '--field-border': 'oklch(80% 0.025 92)',
    '--field-border-hover': 'oklch(60% 0.045 85)',
    '--placeholder': 'oklch(64% 0.035 90)',
  },
};

// The self-hosted faces are named through the variables next/font sets on
// <html> (src/styles/fonts.ts) — their real family names are hashed. `default`
// is tokens.css's --font-heading.
const FONT_MAP: Record<string, string> = {
  default: "var(--font-playfair, 'Playfair Display'), var(--font-noto-serif-tc, 'Noto Serif TC'), Georgia, serif",
  handwritten: "'ChenYuluoyan Thin', var(--font-noto-serif-tc, 'Noto Serif TC'), cursive",
};

const GRAIN_MAP = [0, 0.055, 0.1, 0.18];

const STORAGE_KEY = 'resonance-tweaks';

// Card density is gone: it wrote grid-template-columns onto every card grid in
// the page at load, which outlived the grid it was meant for (CardLinkGrid's
// masonry reuses the node: an empty fourth column on a wide screen). Each grid
// owns its columns.
export interface TweakState {
  accentColor: string;
  fontFamily: string;
  grainIntensity: number;
}

export { TWEAK_DEFAULTS };

/** Read persisted tweaks, falling back to defaults. SSR-safe; storage blocked (site data off, a sandboxed frame) reads as nothing saved. */
export function loadTweaks(): TweakState {
  if (typeof window === 'undefined') return TWEAK_DEFAULTS;
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed as Record<string, unknown>;
  } catch {
    saved = {};
  }
  return {
    accentColor: typeof saved.accentColor === 'string' ? saved.accentColor : TWEAK_DEFAULTS.accentColor,
    fontFamily: typeof saved.fontFamily === 'string' ? saved.fontFamily : TWEAK_DEFAULTS.fontFamily,
    grainIntensity: typeof saved.grainIntensity === 'number' ? saved.grainIntensity : TWEAK_DEFAULTS.grainIntensity,
  };
}

/**
 * Apply a tweak set to the live document and persist it. Runs in the root
 * layout on every page, so nothing here may throw: without storage the
 * choice simply isn't remembered.
 */
export function applyTweaks(vals: TweakState) {
  const root = document.documentElement;
  const accent = ACCENT_MAP[vals.accentColor] || ACCENT_MAP.terracotta;
  Object.entries(accent).forEach(([k, v]) => root.style.setProperty(k, v));
  root.style.setProperty('--font-heading', FONT_MAP[vals.fontFamily] || FONT_MAP.default);
  root.style.setProperty('--grain-opacity', String(GRAIN_MAP[vals.grainIntensity] ?? 0.055));
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(vals));
  } catch {
    // Storage blocked (SecurityError) or full: the tweak lasts this page.
  }
  postToEditor({ type: '__edit_mode_set_keys', edits: vals });
}

/** The design-iteration iframe's handshake; nothing listens outside one. */
function postToEditor(message: unknown) {
  try {
    if (window.parent !== window) window.parent.postMessage(message, '*');
  } catch {
    // A parent that can't be reached isn't the editor.
  }
}

/**
 * Hook for the Settings "Appearance" section: exposes the current tweak state
 * plus an `update(patch)` that applies + persists. State lives in localStorage
 * (shared with the global provider below), so changes take effect app-wide.
 */
export function useTweaks() {
  const [state, setState] = useState<TweakState>(TWEAK_DEFAULTS);

  useEffect(() => {
    setState(loadTweaks());
  }, []);

  const update = useCallback((patch: Partial<TweakState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      applyTweaks(next);
      return next;
    });
  }, []);

  return { state, update };
}

/**
 * Silent global provider: applies persisted tweaks on mount so the user's saved
 * accent / font / grain are honored on every page. Renders nothing — the
 * controls now live in Settings → Appearance. Retains the edit-mode
 * postMessage handshake used by the external design-iteration iframe.
 */
export default function TweaksPanel() {
  useEffect(() => {
    applyTweaks(loadTweaks());
    postToEditor({ type: '__edit_mode_available' });
  }, []);

  return null;
}
