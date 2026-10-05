# Resonance — Design System

## 1. Philosophy

**Core Philosophy:** Emotion through visuals, clarity through structure.

This system blends two layers:
- **Organic Layer** — illustration-like, hand-crafted imperfection (blobs, wobbled borders, grain textures, wavy dividers)
- **Functional Layer** — clean, minimal UI structure (grid, typography hierarchy, consistent spacing)

**Design Keywords:** Warm Color Palette · Flat Design · Organic Curves · Playful Doodle Style · Minimal UI · Handcrafted Imperfection · Soft & Friendly

**70 / 30 Rule:** 70% functional (clean, structured) · 30% organic / expressive

---

## 2. Design Tokens (CSS Variables)

Defined in [`src/styles/tokens.css`](../src/styles/tokens.css):

```css
:root {
  /* Typography */
  --font-heading: 'Playfair Display', Georgia, serif;
  --font-body:    'DM Sans', system-ui, sans-serif;

  /* Color System — OKLCH Warm Pastel Palette */
  --color-cream:            oklch(96.5% 0.015 75);
  --color-cream-dark:       oklch(93%   0.018 75);
  --color-card-bg:          oklch(97.5% 0.01  80);

  --color-terracotta:       oklch(62%   0.14  45);   /* primary accent */
  --color-terracotta-light: oklch(88%   0.08  55);

  --color-lavender:         oklch(80%   0.07  290);
  --color-sage:             oklch(78%   0.07  140);
  --color-yellow:           oklch(88%   0.10  90);
  --color-sky:              oklch(82%   0.07  220);

  --color-text:             oklch(26%   0.03  60);   /* near-black warm */
  --color-text-muted:       oklch(52%   0.04  70);

  --grain-opacity: 0.10;
}
```

**Base styles** ([`src/styles/globals.css`](../src/styles/globals.css)):
```css
html  { scroll-behavior: smooth; overflow-x: clip; }
body  { font-family: var(--font-body); background: var(--color-cream); color: var(--color-text); -webkit-font-smoothing: antialiased; }

/* Custom scrollbar */
::-webkit-scrollbar       { width: 6px; }
::-webkit-scrollbar-track { background: var(--color-cream-dark); }
::-webkit-scrollbar-thumb { background: var(--color-terracotta-light); border-radius: 99px; }
```

---

## 3. Typography

| Role | Font | Size | Weight | Letter-spacing | Line-height |
|---|---|---|---|---|---|
| Hero headline | `--font-heading` | `clamp(42px, 7vw, 84px)` | 800 | `-0.03em` | 1.08 |
| CTA section title | `--font-heading` | `clamp(30px, 4.5vw, 52px)` | 800 | `-0.025em` | 1.15 |
| Card feed title | `--font-heading` | `clamp(28px, 4vw, 48px)` | 700 | `-0.025em` | — |
| Story card title | `--font-heading` | `18px` | 700 | — | 1.3 |
| Brand logo (header) | `--font-heading` | `24px` | 700 | `-0.02em` | — |
| Brand logo (footer) | `--font-heading` | `18px` | 700 | — | — |
| Body / description | `--font-body` | `clamp(16px, 2vw, 20px)` | 400 | — | 1.7 |
| CTA description | `--font-body` | `17px` | 400 | — | 1.65 |
| Card excerpt | `--font-body` | `14px` | 400 | — | 1.65 |
| Nav links | `--font-body` | `15px` | 500 | — | — |
| Button label | `--font-body` | `15px` | 600 | `0.02em` | — |
| Tag pill | `--font-body` | `11px` | 600 | `0.04em` | 1.3 · uppercase |
| Author name | `--font-body` | `13px` | 600 | — | — |
| Read time / captions | `--font-body` | `12–13px` | 400 | — | — |

---

## 4. Color Usage Map

| Element | Color Value |
|---|---|
| Page background | `var(--color-cream)` |
| Card feed background | `var(--color-cream-dark)` |
| CTA section background | `var(--color-terracotta)` |
| Footer background | `var(--color-text)` |
| Primary text | `var(--color-text)` |
| Muted text | `var(--color-text-muted)` |
| Accent / highlight word | `var(--color-terracotta)` |
| Header bg (scrolled) | `oklch(96% 0.015 75 / 0.92)` + `backdrop-filter: blur(12px)` |
| Footer tagline | `oklch(85% 0.015 75 / 0.5)` |
| Footer links | `oklch(85% 0.015 75 / 0.55)` → hover `oklch(85% 0.015 75 / 0.9)` |
| Footer divider | `oklch(85% 0.015 75 / 0.1)` |
| Footer copyright | `oklch(85% 0.015 75 / 0.3)` |
| CTA description text | `oklch(96% 0.015 75 / 0.8)` |

---

## 5. Component Atoms

### 5.1 `OrganicButton`

