'use client';

import { useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import { FieldHint } from '@/components/atoms/Field/Field';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import styles from './TagField.module.css';

export interface TagFieldProps {
  tags: string[];
  /** The whole list after an add or a remove. */
  onChange: (tags: string[]) => void;
  /** Ask the model for 2–3 tags (the host merges them into the list). */
  onSuggest: () => void;
  suggesting: boolean;
  /** Replaces the helper line while it is set. */
  error?: string | null;
  /** Lets a `<label htmlFor>` focus the text input. */
  id?: string;
}

/** A tag ends at a comma of either width or the enumeration comma (、). */
const SEPARATORS = /[,，、]/;

/**
 * The writer's tags as one control: a single input frame holding the chosen
 * tags (bare `md` pills — one frame per layer, so no pen line inside this one),
 * then the text input filling the rest of the row, then one trailing action
 * that follows the context: with nothing typed it asks the model for tags, with
 * something typed it adds that tag. Enter, a comma (，、 too) or the action
 * adds; Backspace on an empty input takes the last tag back. The pills wrap, and
 * the input and its action wrap together onto the next line when the row fills.
 * The frame takes the field's idle / hover / focus colours, focus meaning
 * anything inside it. Under it one muted line says how, or the error.
 *
 * The apps' twin is `Tags` in WriteScreen (Android and iOS).
 */
export function TagField({ tags, onChange, onSuggest, suggesting, error, id }: TagFieldProps) {
  const t = useTranslations('write');
  const [draft, setDraft] = useState('');
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // An IME (Zhuyin, Pinyin …) is mid-word: Enter and the separators belong to it.
  const composing = useRef(false);
  const helpId = useId();
  const canAdd = draft.trim().length > 0;

  /** Add the given words, in order, skipping blanks and tags already there. */
  function add(words: string[]) {
    const next = [...tags];
    for (const word of words) {
      const tag = word.trim();
      if (tag && !next.includes(tag)) next.push(tag);
    }
    if (next.length !== tags.length) onChange(next);
  }

  function commit() {
    if (!canAdd) return;
    add([draft]);
    setDraft('');
    inputRef.current?.focus();
  }

  /** The text as typed or pasted: a separator ends a tag, the rest stays to be typed on. */
  function take(value: string) {
    if (!SEPARATORS.test(value)) {
      setDraft(value);
      return;
    }
    const words = value.split(SEPARATORS);
    const rest = words.pop() ?? '';
    add(words);
    setDraft(rest.trimStart());
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    if (composing.current) setDraft(e.target.value);
    else take(e.target.value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Safari reports the Enter that confirms a word after the composition has
    // ended, with keyCode 229 — still the IME's, not a request to add.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0 && !e.repeat) {
      // One tag per press: holding the key clears the text, then stops.
      onChange(tags.slice(0, -1));
    }
  }

  const busy = suggesting && !canAdd;

  return (
    <div>
      <HandDrawnDashedSurface
        seed={53}
        R={16}
        state={focused ? 'focus' : hover ? 'hover' : 'idle'}
        className={styles.surface}
      >
        <div
          className={styles.field}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
          }}
          onClick={(e) => {
            // The empty parts of the frame are the input's too.
            if (!(e.target as HTMLElement).closest('button, input')) inputRef.current?.focus();
          }}
        >
          {tags.map((tag) => (
            <TagPill
              key={tag}
              size="md"
              color="var(--color-terracotta-light)"
              onRemove={() => onChange(tags.filter((x) => x !== tag))}
            >
              {tag}
            </TagPill>
          ))}
          <div className={styles.entry}>
            <input
              ref={inputRef}
              id={id}
              type="text"
              className={styles.input}
              value={draft}
              placeholder={t('tagsPlaceholder')}
              aria-label={t('tagsPlaceholder')}
              aria-describedby={helpId}
              enterKeyHint="done"
              autoComplete="off"
              onChange={onInput}
              onKeyDown={onKeyDown}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={(e) => {
                composing.current = false;
                take(e.currentTarget.value);
              }}
            />
            <OrganicButton
              variant="textAccent"
              size="sm"
              className={styles.action}
              onClick={canAdd ? commit : onSuggest}
              // Asking the model: the sparkle's place draws the pen loop until the tags arrive.
              loading={!canAdd && busy}
            >
              {canAdd ? (
                <>
                  <Icon name="plus" size={12} />
                  {t('tagsAdd')}
                </>
              ) : (
                <>
                  <Icon name="sparkle" size={15} />
                  {t('tagsSuggest')}
                </>
              )}
            </OrganicButton>
          </div>
        </div>
      </HandDrawnDashedSurface>
      <div id={helpId} aria-live="polite">
        <FieldHint tone={error ? 'error' : 'default'}>{error ?? t('tagsHelp')}</FieldHint>
      </div>
    </div>
  );
}
