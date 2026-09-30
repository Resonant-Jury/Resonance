/**
 * The attribute the card page's content carries until it knows whether the
 * reader may see it (storyGate in CardDetailClient).
 */
export const CARD_HOLD_ATTR = 'data-card-hold';

/**
 * The localStorage key a signed-in browser keeps its session mark under —
 * SESSION_MARK_KEY in lib/auth/firebase/client, repeated here because that
 * module is client-only and this one is read by the server page (a test keeps
 * the two equal).
 */
export const SESSION_MARK_STORAGE_KEY = 'resonance:session';

/**
 * Runs before the server-rendered card is painted: in a browser someone is
 * signed in in, it hides the card until the page knows their blocks (a
 * blocked author's card must not show even for a moment, and the cached HTML
 * can't know the reader). A signed-out reader's browser leaves it alone, so
 * they see the story at once. It adds a <style> to <head> rather than an
 * attribute to a React-owned element, so hydration finds the markup it
 * rendered.
 */
export const CARD_HOLD_SCRIPT =
  `try{if(localStorage.getItem(${JSON.stringify(SESSION_MARK_STORAGE_KEY)})&&!document.getElementById('card-hold')){` +
  `var s=document.createElement('style');s.id='card-hold';s.textContent='[${CARD_HOLD_ATTR}]{visibility:hidden}';` +
  `document.head.appendChild(s)}}catch(e){}`;