**File:** [`src/components/atoms/OrganicButton/OrganicButton.tsx`](../src/components/atoms/OrganicButton/OrganicButton.tsx)

Renders a button as a filled wobbled pill (`HandDrawnBorder` fill only — **no pen line**), a grain overlay, and a radial hover reveal.

**CSS base** ([`OrganicButton.module.css`](../src/components/atoms/OrganicButton/OrganicButton.module.css)):
```css
padding: 14px 32px;
font-size: 15px;  font-weight: 600;  letter-spacing: 0.02em;
```

**wobRect parameters:**
```
segmentsH: [3, 4]   segmentsV: 1
curve: 1.9          cornerJitter: 1.6
cornerOffset: Math.min(w, h) * 0.035
mag: Math.min(w, h) * 0.05
R: height / 2   (pill shape)
```

**ShapeGrain on fill:** `opacity: 0.38`, `frequency: 1.1`

**Hover reveal:** radial mask expanding from cursor, `transition: r 340ms linear`

**A button is a filled shape — and every button has a fill.** A pen outline marks a *container* (Modal, Panel, StoryCard, a sheet, a menu or select list), an *input* (Field, Select, the writer's `lg` tag) or a *segmented control* (below) — never a lone button, on bare page paper or inside a frame. And a word alone does not read as something to press, so no button is bare text either: a Cancel beside a verb is a pill as filled as the verb, only quieter. What says "press me" is the fill, ranked:

| Rank | Variant | fill | label | hoverOverlay |
|---|---|---|---|---|
| The verb (Publish, Sign in, Confirm, the page's one call to action) | `solid` | `var(--button-fill)` | `var(--color-cream)` (4.7:1) | `oklch(0% 0 0 / 0.14)` |
| Everything beside it: a secondary action (Share your story, Sign out, Retry, Edit profile), Cancel / Keep / Close, Download, Load more, Unblock | `tonal` | `var(--button-tonal)` | `var(--button-on-tonal)` (4.8:1) | `color-mix(in oklch, var(--color-terracotta) 14%, transparent)` |
| The final confirm of what can't be undone (delete a card, the account) | `danger` | `color-mix(in oklch, var(--color-danger, oklch(58% 0.16 25)), black 8%)` | `var(--color-cream)` (5.1:1) | `oklch(0% 0 0 / 0.14)` |
| A button that *opens* a destructive flow (Settings' Delete account) | `dangerTonal` | `var(--button-danger-tonal)` | `var(--button-on-danger-tonal)` (5.7:1) | `color-mix(in oklch, var(--color-danger, …) 14%, transparent)` |
| A brand's own black button (Sign in with Apple) | `ink` | `var(--color-text)` | `var(--color-cream)` | `oklch(0% 0 0 / 0.14)` |
| A control that must match a paper surface (no call site now) | `paper` | `var(--color-card-bg)` | `var(--color-text)` | same wash |
| The verb on the terracotta CTA band | `ctaLight` | `var(--color-cream)` | `var(--button-on-tonal)` (6.1:1) | `oklch(0% 0 0 / 0.08)` |
| The second action on the band | `ctaGhost` | `color-mix(in oklch, var(--color-terracotta), black 18%)` | `var(--color-cream)` (5.5:1) | `oklch(96% 0.015 75 / 0.14)` |

Buttons side by side all have fills, one height and one shape: a dialog's foot is `Cancel` tonal | the verb solid (or danger); a modal whose only exit is Close (`Modal closeButton`: the notifications, the blocked list) centres a small tonal pill. Where a pair does not fit one row on a phone (the editor's Publish | Save draft, Settings' Download | Delete account, the card page's Resonate over Leave a note), the pills stack at one width. Bare text is left to a link inside running text (an `<a>`, not an `OrganicButton`) and to icon-only header and toolbar buttons (⋯, back, the header's icons, the bookmark, the zoom cluster), whose icon is the affordance.

The button tokens live in `tokens.css` as mixes of the palette: `--button-fill` = terracotta + 12% black, `--button-tonal` = terracotta-light 75% into cream-dark (the selected tab's peach, made solid), `--button-on-tonal` = terracotta + 22% black; `--button-danger-tonal` = the danger red 20% into a rose paper of its own hue (`oklch(98% 0.02 25)`, so the tint stays red rather than drifting to the cream's yellow), `--button-on-danger-tonal` = the red + 22% black. Plain `--color-terracotta` is 3.5:1 against cream either way, so it never carries a label or sits under one.

The older names still work and wear the rank they stood for — `primary` is `solid`; `outline`, `ghost`, `secondary`, `secondaryOutline`, `text` and `textAccent` are `tonal` — so call sites can move to the rank names at their own pace. `paper` takes the cards' own grain (`opacity: 0.3`, `frequency: 0.88`, as the Modal) instead of the button grain.

**Seeds per variant:** primary=3, secondary=201, ghost=401, outline=601, ctaLight=801, ctaGhost=1001, secondaryOutline=1201; the rank names borrow the seed of the variant they grew out of: solid=danger=ink=3, tonal=dangerTonal=textAccent=601, text=paper=401

**`block`** stretches a button to its container's width (the face is measured and drawn at that width, the label stays centred): the provider buttons on the phone's sign-in sheet, and the stacked pairs above.

**A segmented control keeps its outline.** `SegmentedActionBar` (the card page's Resonate / Leave a note / Bookmark, the inline resonance editor's Publish / Save draft, the publish panel's Public / Only me) is a group, and its frame is what makes the options one control: the terracotta pen (`color-mix(in oklch, var(--color-terracotta), black 12%)`, `INK`) round the bar and the same pen in the wavy dividers, on a translucent paper face. Inside it the button tokens hold: the verb's segment in `--button-fill` (the pen's own colour, so the two read as one drawn shape), every other label in `--button-on-tonal` (6.2:1 on the bar's paper), a chosen option in `--button-tonal`.

**Where else a pen line stays** (none of them a button face): containers and inputs; floating surfaces (`OrganicMenu` popovers, select lists, modals, sheets); the editor's small × over a story picture (`NodeRemoveButton`: a cream disc over a busy photo needs its rim to separate from it); the resonate picker's dashed "write a new card" tile (a dashed slot means "empty, make one"); the thought map's dashed link handle (a drag handle on the canvas, not a button).

The hover brush is the same for every variant (`r 340ms linear`, spreading from the pointer). No variant has a pen line to show focus, so `:focus-visible` rings every one (`2px var(--field-border-focus)`, offset 2px; cream on the CTA band). The dropdown rows (`Select`, `OrganicMenu`, the avatar menu) follow the same rule: no boxed hover region, the active row takes the same spreading ink (`RowInk`) along its wavy region. A row's icon and label share one centre line (the label at `line-height: 1`, the icon in a box of its own).

A「⋯」has two forms. Laid over a picture (a card's cover in the card box) it keeps its paper chip. On the page's own paper (`OrganicMenu bare`: the profile, the card page's title row) it has no chip: solid dots in muted ink, a soft disc of ink under them on hover, focus and while open, and a tooltip that says what the menu holds ("Report or block", "Manage card"). With no frame, its place tells you what it is for: on a profile it hangs off the end of the pen name (the name stays centred, a long name wraps before reaching it), not in the hero's corner, where it read as a stray mark.

The thought map's zoom cluster is a sheet of the same paper drawn behind its controls (`card-bg` + grain 0.3, `R 18`, `seed 41`, no stroke), not a CSS box.

---

### 5.2 `HandDrawnBorder`

**File:** [`src/components/atoms/HandDrawnBorder/HandDrawnBorder.tsx`](../src/components/atoms/HandDrawnBorder/HandDrawnBorder.tsx)

Renders an absolutely-positioned SVG with a wobbled rectangle path. Used by buttons and cards.

**Props:**
```
w, h          — element dimensions (from useElementSize)
R             — corner radius (default: 22)
seed          — shape seed (integer)
mag           — wobble magnitude (default: Math.min(w,h) * 0.025)
fillColor     — SVG path fill
strokeColor   — SVG path stroke
strokeWidth   — default 2.5
segmentsH     — horizontal segments: number or [min, max]
segmentsV     — vertical segments: number or [min, max]
curve         — bezier handle strength
cornerJitter  — corner offset randomness multiplier
cornerOffset  — base corner nudge in px
chalkSeed     — if set, applies warm-noise chalk SVG filter
```

**Chalk filter** (applied when `chalkSeed` is set):
```
feTurbulence baseFrequency="~0.5–0.6 / ~0.38–0.45" numOctaves=4
feColorMatrix values="0 0 0 0 0.99  0 0 0 0 0.94  0 0 0 0 0.88  0 0 0 0.09 0"
feBlend mode="multiply"
feComposite operator="in"
```

---

### 5.3 `StoryCard`

**File:** [`src/components/molecules/StoryCard/StoryCard.tsx`](../src/components/molecules/StoryCard/StoryCard.tsx)

**6-color rotation** (index mod 6):

| # | fill (image bg) | border stroke 1 | border stroke 2 | hue |
|---|---|---|---|---|
| 0 | `oklch(90% 0.065 55)` | `oklch(52% 0.13 55)` | `oklch(38% 0.11 55)` | 55 |
| 1 | `oklch(94% 0.032 290)` | `oklch(54% 0.10 290)` | `oklch(42% 0.09 290)` | 290 |
| 2 | `oklch(93% 0.042 140)` | `oklch(50% 0.12 140)` | `oklch(38% 0.11 140)` | 140 |
| 3 | `oklch(92% 0.075 88)` | `oklch(58% 0.14 88)` | `oklch(44% 0.12 88)` | 88 |
| 4 | `oklch(92% 0.033 215)` | `oklch(50% 0.10 215)` | `oklch(38% 0.09 215)` | 215 |
| 5 | `oklch(89% 0.047 18)` | `oklch(52% 0.09 18)` | `oklch(40% 0.08 18)` | 18 |

**Card interior colors (derived from hue):**
```
normal:  oklch(97.5% 0.012 {hue})
hovered: oklch(92.5% 0.024 {hue})
```

**wobRect parameters (desktop border):**
```
R: 22   seed: index * 77 + 13
segmentsH: [3,4]   segmentsV: [5,6]
curve: 0.55   cornerJitter: 0.7   cornerOffset: 4
mag: Math.min(w, h) * 0.025
```

**ShapeGrain on desktop card:** `opacity: 0.2` (`STORY_GRAIN.paper`), `frequency: 0.85`

**Chalk effect:** `chalkSeed={index}` passed to `HandDrawnBorder`

**Hover reveal:** radial mask expanding from cursor, `transition: r 460ms linear`

**Tags:** unoutlined `TagPill`s filled 5 lightness points deeper than the card's fill, so they stay readable once the hovered interior (`92.5%`) washes toward it.

**Image placeholder:** 16% × 62% aspect ratio area; diagonal stripe pattern `strokeOpacity: 0.28`, `strokeWidth: 1.5`; `GrainOverlay opacity: 0.03` (`STORY_GRAIN.cover`)

**Wavy separator line:**
```
wavyLine(200, seed + 91, amplitude=1.2, steps=6)
stroke: oklch(55% 0.04 {hue} / 0.4)   strokeWidth: 1.1
```

**Mobile mode** (≤720px):
```
background: cardInterior (full-width)
padding: 32px calc(18px + clamp(24px, 5vw, 80px))
margin: 0 calc(-1 * clamp(24px, 5vw, 80px))   (full-bleed)
GrainOverlay opacity: 0.045   (STORY_GRAIN.band)
wavy divider between cards: strokeWidth 1.4
```

The story cards' grain lives in [`src/lib/design/grain.ts`](../src/lib/design/grain.ts) (the apps copy it as `StoryGrain`). On a phone the overlay lies over everything in the band, text and cover included, so it stays light — at the old 0.08 + 0.055 it read as sandpaper. The card is its own stacking context (`isolation: isolate`): a control laid over it from outside, like the card box's ⋯ and its menu, floats above the grain.

**CSS** ([`StoryCard.module.css`](../src/components/molecules/StoryCard/StoryCard.module.css)):
```css
.card        { transition: background 320ms ease; }
.imagePlaceholder { border-radius: 14px 18px 12px 16px; padding-bottom: 62%; }
.title       { font-size: 18px; font-weight: 700; line-height: 1.3; }
.excerpt     { font-size: 14px; line-height: 1.65; }
.authorName  { font-size: 13px; font-weight: 600; }
.readTime    { font-size: 12px; }
.content     { gap: 14px; }
.authorRow   { gap: 10px; padding-top: 8px; }
arrow icon   { opacity: hovered ? 0.7 : 0.28; transition: opacity 180ms; }
```

---

### 5.4 `TagPill`

**File:** [`src/components/atoms/TagPill/TagPill.tsx`](../src/components/atoms/TagPill/TagPill.tsx)

Renders with `HandDrawnBorder`; background color passed from parent. `sm` / `md` are data (the tags on cards, in feeds, under a story) and draw a bare tinted fill; `lg` / `xl` are input-like (removable chips) and keep the faint ink outline — see §14.

**CSS** ([`TagPill.module.css`](../src/components/atoms/TagPill/TagPill.module.css)):
```css
padding: 4px 14px;
font-size: 11px;  font-weight: 600;  letter-spacing: 0.04em;
text-transform: uppercase;  line-height: 1.3;
color: var(--color-text);
```

---

### 5.5 `GrainOverlay`

**File:** [`src/components/atoms/GrainOverlay/GrainOverlay.tsx`](../src/components/atoms/GrainOverlay/GrainOverlay.tsx)

Full-area SVG grain overlay, absolutely positioned, `pointerEvents: none`, `zIndex: 10`.

```
feTurbulence: type="fractalNoise" baseFrequency="0.72" numOctaves=4 stitchTiles="stitch"
feColorMatrix: type="saturate" values="0"
feBlend: mode="multiply"
```

Default `opacity: 0.06`. Used at:
- Global page grain: `--grain-opacity: 0.10`
- Card cover / image placeholder: `opacity: 0.03` (`STORY_GRAIN.cover`)
- Mobile card band: `opacity: 0.045` (`STORY_GRAIN.band`)

---

### 5.6 `OrganiBlob`

**File:** [`src/components/atoms/OrganiBlob/OrganiBlob.tsx`](../src/components/atoms/OrganiBlob/OrganiBlob.tsx)

Decorative SVG blob shapes (5 variants), placed absolutely, `pointerEvents: none`.

**Default fill:** `oklch(88% 0.08 55)` (terracotta-light tint)

**Grain filter on blobs:**
```
feTurbulence baseFrequency="0.9" numOctaves=2 stitchTiles="stitch"
feColorMatrix saturate=0
feFuncA slope={grain}   (default grain=0.4)
feComposite operator="in"
```

**Placement per section:**

| Section | Blob | position | opacity | size |
|---|---|---|---|---|
| Hero | blob1 | `top: 8%, left: -4%` | 0.35 | — |
| Hero | blob2 | `bottom: 10%, right: -3%` | 0.25 | — |
| Hero | blob3 | `top: 45%, right: 10%` | 0.18 | — |
| CardFeed | blob | `bottom: 40px, left: -60px` | 0.15 | — |
| CTA | blobTop | `top: 120px, left: 5%` | 0.15 | — |
| CTA | blobBottom | `bottom: 40px, right: 8%` | 0.12 | — |

---

### 5.7 `SectionEdge`

**File:** [`src/components/atoms/SectionEdge/SectionEdge.tsx`](../src/components/atoms/SectionEdge/SectionEdge.tsx)

Renders a wavy top-edge transition between sections. SVG `viewBox="0 0 1440 {height}"` `preserveAspectRatio="none"`.

**Default parameters:**
```
height: 80px   amplitude: 0.15   steps: 14   strokeWidth: 1.2
baseY: height * 0.78
amp: height * amplitude
```

**Mobile** (≤640px): `steps = max(4, round(steps * 0.45))`, `seed += 9173`

**Section-edge usage:**

| Between | topColor | stroke | seed |
|---|---|---|---|
| Hero → CardFeed | `var(--color-cream-dark)` | `oklch(55% 0.05 60 / 0.38)` (approx) | varies |
| CardFeed → CTA | `var(--color-terracotta)` | — | varies |
| CTA → Footer | `var(--color-text)` | — | varies |

---

### 5.8 `HandDrawnAvatar`

**File:** [`src/components/atoms/HandDrawnAvatar/HandDrawnAvatar.tsx`](../src/components/atoms/HandDrawnAvatar/HandDrawnAvatar.tsx)

Circular avatar with initials, wobbled border via `HandDrawnBorder`.

**Default size:** `30px`  
**Color:** card `accentFill`  
**Seed:** `charCode(initials[0]) * 13`

---

## 6. Section Layouts

### 6.1 SiteHeader

**File:** [`src/components/sections/SiteHeader/SiteHeader.module.css`](../src/components/sections/SiteHeader/SiteHeader.module.css)

```css
.header { position: fixed; top: 0; left: 0; right: 0; z-index: 100; pointer-events: none; }

.bg {
  background: oklch(96% 0.015 75 / 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: opacity 300ms ease;
}

.row {
  padding-left:  max(clamp(24px, 5vw, 80px), calc((100% - 1200px) / 2));
  padding-right: max(clamp(24px, 5vw, 80px), calc((100% - 1200px) / 2));
  pointer-events: auto;
}

.brand  { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
.nav    { gap: 36px; }
.navLink { font-size: 15px; font-weight: 500; opacity: 0.8; transition: opacity 150ms; }
.navLink:hover { opacity: 1; }
.account { gap: 12px; }
```

**Wave stroke:** SVG wave `amplitude: 1.4`, `steps: 12`; stroke `oklch(55% 0.05 60 / 0.38)`

**Header body height:** 68px · Wave height: 14px · Total: 82px

---

### 6.2 HeroSection

**File:** [`src/components/sections/HeroSection/HeroSection.module.css`](../src/components/sections/HeroSection/HeroSection.module.css)

```css
.hero {
  min-height: 100vh;
  background: var(--color-cream);
  padding-top: 100px;
  display: flex; align-items: center; justify-content: center;
}

.content { max-width: 720px; padding: 0 clamp(24px, 5vw, 80px); text-align: center; }

.headline { font-size: clamp(42px, 7vw, 84px); font-weight: 800; line-height: 1.08; letter-spacing: -0.03em; margin: 0 0 24px; }
.accent   { color: var(--color-terracotta); }
.squiggle { bottom: -6px; left: 0; width: 100%; height: 12px; }  /* wavy underline */

.description { font-size: clamp(16px, 2vw, 20px); line-height: 1.7; max-width: 520px; margin: 0 auto 40px; }

.ctaRow { gap: 14px; justify-content: center; flex-wrap: wrap; }

.proof  { margin-top: 56px; gap: 16px; }
.proofText { font-size: 13px; font-style: italic; }
```

---

### 6.3 CardFeedSection

**File:** [`src/components/sections/CardFeedSection/CardFeedSection.module.css`](../src/components/sections/CardFeedSection/CardFeedSection.module.css)

```css
.section {
  background: var(--color-cream-dark);
  padding: clamp(140px, 14vw, 200px) clamp(24px, 5vw, 80px) clamp(120px, 14vw, 180px);
}

.container { max-width: 1200px; margin: 0 auto; }

.title    { font-size: clamp(28px, 4vw, 48px); font-weight: 700; letter-spacing: -0.025em; margin: 16px 0 12px; }
.subtitle { font-size: 16px; max-width: 420px; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
/* Desktop gap: 24px between cards (inline padding on each card = 22px) */
/* Mobile: gap 0, full-bleed cards */

.loadMore { text-align: center; margin-top: 48px; }
.heading  { text-align: center; margin-bottom: 56px; }
```

---

### 6.4 CTASection

**File:** [`src/components/sections/CTASection/CTASection.module.css`](../src/components/sections/CTASection/CTASection.module.css)

```css
.section {
  background: var(--color-terracotta);
  padding: clamp(150px, 15vw, 220px) clamp(24px, 5vw, 80px) clamp(120px, 14vw, 180px);
  display: flex; flex-direction: column; align-items: center; text-align: center;
}

.content { max-width: 600px; }

.title       { font-size: clamp(30px, 4.5vw, 52px); font-weight: 800; color: var(--color-cream); line-height: 1.15; letter-spacing: -0.025em; margin: 0 0 16px; }
.description { font-size: 17px; color: oklch(96% 0.015 75 / 0.8); line-height: 1.65; margin: 0 0 40px; }
.ctaRow      { gap: 14px; justify-content: center; flex-wrap: wrap; }
```

---

### 6.5 SiteFooter

**File:** [`src/components/sections/SiteFooter/SiteFooter.module.css`](../src/components/sections/SiteFooter/SiteFooter.module.css)

```css
.footer {
  background: var(--color-text);
  padding: clamp(130px, 13vw, 180px) clamp(24px, 5vw, 80px) clamp(40px, 5vw, 64px);
}

.container { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 28px; }

.brandName  { font-size: 18px; font-weight: 700; color: var(--color-cream); }
.tagline    { font-size: 13px; font-style: italic; color: oklch(85% 0.015 75 / 0.5); }
.links      { gap: 28px; flex-wrap: wrap; justify-content: center; }
.link       { font-size: 13px; color: oklch(85% 0.015 75 / 0.55); transition: color 150ms; }
.link:hover { color: oklch(85% 0.015 75 / 0.9); }
.divider    { height: 1px; background: oklch(85% 0.015 75 / 0.1); }
.copyright  { font-size: 12px; color: oklch(85% 0.015 75 / 0.3); }
```

---

## 7. Animations & Transitions

**Modal entrance** (defined in `globals.css`):
```css
@keyframes resModalFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes resModalPopIn {
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

**Interaction transitions:**

| Element | Property | Duration | Easing |
|---|---|---|---|
| Header background | opacity | 300ms | ease |
| Nav link | opacity | 150ms | — |
| Button hover reveal | SVG circle `r` | 340ms | linear |
| Card hover reveal | SVG circle `r` | 460ms | linear |
| Card background | background | 320ms | ease |
| Arrow icon | opacity | 180ms | — |
| Footer link | color | 150ms | — |

---

## 8. Wavy Path System

**Used by:** section edges, card separators, mobile card dividers, header wave

**`wavyLine(width, seed, amplitude, steps)`** — produces a horizontal wavy SVG path.

**`wavyPoints` + `pointsToBezier`** — used by `SectionEdge` for filled + stroked waves.

**Parameters in use:**

| Usage | amplitude | steps | strokeWidth |
|---|---|---|---|
| Header wave | 1.4 | 12 | 1.3 |
| SectionEdge default | 0.15 × height | 14 | 1.2 |
| Card separator | 1.2 | 6 | 1.1 |
| Mobile card divider | 1.4 | 7 | 1.4 |

---

## 9. Z-Index Stack

| Layer | z-index |
|---|---|
| Header | 100 (fixed) |
| Tweaks panel | 9999 |
| Section content | 1–4 |
| Decorative blobs | 0 |
| Grain overlays | 10 |

---

## 10. Responsive Breakpoints

| Breakpoint | Used for |
|---|---|
| ≤720px | Navigation collapse (mobile nav modal) |
| ≤640px | SectionEdge step reduction (45% of desktop steps) |
| — | StoryCard mobile mode (useIsMobile default ~720px) |

**Container max-width:** `1200px`  
**Section horizontal padding:** `clamp(24px, 5vw, 80px)` (or dynamic header formula)  
**Card grid:** `repeat(auto-fill, minmax(300px, 1fr))`

---

## 11. Form System ([`src/components/atoms/Field`](../src/components/atoms/Field/Field.tsx))

Unified label / control / hint primitives. All inputs share the same chrome
(border, focus ring, placeholder treatment) via `Field.module.css`.

| Token | Value | Where defined |
|---|---|---|
| `--field-pad-y` | `14px` | tokens.css |
| `--field-pad-x` | `18px` | tokens.css |
| `--field-radius` | `16px` | tokens.css |
| `--field-border` | `oklch(80% 0.02 75)` | tokens.css |
| `--field-border-hover` | `oklch(60% 0.04 60)` | tokens.css |
| `--field-border-focus` | `var(--color-terracotta)` | tokens.css |
| `--placeholder` | `oklch(64% 0.03 70)` | tokens.css |
| `--label-size` / `--label-tracking` | `12px` / `0.06em` | tokens.css |
| `--hint-size` | `12px` | tokens.css |

**Placeholders** are styled globally in `globals.css` — italic, family
`--font-body`, color `--placeholder`. Do not override per-component.

**Components:**

- `<FieldLabel htmlFor required>` — uppercase 12px caption.
- `<FieldHint tone="default|ok|error">` — 12px, color matches tone.
- `<CharCount count max />` — right-aligned, turns terracotta when over.
- `<Input variant="default|subtle" tone="default|display" />` — single line.
- `<Textarea>` — same props as Input; `tone="display"` swaps to Playfair 22/700.
- `<Field label hint hintTone trailing>{control}</Field>` — wraps the three above.

**Variant: `subtle`** — borderless input with only a bottom rule, for inline
editing inside Panels (no nested-card chrome).

---

## 12. Panel + Divider — Section Composition

**Rule:** never nest cards inside cards. Use one `<Panel>` per region; split
its inner content with `<Divider />`. On mobile, Panels with
`collapseOnMobile` (default `true`) drop all chrome and read as plain sections.

**Files:**
- [`src/components/molecules/Panel`](../src/components/molecules/Panel/Panel.tsx)
- [`src/components/atoms/Divider`](../src/components/atoms/Divider/Divider.tsx)

```tsx
<Panel title={<>AI 寫作夥伴</>} footer={hint} sticky collapseOnMobile>
  <AiRow title="潤稿" hint="..." />
  <Divider seed={11} />
  <AiRow title="標題建議" hint="..." />
  <Divider seed={23} />
  <AiRow title="生成標籤" hint="..." />
</Panel>
```

`<Panel variant>` — `default` (filled + bordered), `soft` (no border), `plain`
(no padding/background). `<Panel sticky>` snaps to
`calc(var(--app-header-h) + 16px)` in a side-rail layout.

`<Divider orientation="horizontal" seed amplitude steps color spacing />` —
wavy by default, matches the section-edge family.

---

## 13. Page Rhythm

The `(app)` route group's layout no longer applies any top padding. Every page
must own its own header offset via one of:

1. **Recommended:** `<PageShell width="default|wide">{children}</PageShell>`
   ([`src/components/molecules/PageShell`](../src/components/molecules/PageShell/PageShell.tsx))
   — handles max-width, padding, and `paddingTop:
   calc(var(--app-header-h) + var(--page-pad-top))`.
2. Use the same calc directly when the page has bespoke chrome (e.g. card
   detail's narrow article container).

```css
--app-header-h: 82px;       /* fixed AppHeader total */
--page-pad-top: clamp(40px, 6vw, 72px);
--page-pad-bottom: clamp(64px, 8vw, 112px);
--page-pad-x:   clamp(20px, 4vw, 48px);
--page-max-w:   1080px;
--page-max-w-wide: 1200px;
```

`<PageTitle eyebrow subtitle align>` provides the standard h1 typography for
the first heading of a page.

---

## 14. TagPill Sizes

```tsx
<TagPill size="sm" />  // 10px / pad 3·10
<TagPill size="md" />  // 11px / pad 4·14  (default — feed/detail)
<TagPill size="lg" />  // 13px / pad 7·18  (filters, editor pills)
<TagPill size="xl" />  // 14px / pad 9·22  (page eyebrow / hero)
```

Outline: `sm` / `md` are a bare fill (one frame per layer — a label inside a framed card needs no rim); `lg` / `xl` keep the ink outline. A small pill that sits on bare page paper rather than inside a framed card (the owner's "anonymous" badge under a shelf card: cream-dark on cream) passes `outlined` to get its rim back. The thought map's edge labels stay unoutlined.

Additional props:
- `outlined?: boolean` — force the rim on (or off); defaults to the size's rule above.
- `onRemove?: () => void` — renders a × button on the right.
- `onClick?: () => void` — whole pill becomes a button (filter chip pattern).
- `seed` — explicit wobble seed; otherwise derived from the label.

---

## 15. Icon System ([`src/components/atoms/Icon`](../src/components/atoms/Icon))

Hand-drawn SVG icons accessed through a single registry. **Do not** add inline
SVG or emoji to component files — register a new icon instead.

```tsx
<Icon name="bell" size={22} />
<Icon name="sparkle" size={14} color="var(--color-terracotta)" />
<Icon name="check" size={16} ariaLabel="Saved" />
```

**Adding an icon:**
1. Create `src/components/atoms/Icon/icons/<name>.tsx`, exporting a function
   that accepts `IconRenderProps { size, color, strokeWidth }`.
2. Use hand-drawn stroke style: slightly wobbled bezier paths, `strokeLinecap`
   round, no fill except for accents. Match the existing icons' weight.
3. Add the import + entry in `registry.ts`. The `IconName` union updates
   automatically via `satisfies`.

**Why a registry over per-file imports:** consumers pass the name as a string
(handy for prop drilling like `<TabBar icon="bell" />`), all icons share one
prop contract, and future swaps (e.g. lazy load, theme variants) only touch
the registry.

**Current icons:** `bell`, `star`, `sparkle`, `close`, `plus`, `check`,
`arrow-right`, `image`, `eye`, `lock`, `users`, `globe`.

---

## 16. Adaptive Wobble (`src/lib/design/wobAuto.ts`)

Every hand-drawn rounded-rect surface needs three procedural parameters:

| param | meaning |
|---|---|
| `segmentsH` / `segmentsV` | turning points along the horizontal / vertical edges |
| `mag` | perpendicular wobble amplitude in pixels |
| `curve` | per-segment bow factor (higher = more pronounced) |

`wobAuto.ts` derives all three from the surface's measured width and height
so designers don't need to tune each call site:

```ts
autoSegments(edge)  // ~1 point per 95px, clamped 2–8
autoMag(w, h)       // clamp(2 + min·0.013, 2.4, 4)px
autoCurve(w, h)     // clamp(1.8 − min·0.003, 0.6, 1.6)
```

Two intuitions baked in:

1. **Each edge is scaled independently** — long sides get more turning
   points than short sides on the same shape. When an image upload box
   becomes taller after a file is loaded, the vertical edges automatically
   pick up more anchors.
2. **Curve inversely scales with size** — small chips/buttons need a high
   `curve` for the hand-drawn quality to read at all (~1.6); big cards need
   a low `curve` (~0.6) or they look crooked, not organic.

### Reference table

| surface | dims | segH | segV | mag | curve |
|---|---|---|---|---|---|
| Visibility chip | 120×44 | 2 | 2 | 2.6 | 1.6 |
| Tag pill / button | 90×36 | 2 | 2 | 2.5 | 1.6 |
| Single-line Input | 320×46 | 3 | 2 | 2.6 | 1.6 |
| Textarea | 520×220 | 5 | 2 | 4.0 | 1.1 |
| Panel (default) | 380×500 | 4 | 5 | 4.0 | 0.7 |
| Upload (empty) | 480×140 | 5 | 2 | 3.8 | 1.4 |
| Upload (with image) | 480×420 | 5 | 4 | 4.0 | 0.6 |

### Wiring

Both border atoms — `HandDrawnBorder` (solid) and `HandDrawnDashedBorder` /
`HandDrawnDashedSurface` (kept name for compat; draws a solid wobbly curve) —
fall back to `autoSegments` / `autoMag` / `autoCurve` whenever the matching
prop is `undefined`. Pass an explicit value only when you want to override.

```tsx
// Auto everywhere — the usual path:
<HandDrawnDashedSurface seed={5}>{children}</HandDrawnDashedSurface>

// Tuned override (StoryCard, AuthCard etc.):
<HandDrawnBorder w={w} h={h} segmentsH={[3, 4]} segmentsV={[5, 6]} curve={0.55} />
```

### Border color states (form surfaces)

| state | token |
|---|---|
| idle | `--field-border` (gray) |
| hover | `--field-border-hover` (darker gray) |
| focus / emphasized item | `--field-border-focus` (terracotta) |

The `state` prop on `HandDrawnDashedSurface` picks the right token; callers
just pass `state={focus ? 'focus' : hover ? 'hover' : 'idle'}`.

## 17. Anti-Patterns

- Overusing organic shapes — max 2–3 per page
- Making buttons unrecognizable (maintain pill shape affordance)
- Heavy noise texture — grain should feel soft, not dominant
- Strong drop shadows, glassmorphism, neumorphism
- Full illustration replacing functional UI components
- **Cards inside cards.** Use `<Panel>` + `<Divider />` instead.
- **Inline SVG / emoji icons in components.** Register an `Icon` instead.
- **Inline `style` for typography, color, padding tokens.** Use CSS Modules +
  tokens. Inline `style` is acceptable for one-off layout (grid template,
  sticky positioning) but never for design-system values.
- **Page-level top padding hard-coded per page.** Use `<PageShell>` or the
  `calc(var(--app-header-h) + var(--page-pad-top))` formula.
- **Hard-coded `segmentsH/V` / `mag` / `curve` on new surfaces.** Let
  `wobAuto` handle it. Override only when you're matching an aesthetically
  tuned legacy primitive (e.g. `StoryCard`).
