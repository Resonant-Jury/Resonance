'use client';

import { useCallback, useEffect, useState } from 'react';

const TWEAK_DEFAULTS = {
  accentColor: 'terracotta',
  fontFamily: 'default',
  cardDensity: 'compact',
  grainIntensity: 2,
};

export const ACCENT_MAP: Record<string, Record<string, string>> = {
  terracotta: {
    '--color-terracotta': 'oklch(62% 0.14 45)',
    '--color-terracotta-light': 'oklch(88% 0.08 55)',
  },
  sage: {
    '--color-terracotta': 'oklch(55% 0.13 140)',
    '--color-terracotta-light': 'oklch(80% 0.09 140)',
  },
  lavender: {
    '--color-terracotta': 'oklch(58% 0.14 290)',
    '--color-terracotta-light': 'oklch(83% 0.08 290)',
  },
  yellow: {
    '--color-terracotta': 'oklch(68% 0.15 80)',
    '--color-terracotta-light': 'oklch(90% 0.10 85)',
  },
};

const FONT_MAP: Record<string, string> = {
  default: "'Playfair Display', 'Noto Serif TC', Georgia, serif",
  handwritten: "'ChenYuluoyan Thin', 'Noto Serif TC', cursive",
};

const DENSITY_MAP: Record<string, string> = {
  normal: 'repeat(auto-fill, minmax(300px, 1fr))',
  compact: 'repeat(auto-fill, minmax(240px, 1fr))',
  airy: 'repeat(auto-fill, minmax(380px, 1fr))',
};

const GRAIN_MAP = [0, 0.055, 0.1, 0.18];

const STORAGE_KEY = 'resonance-tweaks';

export interface TweakState {
  accentColor: string;
  fontFamily: string;
  cardDensity: string;
  grainIntensity: number;
}

export { TWEAK_DEFAULTS };

/** Read persisted tweaks, falling back to defaults. SSR-safe. */
export function loadTweaks(): TweakState {
  if (typeof window === 'undefined') return TWEAK_DEFAULTS;
  let saved: Partial<TweakState> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    saved = {};
  }
  return { ...TWEAK_DEFAULTS, ...saved };
}

/** Apply a tweak set to the live document and persist it. */
export function applyTweaks(vals: TweakState) {
  const root = document.documentElement;
  const accent = ACCENT_MAP[vals.accentColor] || ACCENT_MAP.terracotta;
  Object.entries(accent).forEach(([k, v]) => root.style.setProperty(k, v));
  root.style.setProperty('--font-heading', FONT_MAP[vals.fontFamily] || FONT_MAP.default);
  document.querySelectorAll<HTMLElement>('[data-card-grid]').forEach((el) => {
    el.style.gridTemplateColumns = DENSITY_MAP[vals.cardDensity] || DENSITY_MAP.normal;
  });
  root.style.setProperty('--grain-opacity', String(GRAIN_MAP[vals.grainIntensity] ?? 0.055));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vals));
  window.parent.postMessage({ type: '__edit_mode_set_keys', edits: vals }, '*');
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
 * accent / font / density / grain are honored on every page. Renders nothing —
 * the controls now live in Settings → Appearance. Retains the edit-mode
 * postMessage handshake used by the external design-iteration iframe.
 */
export default function TweaksPanel() {
  useEffect(() => {
    applyTweaks(loadTweaks());
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
  }, []);

  return null;
}
