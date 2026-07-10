'use client';

import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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
import { wobRect } from '@/lib/design/wobRect';
import { makePrng } from '@/lib/design/prng';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { INK, INK_LIGHT, INK_STRONG } from '@/lib/design/strokes';
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
      strokeWidth={INK}
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
      strokeWidth={INK}
      curve={curve}
      state={focus ? 'focus' : hover ? 'hover' : 'idle'}
      className={styles.surface}
    >
      {el}
    </HandDrawnDashedSurface>
  );
});

export interface SelectOption {
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
  /**
   * Custom closed-state content (e.g. a leading icon + short label) in place
   * of echoing the selected option's label. Receives the selected option.
   */
  renderValue?: (selected: SelectOption | undefined) => ReactNode;
}

/**
 * Organic dropdown. Closed, it's the same wobbly hand-drawn box as `<Input>`.
 * Clicking it expands a large curved card that **covers the box** and lists the
 * options — a fully closed wobbly border (so the left/right edges always meet),
 * a wavy hand-drawn divider between each option (N options → N−1 dividers) that
 * reaches both edges, and the active option washed in along the curved divider
 * regions. Pass `<option>`s as children; `onChange` receives the value.
 */
export function Select({
  value,
  onChange,
  children,
  seed = 15,
  ariaLabel,
  disabled,
  className,
  renderValue,
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
  const [openUp, setOpenUp] = useState(false);
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
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const estimatedHeight = options.length * 54 + 20;
      if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
        setOpenUp(true);
      } else {
        setOpenUp(false);
      }
    }
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
        strokeWidth={INK}
        state={open ? 'focus' : hover ? 'hover' : 'idle'}
        // When open, the covering panel draws its own border — hide this one so
        // the two wobbly outlines don't stack on top of each other.
        strokeColor={open ? 'transparent' : undefined}
        className={styles.surface}
      >
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          className={styles.dropdownTrigger}
          data-open={open || undefined}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${uid}-listbox`}
          aria-label={ariaLabel}
          aria-activedescendant={open ? `${uid}-opt-${activeIndex}` : undefined}
          onClick={() => (open ? setOpen(false) : openPanel())}
          onKeyDown={onKeyDown}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onBlur={() => setHover(false)}
        >
          <span className={styles.dropdownValue}>
            {renderValue ? renderValue(selectedIndex >= 0 ? options[selectedIndex] : undefined) : selectedLabel}
          </span>
          <Icon name="chevron-down" size={20} strokeWidth={INK_STRONG} className={styles.dropdownChevron} />
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
          openUp={openUp}
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
  openUp?: boolean;
}

// A gently wavy horizontal boundary between two option rows, as a point list so
// the row fills and the stroked dividers share identical geometry. Runs from
// -pad to w+pad so fills overshoot the panel and the outer clip trims them flush
// to the wobbly border (no slivers, dividers reach the edges).
function rowBoundary(
  y: number,
  w: number,
  seed: number,
  amp: number,
  pad: number,
): [number, number][] {
  const steps = 4;
  const rnd = makePrng(seed);
  const f = (n: number): number => +n.toFixed(2);
  const pts: [number, number][] = [[-pad, f(y)]];
  for (let k = 0; k <= steps; k++) {
    const x = (k / steps) * w;
    const off = k === 0 || k === steps ? 0 : (rnd() - 0.5) * 2 * amp;
    pts.push([f(x), f(y + off)]);
  }
  pts.push([w + pad, f(y)]);
  return pts;
}

// Smooth cubic segments through the points, with horizontal control handles
// (the same curve feel as wavyLine). Assumes the pen is already at pts[0].
function segs(pts: [number, number][]): string {
  const f = (n: number): number => +n.toFixed(2);
  let d = '';
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const hx = (x1 - x0) / 3;
    d += ` C ${f(x0 + hx)},${f(y0)} ${f(x1 - hx)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

const dividerPath = (pts: [number, number][]): string =>
  `M ${pts[0][0]},${pts[0][1]}` + segs(pts);

// Closed region for one option row, bounded by the wavy divider above and below
// (or the padded panel edge for the first/last row), so a hover/selection wash
// fills the *curve-divided* area rather than a rectangle. Both edges are drawn
// as smooth curves so the wash hugs the divider exactly.
function rowRegion(
  i: number,
  count: number,
  boundaries: [number, number][][],
  w: number,
  h: number,
  pad: number,
): string {
  const top: [number, number][] =
    i === 0 ? [[-pad, -pad], [w + pad, -pad]] : boundaries[i - 1];
  const bottom: [number, number][] =
    i === count - 1 ? [[-pad, h + pad], [w + pad, h + pad]] : boundaries[i];
  const botRev = [...bottom].reverse();
  return (
    `M ${top[0][0]},${top[0][1]}` +
    segs(top) +
    ` L ${botRev[0][0]},${botRev[0][1]}` +
    segs(botRev) +
    ' Z'
  );
}

/**
 * The expanded panel. It **covers the closed box** (anchored at `top: 0`) and
 * reads as a self-contained card: a full closed wobbly border (no open top, so
 * left/right edges always meet), an opaque cream fill, the N options listed
 * inside separated by wavy hand-drawn dividers that reach both edges, and the
 * active option washed in along the *curved* divider regions (not a rectangle).
 */
function DropdownPanel({
  seed,
  uid,
  options,
  value,
  activeIndex,
  onActivate,
  onChoose,
  openUp,
}: DropdownPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const optRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [{ w, h }, setDims] = useState({ w: 0, h: 0 });
  // offsetTop + height of each option row, used to place the wavy boundaries.
  const [rows, setRows] = useState<{ top: number; height: number }[]>([]);

  const recompute = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pr = el.getBoundingClientRect();
    setDims({ w: el.offsetWidth, h: el.offsetHeight });
    // Row offsets relative to the panel (the list is a positioned offsetParent,
    // so plain offsetTop would be relative to the list, not the panel).
    setRows(
      optRefs.current.map((o) => {
        if (!o) return { top: 0, height: 0 };
        const r = o.getBoundingClientRect();
        return { top: r.top - pr.top, height: r.height };
      }),
    );
  }, []);

  useLayoutEffect(() => {
    recompute();
    const ro = new ResizeObserver(recompute);
    if (ref.current) ro.observe(ref.current);
    optRefs.current.forEach((o) => o && ro.observe(o));
    return () => ro.disconnect();
  }, [recompute, options.length]);

  const pad = h > 0 ? Math.max(10, h * 0.04) : 0;

  const outerPath = useMemo(() => {
    if (!w || !h) return '';
    return wobRect(w, h, 16, seed + 100, autoMag(w, h), {
      segmentsH: autoSegments(w),
      segmentsV: autoSegments(h),
      curve: autoCurve(w, h),
    });
  }, [w, h, seed]);

  // One wavy boundary between each adjacent pair of rows.
  const boundaries = useMemo<[number, number][][]>(() => {
    if (!w || rows.length !== options.length) return [];
    return rows.slice(1).map((r, i) => {
      const prev = rows[i];
      const y = (prev.top + prev.height + r.top) / 2;
      return rowBoundary(y, w, seed + i * 31 + 7, 3, pad);
    });
  }, [w, rows, options.length, seed, pad]);

  const ready = w > 0 && h > 0 && boundaries.length === options.length - 1;

  return (
    <div
      ref={ref}
      className={styles.dropdownPanel}
      style={openUp ? { top: 'auto', bottom: 0 } : undefined}
    >
      {w > 0 && h > 0 && (
        <svg
          className={`${styles.dropdownBorder} res-shape-fade-in`}
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          aria-hidden
        >
          <defs>
            <clipPath id={`sel-clip-${uid}`}>
              <path d={outerPath} />
            </clipPath>
          </defs>
          <g clipPath={`url(#sel-clip-${uid})`}>
            {/* opaque card fill */}
            <path d={outerPath} fill="var(--color-cream)" />
            {/* active row wash, clipped to the curved region */}
            {ready && activeIndex >= 0 && (
              <path
                d={rowRegion(activeIndex, options.length, boundaries, w, h, pad)}
                fill="color-mix(in oklch, var(--color-terracotta) 15%, var(--color-cream))"
              />
            )}
          </g>
          {/* wavy dividers — drawn past the edges, clipped flush to the border */}
          {ready &&
            boundaries.map((pts, i) => (
              <path
                key={i}
                d={dividerPath(pts)}
                fill="none"
                stroke="oklch(60% 0.04 60 / 0.45)"
                strokeWidth={INK_LIGHT}
                strokeLinecap="round"
                clipPath={`url(#sel-clip-${uid})`}
              />
            ))}
          {/* outer stroke */}
          <path
            d={outerPath}
            fill="none"
            stroke="var(--field-border-focus)"
            strokeWidth={INK}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <div id={`${uid}-listbox`} className={styles.dropdownList} role="listbox" aria-label="options">
        {options.map((opt, i) => (
          <button
            key={opt.value}
            ref={(el) => {
              optRefs.current[i] = el;
            }}
            type="button"
            role="option"
            id={`${uid}-opt-${i}`}
            aria-selected={opt.value === value}
            className={styles.dropdownOption}
            data-selected={opt.value === value || undefined}
            onClick={() => onChoose(opt.value)}
            onMouseEnter={() => onActivate(i)}
          >
            <span className={styles.dropdownOptionLabel}>{opt.label}</span>
            {opt.value === value && (
              <Icon name="check" size={18} strokeWidth={INK_STRONG} color="var(--color-terracotta)" />
            )}
          </button>
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
