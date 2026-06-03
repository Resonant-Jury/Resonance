'use client';

import { useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import styles from './MarkdownEditor.module.css';

/** tiptap-markdown augments `editor.storage` at runtime; type it locally. */
function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
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
 * Google-Keep-style selection toolbar: a BubbleMenu that only appears over a
 * text selection, instead of a fixed toolbar that clutters long documents.
 * Sits inside the same wobbly dashed surface as the Field inputs.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  seed = 17,
}: MarkdownEditorProps) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
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
    },
    onUpdate: ({ editor }) => onChange(getMarkdown(editor)),
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
  });

  if (!editor) return null;

  const btn = (active: boolean, label: string, onClick: () => void, aria: string) => (
    <button
      type="button"
      className={styles.bubbleBtn}
      data-active={active || undefined}
      aria-label={aria}
      aria-pressed={active}
      // keep the selection while clicking the toolbar
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <HandDrawnDashedSurface
      seed={seed}
      R={18}
      strokeWidth={2}
      state={focus ? 'focus' : hover ? 'hover' : 'idle'}
      className={styles.surface}
    >
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <BubbleMenu editor={editor} className={styles.bubble}>
          {btn(
            editor.isActive('bold'),
            '粗體',
            () => editor.chain().focus().toggleBold().run(),
            'Bold'
          )}
          <span className={styles.bubbleSep} aria-hidden />
          {btn(
            editor.isActive('heading', { level: 2 }),
            'H2',
            () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
            'Heading 2'
          )}
          {btn(
            editor.isActive('heading', { level: 3 }),
            'H3',
            () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
            'Heading 3'
          )}
          <span className={styles.bubbleSep} aria-hidden />
          {btn(
            editor.isActive('bulletList'),
            '清單',
            () => editor.chain().focus().toggleBulletList().run(),
            'Bullet list'
          )}
          {btn(
            editor.isActive('blockquote'),
            '引言',
            () => editor.chain().focus().toggleBlockquote().run(),
            'Quote'
          )}
        </BubbleMenu>
        <EditorContent editor={editor} />
      </div>
    </HandDrawnDashedSurface>
  );
}
