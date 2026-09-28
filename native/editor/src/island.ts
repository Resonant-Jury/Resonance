/**
 * The story editor as a WebView "island" for the native apps.
 *
 * Same schema and Markdown as the web editor (src/lib/markdown/editorSchema),
 * so a story round-trips identically on every platform; only the node views
 * differ — plain DOM here, drawing the organic curves with the web's own
 * geometry (wobRect, wavyVertical). Built into one self-contained file by
 * scripts/native/build-editor.mjs.
 *
 * Bridge (native → island): window.ResonanceEditor.{setMarkdown, getMarkdown, roundtrip, focus, blur, exec}
 *   exec(command, args?) runs a toolbar command (the web MarkdownEditor's set:
 *   bold, italic, h2, h3, bulletList, orderedList, blockquote, insertCard,
 *   insertImage, undo, redo); it returns false when the command can't run.
 * Bridge (island → native): {type: 'ready' | 'change' | 'height' | 'state' | 'focus', ...} posted to
 *   iOS  window.webkit.messageHandlers.editor
 *   Android window.ResonanceBridge.postMessage(json)
 */
import { Editor } from '@tiptap/core';
import Blockquote from '@tiptap/extension-blockquote';
import Placeholder from '@tiptap/extension-placeholder';
import { wavyVertical } from '../../../src/lib/design/wavyPath';
import { wobRect } from '../../../src/lib/design/wobRect';
import { seedFromString } from '../../../src/lib/design/prng';
import { BlockImage, CardEmbed, getMarkdown, storyExtensions } from '../../../src/lib/markdown/editorSchema';

/** Which toolbar buttons show as on, and whether undo/redo can run — the web toolbar's activeStates. */
type ToolbarState = {
  active: Record<'bold' | 'italic' | 'h2' | 'h3' | 'bulletList' | 'orderedList' | 'blockquote', boolean>;
  canUndo: boolean;
  canRedo: boolean;
};
type Command = 'bold' | 'italic' | 'h2' | 'h3' | 'bulletList' | 'orderedList' | 'blockquote' | 'insertCard' | 'insertImage' | 'undo' | 'redo';
type Message =
  | { type: 'ready'; ms: number }
  | { type: 'change'; markdown: string }
  | { type: 'height'; px: number }
  | ({ type: 'state' } & ToolbarState)
  | { type: 'focus'; focused: boolean };

declare global {
  interface Window {
    webkit?: { messageHandlers?: { editor?: { postMessage(m: unknown): void } } };
    ResonanceBridge?: { postMessage(json: string): void };
    ResonanceEditor: {
      setMarkdown(md: string): string;
      getMarkdown(): string;
      roundtrip(md: string): string;
      focus(): void;
      blur(): void;
      exec(command: Command, args?: { href?: string; title?: string; src?: string; alt?: string }): boolean;
    };
  }
}

function send(m: Message) {
  window.webkit?.messageHandlers?.editor?.postMessage(m);
  window.ResonanceBridge?.postMessage(JSON.stringify(m));
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * The article's hand-drawn vertical curve beside the quote. The rail is
 * stretched to the quote's height by the flex layout and the SVG fills it
 * (preserveAspectRatio none, non-scaling stroke), so nothing has to measure
 * the DOM — ProseMirror owns it and re-creates node views freely.
 */
const IslandBlockquote = Blockquote.extend({
  addNodeView() {
    return () => {
      const dom = document.createElement('blockquote');
      dom.className = 'quote';
      const svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('class', 'quote-curve');
      svg.setAttribute('viewBox', '-4 0 8 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', wavyVertical(100, 5, 1.6, 3));
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(path);
      // The rail is stretched by the flex row; the SVG fills the rail.
      const rail = document.createElement('span');
      rail.className = 'quote-rail';
      rail.contentEditable = 'false';
      rail.append(svg);
      const contentDOM = document.createElement('div');
      contentDOM.className = 'quote-body';
      dom.append(rail, contentDOM);
      return { dom, contentDOM };
    };
  },
});

/** Photos clipped to the same wobbly rectangle the article uses. */
const IslandImage = BlockImage.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('figure');
      dom.className = 'image';
      const img = document.createElement('img');
      img.src = String(node.attrs.src ?? '');
      img.alt = String(node.attrs.alt ?? '');
      const clip = () => {
        const w = img.clientWidth;
        const h = img.clientHeight;
        if (w && h) img.style.clipPath = `path("${wobRect(w, h, 18, seedFromString(img.src))}")`;
      };
      img.addEventListener('load', clip);
      img.addEventListener('error', () => dom.classList.add('broken'));
      dom.append(img);
      return { dom };
    };
  },
});

