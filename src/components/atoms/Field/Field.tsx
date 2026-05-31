'use client';

import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import { Icon } from '@/components/atoms/Icon';
import styles from './Field.module.css';

type Variant = 'default' | 'subtle';
type Tone = 'default' | 'display';

export interface FieldLabelProps {
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
}

export function FieldLabel({ children, htmlFor, required }: FieldLabelProps) {
  return (
    <label htmlFor={htmlFor} className={styles.label}>
      {children}
      {required && <span className={styles.required} aria-hidden>*</span>}
    </label>
  );
}

export interface FieldHintProps {
  children: ReactNode;
  tone?: 'default' | 'ok' | 'error';
}

export function FieldHint({ children, tone = 'default' }: FieldHintProps) {
  return (
    <div className={styles.hint} data-tone={tone === 'default' ? undefined : tone}>
      {children}
    </div>
  );
}

export interface CharCountProps {
  count: number;
  max: number;
}

export function CharCount({ count, max }: CharCountProps) {
  const state = count > max ? 'over' : count === max ? 'full' : 'ok';
  return (
    <div className={styles.charCount} data-state={state === 'ok' ? undefined : state}>
      {count} / {max}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: Variant;
  tone?: Tone;
  /** Seed for the wobbly dashed border. */
  seed?: number;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { variant = 'default', tone = 'default', className, seed = 13, onFocus, onBlur, onMouseEnter, onMouseLeave, ...rest },
  ref,
) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);

  const inputEl = (
    <input
      ref={ref}
      {...rest}
      onFocus={(e) => { setFocus(true); onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); onBlur?.(e); }}
      onMouseEnter={(e) => { setHover(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); onMouseLeave?.(e); }}
      className={[styles.field, className].filter(Boolean).join(' ')}
      data-variant={variant === 'default' ? undefined : variant}
      data-tone={tone === 'default' ? undefined : tone}
    />
  );

  if (variant !== 'default') return inputEl;

  return (
    <HandDrawnDashedSurface
      seed={seed}
      R={16}
      strokeWidth={2}
      state={focus ? 'focus' : hover ? 'hover' : 'idle'}
      className={styles.surface}
    >
      {inputEl}
    </HandDrawnDashedSurface>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  variant?: Variant;
  tone?: Tone;
  seed?: number;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { variant = 'default', tone = 'default', className, rows = 6, seed = 17, onFocus, onBlur, onMouseEnter, onMouseLeave, ...rest },
  ref,
) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);

  const el = (
    <textarea
      ref={ref}
      rows={rows}
      {...rest}
      onFocus={(e) => { setFocus(true); onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); onBlur?.(e); }}
      onMouseEnter={(e) => { setHover(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); onMouseLeave?.(e); }}
      className={[styles.field, className].filter(Boolean).join(' ')}
      data-variant={variant === 'default' ? undefined : variant}
      data-tone={tone === 'default' ? undefined : tone}
    />
  );

  if (variant !== 'default') return el;

  return (
    <HandDrawnDashedSurface
      seed={seed}
      R={18}
      strokeWidth={2}
      state={focus ? 'focus' : hover ? 'hover' : 'idle'}
      className={styles.surface}
    >
      {el}
    </HandDrawnDashedSurface>
  );
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  variant?: Variant;
  seed?: number;
};

/**
 * Organic `<select>` — the native control sits transparent inside the same
 * wobbly hand-drawn surface as `<Input>`, with a hand-drawn chevron overlaid
 * on the right. Pass children as `<option>`s like a normal select.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { variant = 'default', className, seed = 15, children, onFocus, onBlur, onMouseEnter, onMouseLeave, ...rest },
  ref,
) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);

  const selectEl = (
    <select
      ref={ref}
      {...rest}
      onFocus={(e) => { setFocus(true); onFocus?.(e); }}
      onBlur={(e) => { setFocus(false); onBlur?.(e); }}
      onMouseEnter={(e) => { setHover(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); onMouseLeave?.(e); }}
      className={[styles.field, styles.select, className].filter(Boolean).join(' ')}
      data-variant={variant === 'default' ? undefined : variant}
    >
      {children}
    </select>
  );

  const withChevron = (
    <span className={styles.selectWrap}>
      {selectEl}
      <Icon name="chevron-down" size={18} className={styles.selectChevron} />
    </span>
  );

  if (variant !== 'default') return withChevron;

  return (
    <HandDrawnDashedSurface
      seed={seed}
      R={16}
      strokeWidth={2}
      state={focus ? 'focus' : hover ? 'hover' : 'idle'}
      className={styles.surface}
    >
      {withChevron}
    </HandDrawnDashedSurface>
  );
});

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  hintTone?: 'default' | 'ok' | 'error';
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  /** Right-aligned trailing slot (e.g. CharCount). */
  trailing?: ReactNode;
}

/** Composed wrapper: label + control + (hint | char count). */
export function Field({ label, hint, hintTone, required, htmlFor, children, trailing }: FieldProps) {
  return (
    <div className={styles.fieldGroup}>
      {label && (
        <FieldLabel htmlFor={htmlFor} required={required}>
          {label}
        </FieldLabel>
      )}
      {children}
      <div className={styles.fieldFoot}>
        <div className={styles.fieldFootHint}>{hint && <FieldHint tone={hintTone}>{hint}</FieldHint>}</div>
        {trailing}
      </div>
    </div>
  );
}
