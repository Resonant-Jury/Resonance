import type { ComponentType } from 'react';

export interface IconRenderProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export type IconRenderer = ComponentType<IconRenderProps>;