/** A card link as a small card; the host could fill in author and image. */
const IslandCardEmbed = CardEmbed.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'card-embed';
      dom.contentEditable = 'false';
      const title = document.createElement('span');
      title.textContent = String(node.attrs.title ?? '');
      const href = document.createElement('small');
      href.textContent = String(node.attrs.href ?? '');
      dom.append(title, href);
      return { dom };
    };
  },
});

const params = new URLSearchParams(location.search);
const extensions = [
  ...storyExtensions({ blockquote: IslandBlockquote, image: IslandImage, cardEmbed: IslandCardEmbed }),
  Placeholder.configure({ placeholder: params.get('placeholder') ?? '寫下你的故事…' }),
];

let timer: ReturnType<typeof setTimeout> | undefined;
const editor = new Editor({
  element: document.getElementById('editor')!,
  extensions,
  content: '',
  onUpdate: () => {
    clearTimeout(timer);
    timer = setTimeout(() => send({ type: 'change', markdown: getMarkdown(editor) }), 150);
  },
  onTransaction: () => sendState(),
  onFocus: () => send({ type: 'focus', focused: true }),
  onBlur: () => send({ type: 'focus', focused: false }),
});

// The toolbar lives natively above the keyboard; it only needs to hear when
// something it shows changed, at most once a frame.
let lastState = '';
let stateFrame = 0;
function sendState() {
  cancelAnimationFrame(stateFrame);
  stateFrame = requestAnimationFrame(() => {
    const state: ToolbarState = {
      active: {
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        h2: editor.isActive('heading', { level: 2 }),
        h3: editor.isActive('heading', { level: 3 }),
        bulletList: editor.isActive('bulletList'),
        orderedList: editor.isActive('orderedList'),
        blockquote: editor.isActive('blockquote'),
      },
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    };
    const json = JSON.stringify(state);
    if (json === lastState) return;
    lastState = json;
    send({ type: 'state', ...state });
  });
}

new ResizeObserver(() => send({ type: 'height', px: document.documentElement.scrollHeight })).observe(document.body);

window.ResonanceEditor = {
  // Loading a draft is not an edit: kept out of undo history, so undo can
  // never take the page back to empty.
  setMarkdown(md) {
    editor.chain().setMeta('addToHistory', false).setContent(md, { emitUpdate: false }).run();
    return getMarkdown(editor);
  },
  getMarkdown: () => getMarkdown(editor),
  /** Parse and re-serialize without touching the visible document (corpus checks). */
  roundtrip(md) {
    const scratch = new Editor({ extensions: storyExtensions(), content: md });
    const out = getMarkdown(scratch);
    scratch.destroy();
    return out;
  },
  focus: () => editor.commands.focus('end'),
  blur: () => editor.commands.blur(),
  exec(command, args = {}) {
    const chain = editor.chain().focus();
    switch (command) {
      case 'bold': return chain.toggleBold().run();
      case 'italic': return chain.toggleItalic().run();
      case 'h2': return chain.toggleHeading({ level: 2 }).run();
      case 'h3': return chain.toggleHeading({ level: 3 }).run();
      case 'bulletList': return chain.toggleBulletList().run();
      case 'orderedList': return chain.toggleOrderedList().run();
      case 'blockquote': return chain.toggleBlockquote().run();
      // A card link becomes an embedded card, as when the web inserts one (InsertCardModal).
      case 'insertCard':
        if (!args.href?.startsWith('/card/')) return false;
        return chain.insertContent({ type: 'cardEmbed', attrs: { href: args.href, title: args.title ?? '' } }).run();
      // The host uploads the photo (/api/upload) and hands over its public URL.
      case 'insertImage':
        if (!args.src) return false;
        return chain.insertContent({ type: 'image', attrs: { src: args.src, alt: args.alt ?? '' } }).run();
      case 'undo': return chain.undo().run();
      case 'redo': return chain.redo().run();
      default: return false;
    }
  },
};

send({ type: 'ready', ms: performance.now() });
