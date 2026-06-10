'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Icon } from '@/components/atoms/Icon';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { uploadImageFile } from '@/lib/images/upload';
import type { Card } from '@/lib/db/types';
import { InsertCardModal } from './InsertCardModal';
import styles from './MarkdownEditor.module.css';

/** tiptap-markdown augments `editor.storage` at runtime; type it locally. */
function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
}

const ACCEPTED_IMAGES = 'image/png,image/jpeg,image/webp,image/gif';

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
    opts: { active?: boolean; disabled?: boolean } = {}
  ) => (
    <button
      type="button"
      className={styles.toolBtn}
      data-active={opts.active || undefined}
      disabled={opts.disabled}
      aria-label={aria}
      aria-pressed={opts.active}
      title={aria}
      // keep the selection / cursor while clicking the toolbar
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
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
          <div className={styles.toolbar} role="toolbar" aria-label={t('toolbarLabel')}>
            {btn(t('bold'), t('bold'), () => editor.chain().focus().toggleBold().run(), {
              active: editor.isActive('bold'),
            })}
            {btn(t('italic'), t('italic'), () => editor.chain().focus().toggleItalic().run(), {
              active: editor.isActive('italic'),
            })}
            <span className={styles.toolSep} aria-hidden />
            {btn('H2', t('h2'), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), {
              active: editor.isActive('heading', { level: 2 }),
            })}
            {btn('H3', t('h3'), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), {
              active: editor.isActive('heading', { level: 3 }),
            })}
            <span className={styles.toolSep} aria-hidden />
            {btn(t('bulletList'), t('bulletList'), () => editor.chain().focus().toggleBulletList().run(), {
              active: editor.isActive('bulletList'),
            })}
            {btn(t('orderedList'), t('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), {
              active: editor.isActive('orderedList'),
            })}
            {btn(t('quote'), t('quote'), () => editor.chain().focus().toggleBlockquote().run(), {
              active: editor.isActive('blockquote'),
            })}
            <span className={styles.toolSep} aria-hidden />
            {btn(
              <span className={styles.toolBtnIconLabel}>
                <Icon name="cards" size={15} />
                {t('insertCard')}
              </span>,
              t('insertCard'),
              () => setCardModalOpen(true)
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
              { disabled: uploadingCount > 0 }
            )}
          </div>
          <Divider seed={seed + 12} spacing={0} />
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
