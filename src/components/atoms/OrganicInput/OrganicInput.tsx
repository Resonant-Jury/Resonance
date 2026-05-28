'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { HandDrawnBorder } from '../HandDrawnBorder/HandDrawnBorder';
import { useElementSize } from '@/lib/hooks/useElementSize';

interface OrganicFieldShellProps {
  children: ReactNode;
  hovered: boolean;
  focused: boolean;
  seed?: number;
  style?: CSSProperties;
  setHovered: (v: boolean) => void;
}

function OrganicFieldShell({
  children,
  hovered,
  focused,
  seed = 421,
  style,
  setHovered,
}: OrganicFieldShellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref, 280, 46);
  const R = h > 0 ? h / 2 : 23;
  const mag = Math.min(w, h) * 0.05;
  const cornerOff = Math.min(w, h) * 0.035;
  const stroke = focused
    ? 'color-mix(in oklch, var(--color-terracotta), black 20%)'
    : hovered
    ? 'oklch(40% 0.05 60)'
    : 'oklch(50% 0.04 70)';
  return (
    <div
      ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', width: '100%', ...style }}
    >
      <HandDrawnBorder
        w={w}
        h={h}
        R={R}
        seed={seed}
        mag={mag}
        fillColor="var(--color-cream)"
        strokeColor="transparent"
        strokeWidth={0}
        segmentsH={[3, 4]}
        segmentsV={1}
        curve={1.9}
        cornerJitter={1.6}
        cornerOffset={cornerOff}
      />
      <HandDrawnBorder
        w={w}
        h={h}
        R={R}
        seed={seed}
        mag={mag}
        strokeColor={stroke}
        strokeWidth={focused ? 1.6 : 1.2}
        segmentsH={[3, 4]}
        segmentsV={1}
        curve={1.9}
        cornerJitter={1.6}
        cornerOffset={cornerOff}
      />
      {children}
    </div>
  );
}

const baseFieldStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  width: '100%',
  padding: '12px 20px',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  color: 'var(--color-text)',
};

export type OrganicInputProps = InputHTMLAttributes<HTMLInputElement> & {
  wrapperStyle?: CSSProperties;
  seed?: number;
};

export const OrganicInput = forwardRef<HTMLInputElement, OrganicInputProps>(function OrganicInput(
  { wrapperStyle, seed, style, onFocus, onBlur, ...rest },
  ref
) {
  const innerRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <OrganicFieldShell
      hovered={hovered}
      focused={focused}
      seed={seed}
      style={wrapperStyle}
      setHovered={setHovered}
    >
      <input
        ref={innerRef}
        {...rest}
        style={{ ...baseFieldStyle, ...style }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
    </OrganicFieldShell>
  );
});

export type OrganicSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  wrapperStyle?: CSSProperties;
  seed?: number;
};

export const OrganicSelect = forwardRef<HTMLSelectElement, OrganicSelectProps>(function OrganicSelect(
  { wrapperStyle, seed, style, onFocus, onBlur, children, ...rest },
  ref
) {
  const innerRef = useRef<HTMLSelectElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLSelectElement);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <OrganicFieldShell
      hovered={hovered}
      focused={focused}
      seed={seed}
      style={wrapperStyle}
      setHovered={setHovered}
    >
      <select
        ref={innerRef}
        {...rest}
        style={{ ...baseFieldStyle, appearance: 'none', cursor: 'pointer', ...style }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      >
        {children}
      </select>
    </OrganicFieldShell>
  );
});
