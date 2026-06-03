'use client';

import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import { Icon } from '@/components/atoms/Icon';
import { Divider } from '@/components/atoms/Divider/Divider';
import { wobOpenTop } from '@/lib/design/wobOpenRect';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { useElementSize } from '@/lib/hooks/useElementSize';
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
  curve?: number;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { variant = 'default', tone = 'default', className, seed = 13, curve, onFocus, onBlur, onMouseEnter, onMouseLeave, ...rest },
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
      curve={curve}
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
  curve?: number;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { variant = 'default', tone = 'default', className, rows = 6, seed = 17, curve, onFocus, onBlur, onMouseEnter, onMouseLeave, ...rest },
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
      R={16}
      strokeWidth={2}
      curve={curve}
      state={focus ? 'focus' : hover ? 'hover' : 'idle'}
      className={styles.surface}
    >
      {el}
    </HandDrawnDashedSurface>
  );
});

interface SelectOption {
  value: string;
  label: ReactNode;
}

export interface SelectProps {
  value: string;
  /** Called with the chosen option's value. */
  onChange: (value: string) => void;
  /** `<option value="…">label</option>` children, like a native select. */
  children: ReactNode;
  /** Seed so the wobble of the box + panel is deterministic per-instance. */
  seed?: number;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Organic dropdown. Closed, it's the same wobbly hand-drawn box as `<Input>`.
 * Clicking it expands a large curved panel **directly attached beneath** — the
 * panel has left/bottom/right borders but no top border (it reads as a
 * continuation of the box, not a floating menu), with a wavy hand-drawn divider
 * between each option (N options → N−1 dividers). Pass `<option>`s as children.
 */
export function Select({
  value,
  onChange,
  children,
  seed = 15,
  ariaLabel,
  disabled,
  className,
}: SelectProps) {
  const options = useMemo<SelectOption[]>(
    () =>
      Children.toArray(children)
        .filter((c): c is ReactElement<{ value: string; children: ReactNode }> =>
          isValidElement(c),
        )
        .map((c) => ({ value: String(c.props.value), label: c.props.children })),
    [children],
  );

  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const uid = useId().replace(/:/g, '');

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : '';

  function openPanel() {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }
  function choose(v: string) {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Close on outside pointer-down.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openPanel();
        else setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openPanel();
        else setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) openPanel();
        else if (options[activeIndex]) choose(options[activeIndex].value);
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      case 'Tab':
        if (open) setOpen(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className={[styles.dropdownRoot, className].filter(Boolean).join(' ')}>
      <HandDrawnDashedSurface
        seed={seed}
        R={16}
        strokeWidth={2}
        state={open ? 'focus' : hover ? 'hover' : 'idle'}
        className={styles.surface}
      >
        <button
          ref={triggerRef}
          type="button"
          className={styles.dropdownTrigger}
          data-open={open || undefined}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-activedescendant={open ? `${uid}-opt-${activeIndex}` : undefined}
          onClick={() => (open ? setOpen(false) : openPanel())}
          onKeyDown={onKeyDown}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onBlur={() => setHover(false)}
        >
          <span className={styles.dropdownValue}>{selectedLabel}</span>
          <Icon name="chevron-down" size={18} className={styles.dropdownChevron} />
        </button>
      </HandDrawnDashedSurface>

      {open && (
        <DropdownPanel
          seed={seed}
          uid={uid}
          options={options}
          value={value}
          activeIndex={activeIndex}
          onActivate={setActiveIndex}
          onChoose={choose}
        />
      )}
    </div>
  );
}

interface DropdownPanelProps {
  seed: number;
  uid: string;
  options: SelectOption[];
  value: string;
  activeIndex: number;
  onActivate: (i: number) => void;
  onChoose: (value: string) => void;
}

/**
 * The expanding panel: an open-top wobbly border (left/bottom/right only) drawn
 * to the measured panel size, with the options listed inside, separated by
 * wavy `Divider`s.
 */
function DropdownPanel({
  seed,
  uid,
  options,
  value,
  activeIndex,
  onActivate,
  onChoose,
}: DropdownPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref);
  const path = useMemo(() => {
    if (!w || !h) return '';
    return wobOpenTop(w, h, 16, seed + 100, autoMag(w, h), {
      segmentsH: autoSegments(w),
      segmentsV: autoSegments(h),
      curve: autoCurve(w, h),
    });
  }, [w, h, seed]);

  return (
    <div ref={ref} className={styles.dropdownPanel}>
      {w > 0 && h > 0 && (
        <svg
          className={`${styles.dropdownBorder} res-shape-fade-in`}
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          aria-hidden
        >
          <path
            d={path}
            fill="none"
            stroke="var(--field-border-focus)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <div className={styles.dropdownList} role="listbox" aria-label="options">
        {options.map((opt, i) => (
          <Fragment key={opt.value}>
            {i > 0 && <Divider seed={seed + i * 7} spacing={0} amplitude={1.1} />}
            <button
              type="button"
              role="option"
              id={`${uid}-opt-${i}`}
              aria-selected={opt.value === value}
              className={styles.dropdownOption}
              data-active={i === activeIndex || undefined}
              data-selected={opt.value === value || undefined}
              onClick={() => onChoose(opt.value)}
              onMouseEnter={() => onActivate(i)}
            >
              <span>{opt.label}</span>
              {opt.value === value && (
                <Icon name="check" size={16} color="var(--color-terracotta)" />
              )}
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

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
