'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useEditor, EditorContent, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Icon } from '@/components/atoms/Icon';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { uploadImageFile } from '@/lib/images/upload';
import type { Card } from '@/lib/db/types';
import { InsertCardModal } from './InsertCardModal';
import styles from './MarkdownEditor.module.css';

/** tiptap-markdown augments `editor.storage` at runtime; type it locally. */
function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
}

const ACCEPTED_IMAGES = 'image/png,image/jpeg,image/webp,image/gif';

// Same construction as AppHeader's wavy bottom edge: a stretchable mask that
// fills the toolbar background down to a hand-drawn wave running the full
// width, plus the matching pen stroke along that wave.
const TOOLBAR_W = 800;
const TOOLBAR_BODY_H = 42;
const TOOLBAR_WAVE_H = 12;
const TOOLBAR_TOTAL_H = TOOLBAR_BODY_H + TOOLBAR_WAVE_H;

function buildToolbarPaths(seed: number) {
  const baseY = TOOLBAR_BODY_H + TOOLBAR_WAVE_H * 0.35;
  const pts = wavyPoints(TOOLBAR_W, baseY, 2, seed, 10);
  const strokeD = pointsToBezier(pts);
  const f = (n: number) => +n.toFixed(2);
  const last = pts[pts.length - 1];
  let maskD = `M 0,0 L ${TOOLBAR_W},0 L ${f(last[0])},${f(last[1])}`;
  for (let i = pts.length - 2; i >= 0; i--) {
    const [x0, y0] = pts[i + 1];
    const [x1, y1] = pts[i];
    const midX = (x0 + x1) / 2;
    maskD += ` C ${f(midX)},${f(y0)} ${f(midX)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  maskD += ' Z';
  return { maskD, strokeD };
}

function imageFiles(list: FileList | undefined | null): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
}

export interface MarkdownEditorProps {
  /** Initial / current markdown. Used only to seed the editor — the editor then
   *  owns its content and reports changes via onChange. */
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  seed?: number;
}

/**
 * Rich story editor that stores Markdown. Built on Tiptap (ProseMirror) so we
 * get markdown input rules (`## `, `**bold**`, `- list`, `> quote`) plus a
 * HackMD-style fixed toolbar pinned to the top of the writing surface — a
 * stable home for actions that don't fit a selection popup, like inserting a
 * link to one of your own cards or uploading an inline image. Images can also
 * arrive by paste (Ctrl+V) or drag-drop, landing at the cursor / drop point.
 * Sits inside the same wobbly dashed surface as the Field inputs.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  seed = 17,
}: MarkdownEditorProps) {
  const t = useTranslations('write.editor');
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // editorProps handlers are captured once at editor creation, so they reach
  // the latest upload logic through a ref instead of a stale closure.
  const insertImagesRef = useRef<(files: File[], pos?: number) => void>(() => {});

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Image,
      Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: styles.content,
        role: 'textbox',
        'aria-multiline': 'true',
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
      },
      // Pasted screenshots / copied images land at the cursor.
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        insertImagesRef.current(files);
        return true;
      },
      // Files dragged into the story body land at the drop point. `moved` is
      // an in-editor drag of existing content — let ProseMirror handle that.
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = imageFiles(event.dataTransfer?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        insertImagesRef.current(files, coords?.pos);
        return true;
      },
    },
    onUpdate: ({ editor }) => onChange(getMarkdown(editor)),
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
  });

  const activeStates = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor) {
        return {
          bold: false,
          italic: false,
          h2: false,
          h3: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
        };
      }
      return {
        bold: ctx.editor.isActive('bold'),
        italic: ctx.editor.isActive('italic'),
        h2: ctx.editor.isActive('heading', { level: 2 }),
        h3: ctx.editor.isActive('heading', { level: 3 }),
        bulletList: ctx.editor.isActive('bulletList'),
        orderedList: ctx.editor.isActive('orderedList'),
        blockquote: ctx.editor.isActive('blockquote'),
      };
    },
  }) ?? {
    bold: false,
    italic: false,
    h2: false,
    h3: false,
    bulletList: false,
    orderedList: false,
    blockquote: false,
  };

  const { toolbarMaskUrl, toolbarStrokeD } = useMemo(() => {
    const { maskD, strokeD } = buildToolbarPaths(seed + 5);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${TOOLBAR_W} ${TOOLBAR_TOTAL_H}' preserveAspectRatio='none'><path d='${maskD}' fill='white'/></svg>`;
    return {
      toolbarMaskUrl: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
      toolbarStrokeD: strokeD,
    };
  }, [seed]);

  insertImagesRef.current = (files, pos) => {
    void (async () => {
      if (!editor) return;
      setImageError(null);
      setUploadingCount((c) => c + files.length);
      let insertAt = pos;
      for (const file of files) {
        try {
          const { publicUrl } = await uploadImageFile(file);
          const node = { type: 'image', attrs: { src: publicUrl, alt: file.name } };
          if (insertAt != null) {
            const max = editor.state.doc.content.size;
            editor.chain().focus().insertContentAt(Math.min(insertAt, max), node).run();
            insertAt = undefined; // subsequent files follow the cursor
          } else {
            editor.chain().focus().insertContent(node).run();
          }
        } catch {
          setImageError(t('imageUploadError'));
        } finally {
          setUploadingCount((c) => c - 1);
        }
      }
    })();
  };

  if (!editor) return null;

  function insertCardLink(card: Card) {
    if (!editor) return;
    const href = `/card/${card.slug ?? card.id}`;
    editor
      .chain()
      .focus()
      .insertContent([
        { type: 'text', text: card.thoughtCore, marks: [{ type: 'link', attrs: { href } }] },
        { type: 'text', text: ' ' },
      ])
      .run();
    setCardModalOpen(false);
  }

  const btn = (
    label: ReactNode,
    aria: string,
    onClick: () => void,
    opts: { active?: boolean; disabled?: boolean; seed?: number } = {}
  ) => (
    <ToolButton
      label={label}
      aria={aria}
      onClick={onClick}
      active={opts.active}
      disabled={opts.disabled}
      seed={seed + (opts.seed ?? 0)}
    />
  );

  return (
    <HandDrawnDashedSurface
      seed={seed}
      R={16}
      state={focus ? 'focus' : hover ? 'hover' : 'idle'}
      className={styles.surface}
    >
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div className={styles.toolbarWrap}>
          <div
            aria-hidden
            className={styles.toolbarBg}
            style={{ WebkitMaskImage: toolbarMaskUrl, maskImage: toolbarMaskUrl }}
          />
          <svg
            aria-hidden
            className={styles.toolbarWave}
            viewBox={`0 0 ${TOOLBAR_W} ${TOOLBAR_TOTAL_H}`}
            preserveAspectRatio="none"
          >
            <path
              d={toolbarStrokeD}
              fill="none"
              stroke="oklch(60% 0.04 60 / 0.45)"
              strokeWidth={1.2}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className={styles.toolbar} role="toolbar" aria-label={t('toolbarLabel')}>
            {btn(t('bold'), t('bold'), () => editor.chain().focus().toggleBold().run(), {
              active: activeStates.bold,
              seed: 21,
            })}
            {btn(t('italic'), t('italic'), () => editor.chain().focus().toggleItalic().run(), {
              active: activeStates.italic,
              seed: 28,
            })}
            <Divider orientation="vertical" seed={seed + 3} amplitude={1.2} spacing={4} />
            {btn('H2', t('h2'), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), {
              active: activeStates.h2,
              seed: 35,
            })}
            {btn('H3', t('h3'), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), {
              active: activeStates.h3,
              seed: 42,
            })}
            <Divider orientation="vertical" seed={seed + 9} amplitude={1.2} spacing={4} />
            {btn(t('bulletList'), t('bulletList'), () => editor.chain().focus().toggleBulletList().run(), {
              active: activeStates.bulletList,
              seed: 49,
            })}
            {btn(t('orderedList'), t('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), {
              active: activeStates.orderedList,
              seed: 56,
            })}
            {btn(t('quote'), t('quote'), () => editor.chain().focus().toggleBlockquote().run(), {
              active: activeStates.blockquote,
              seed: 63,
            })}
            <Divider orientation="vertical" seed={seed + 15} amplitude={1.2} spacing={4} />
            {btn(
              <span className={styles.toolBtnIconLabel}>
                <Icon name="cards" size={15} />
                {t('insertCard')}
              </span>,
              t('insertCard'),
              () => setCardModalOpen(true),
              { seed: 70 }
            )}
            {btn(
              <span className={styles.toolBtnIconLabel}>
                {uploadingCount > 0 ? (
                  <SketchLoader size={15} seed={seed} ariaLabel={t('imageUploading')} />
                ) : (
                  <Icon name="image" size={15} />
                )}
                {t('insertImage')}
              </span>,
              t('insertImage'),
              () => fileInputRef.current?.click(),
              { disabled: uploadingCount > 0, seed: 77 }
            )}
          </div>
        </div>

        <EditorContent editor={editor} />

        {imageError && <div className={styles.imageError}>{imageError}</div>}

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_IMAGES}
          multiple
          className={styles.fileInputHidden}
          onChange={(e) => {
            const files = imageFiles(e.currentTarget.files);
            if (files.length > 0) insertImagesRef.current(files);
            e.currentTarget.value = '';
          }}
        />

        <InsertCardModal
          open={cardModalOpen}
          onClose={() => setCardModalOpen(false)}
          onPick={insertCardLink}
        />
      </div>
    </HandDrawnDashedSurface>
  );
}

interface ToolButtonProps {
  label: ReactNode;
  aria: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  seed: number;
}

/** Toolbar button whose hover/active wash is a wobbly curved fill (same
 *  hand-drawn chip language as the header's notification badge) instead of a
 *  flat rounded rectangle. */
function ToolButton({ label, aria, onClick, active, disabled, seed }: ToolButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { w, h } = useElementSize(ref);
  return (
    <button
      ref={ref}
      type="button"
      className={styles.toolBtn}
      data-active={active || undefined}
      disabled={disabled}
      aria-label={aria}
      aria-pressed={active}
      title={aria}
      // keep the selection / cursor while clicking the toolbar
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {w > 0 && h > 0 && (
        <HandDrawnBorder
          w={w}
          h={h}
          R={h * 0.4}
          seed={seed}
          mag={1.4}
          segmentsH={2}
          segmentsV={1}
          curve={1.5}
          cornerJitter={2.6}
          cornerOffset={h * 0.05}
          fillColor="var(--tool-btn-fill)"
        />
      )}
      <span className={styles.toolBtnLabel}>{label}</span>
    </button>
  );
}
