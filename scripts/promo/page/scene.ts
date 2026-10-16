import type { Copy, Locale } from './copy';

export interface SceneContext {
  locale: Locale;
  copy: Copy;
}

export interface SceneInstance {
  /** The scene's full-stage layer (1920 × 1080), drawn over the scenes before it. */
  root: HTMLElement;
  /** Sets every element for local time t (seconds since the scene's start). Pure: no state between calls. */
  update(t: number): void;
}

export interface Scene {
  id: string;
  /** Global seconds the scene is on screen; it overlaps its neighbours by the cross-fade. */
  start: number;
  end: number;
  /** The stage cross-fades a scene in over its first `fadeIn` seconds (default CROSS_FADE; 0: the scene brings itself in). */
  fadeIn?: number;
  build(ctx: SceneContext): SceneInstance;
}
