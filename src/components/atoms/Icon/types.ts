import type { ComponentType } from 'react';

export interface IconRenderProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Interior fill — only icons with a fillable body (e.g. bookmark) use it. */
  fill?: string;
}

export type IconRenderer = ComponentType<IconRenderProps>;
