---
name: resonance-ui
description: Use this skill whenever you are building, editing, or reviewing UI for the Resonance app — pages, forms, panels, cards, icons, tags, or any visual surface in src/components or src/app/[locale]. Triggers on requests like "add a form field", "build a settings section", "add an icon", "fix this page layout", "redesign this card", or any work that touches OrganicButton/Panel/Field/Icon/TagPill/PageShell. Loads the project's component contract so you reuse the right primitives instead of writing inline styles or duplicate SVGs.
---

# Resonance UI — Component Contract

When building UI in this repo, **always reach for these primitives before writing inline styles or new SVG**. The canonical reference is [designs/DESIGN.md](../../../designs/DESIGN.md); this file is the quick-recall checklist.

## Decision tree

| You want to… | Use |
|---|---|
| Build a page in `(app)/...` | `<PageShell>` + `<PageTitle>` |
| Build a page in `(auth)/...` | The `(auth)` layout already centers — just place content |
| Take text input | `<Input>` or `<Textarea>` (from `atoms/Field/Field`) |
| Pick from a fixed list (dropdown) | `<Select>` (from `atoms/Field/Field`) — wobbly box that expands into a curved **card covering the box**, listing the options with a wavy hand-drawn divider between each (reaching both edges) and the active option washed in along the curved region |
| Render account/profile menu actions in desktop header | `<Subnavbar>` (from `sections/AppHeader/Subnavbar`) — wobbly organic dropdown hanging off the user avatar with wavy dividers and a radial-reveal hover wash |
| Add a label / hint / char counter | `<Field label hint trailing={<CharCount/>}>` |
| Switch between tabs / nav sections | `<OrganicTabs orientation="horizontal|vertical">` (from `molecules/OrganicTabs`) |
| Flip a boolean preference (on/off switch) | `<ToggleSwitch checked onChange>` (from `atoms/ToggleSwitch`) — wobbly track + knob |
| Pick a number on a range (slider) | `<OrganicSlider value onChange min max step>` (from `atoms/OrganicSlider`) — wobbly track + terracotta fill + hand-drawn knob over a transparent native range |
| Show a busy / loading state (e.g. while uploading) | `<SketchLoader>` (from `atoms/SketchLoader`) — wobbly rings that continuously re-sketch themselves |
| Separate stacked rows/sections | `<Divider seed={N} spacing={6} />` — wavy pen rule, never a flat 1px border |
| Group related controls into a side panel | one `<Panel>` with `<Divider />` between sub-sections |
| Show a status icon (bell, star, sparkle, check, close, plus, arrow-right, chevron-down, image, eye, lock, users, globe, wave, pen, cards, logout) | `<Icon name="…" size=… />` |
| Show a tag / chip | `<TagPill size="sm|md|lg|xl" onRemove? onClick?>` |
| Primary action | `<OrganicButton variant="primary|outline|ghost">` |
| Vertical/horizontal separator | `<Divider seed={N} />` |
| Wrap something in a hand-drawn surface | `<HandDrawnDashedSurface seed={N} state="idle|hover|focus">` |
| Emphasize a word with a curvy underline | `<Emphasis color="…">…</Emphasis>` |

## Hard rules

1. **No card-in-card.** If a region inside a `<Panel>` looks like it needs another container, use `<Divider />` between sub-sections instead. On mobile the Panel chrome collapses automatically (`collapseOnMobile` default `true`).
2. **No inline SVG and no emoji icons** in component files. Add the SVG to `src/components/atoms/Icon/icons/<name>.tsx` and register it in `registry.ts`. Then call `<Icon name="…" />`.
3. **No inline `style` for design-system values** — typography, color, padding, radius. Use CSS Modules + tokens (`var(--…)`). Inline `style` is fine for one-off layout (grid template, sticky offset).
4. **Pages in `(app)/...` must own their header offset.** The `(app)` layout does **not** add top padding. Either use `<PageShell>` or apply `padding-top: calc(var(--app-header-h) + var(--page-pad-top))` directly.
5. **Placeholders are styled globally** in `globals.css`. Do not set `::placeholder` per-component.
6. **Do not hard-code `segmentsH/V` / `mag` / `curve` on new hand-drawn surfaces.** `wobAuto.ts` derives all three from the measured size — long edges automatically get more turning points than short edges, big surfaces curve gently, small chips curve assertively. Override only when matching a tuned legacy primitive (`StoryCard`, `AuthCard`, …).
7. **Border color states for form surfaces:** idle → `--field-border` (gray), hover → `--field-border-hover` (darker gray), focus / emphasized item → `--field-border-focus` (terracotta). `HandDrawnDashedSurface` handles this via its `state` prop — just feed it the React state.
8. **Size-driven shapes measure before they draw — never seed a guessed size, never show a half-drawn shape.** Any SVG whose geometry comes from `wobRect`/`wobCircle`/`wavyLine` (e.g. `HandDrawnBorder`, `ShapeGrain`) must take its pixel size from `useElementSize` and **render `null` until measured** (`if (!w || !h) return null`). `useElementSize` starts at `0×0` and measures in a layout effect (synchronous, pre-paint), so the shape appears already at the correct geometry instead of flashing at a default size and resizing ~1s later. Wrap the SVG in `className="res-shape-fade-in"` (keyframe in `globals.css`, respects `prefers-reduced-motion`) so its arrival is a soft fade, not a pop. The trailing numeric args to `useElementSize(ref, …)` are legacy no-ops — don't rely on them for an initial size.
9. **Skeletons use plain CSS chrome, not organic SVG.** A loading placeholder must not run the measure-then-draw cycle (it would flash at the wrong size before settling). Give the loading branch a CSS rounded border that paints instantly at the right footprint — see `StoryCard`'s `loading` branch rendering `.skeletonChrome` instead of `<HandDrawnBorder>` — and reuse the real component's interior tint so it stays visually continuous.
10. **Custom Select dropdown structure & spacing:** The custom `<Select>` dropdown renders as a wobbly card covering the trigger box, with options separated by smooth wavy dividers (cubic curves from `segs()` helper, amplitude `3`) instead of flat polylines. Option rows use `16px` padding (taller rows) and the dropdown panel has `0` top/bottom padding to keep option rows evenly centered. To avoid double-outlines when the dropdown is open, hide the underlying trigger's border (`strokeColor="transparent"`).
11. **Table of Contents (ToC) vertical rules:** The vertical curve line running down the left of the headings list is generated via `wavyVertical` (with amplitude `5` and stroke `3`). It is rendered in a fixed-width `div.rail` with explicit inline pixel dimensions (`width: ${railW}px`, `height: ${listH}px`) to prevent browsers from collapsing it to 0 height/width in flex layouts, and the SVG itself uses inline pixel style matching these dimensions.
12. **SegmentedActionBar hover wash animations:** Instead of using a single shared reveal circle that teleports when hovering between options, each segment owns its own reveal circle (radius grows to max for the hovered one, stays at 0 for others). This allows the hover wash to shrink/grow independently per segment during pointer movement.
13. **Card design on mobile/phones:** On mobile screens, cards (such as story cards, login cards, settings cards) must not be rendered with wobbly borders. Instead, they degrade to a full-bleed block/section styled with an interior background color (using the card's specific theme/fill color), a grain texture overlay (`<GrainOverlay>`), and framed by wavy divider rules at the top and bottom (matching the card's border color). They should bleed to the edge of the screen (typically using negative horizontal margins matching the layout padding), rather than being simple uncolored sections separated by dividers.

## Common props quick reference

```tsx
// Page scaffolding
<PageShell width="default" | "wide">
  <PageTitle eyebrow={<TagPill>…</TagPill>} subtitle="…" align="start|center">
    Title
  </PageTitle>
  …content…
</PageShell>

// Forms
<Field label="Story" hint="280–1200 words" hintTone="default|ok|error" trailing={<CharCount count={n} max={1200} />}>
  <Textarea variant="default|subtle" tone="default|display" placeholder="…" rows={14} />
</Field>
<Field label="Region">
  {/* Custom organic dropdown — NOT a native <select>. `onChange` receives the
      chosen value directly (string), not a DOM event. Children are still
      <option>s (parsed for value + label). Clicking opens a curved card that
      covers the box and lists the options, with a wavy divider between each. */}
  <Select seed={43} value={region} onChange={setRegion} ariaLabel="Region">
    <option value="TW">🇹🇼 Taiwan</option>
  </Select>
</Field>

// Tabs / section switcher (horizontal = wavy underline, vertical = wobbly highlight)
<OrganicTabs
  orientation="horizontal" seed={23}
  tabs={keys.map((k) => ({ key: k, label: t(k) }))}
  active={active} onChange={setActive}
/>

// Toggle (atoms/ToggleSwitch): organic wobbly pill track + slightly irregular
// knob. Fixed 50×28 — NOT size-configurable, and self-contained (no
// useElementSize), so it draws correctly on first paint.
//  - `onChange` is a bare `() => void` toggle callback — it gets NO event, so
//    flip the state yourself: onChange={() => setOn(!on)}.
//  - Renders a real <button role="switch" aria-checked>; always pass ariaLabel
//    (or label it via an adjacent <label>) since there's no visible text.
//  - `seed` makes the track+knob wobble deterministic per instance — vary it
//    between rows so adjacent switches don't look identical.
// Lay out settings as rows separated by <Divider>, never boxed in flat borders.
<ToggleSwitch checked={on} onChange={() => setOn(!on)} ariaLabel="Email digest" seed={71} />

// Panels
<Panel title={<><Icon name="sparkle" size={16}/> AI</>} footer="hint" sticky collapseOnMobile variant="default|soft|plain">
  …section…
  <Divider seed={11} />
  …section…
</Panel>

// Tags
<TagPill size="lg" color="oklch(92% 0.075 88)" onRemove={() => …}>記憶</TagPill>

// Icons (defaults: size 26, strokeWidth 2.1)
<Icon name="bell" size={22} ariaLabel="Notifications" />

// Hand-drawn surface (auto-sized wobble — short edge few points, long edge many)
<HandDrawnDashedSurface seed={31} state={focus ? 'focus' : hover ? 'hover' : 'idle'}>
  …content…
</HandDrawnDashedSurface>

// Curve underline for emphasis
<Emphasis color="var(--color-terracotta)">記憶</Emphasis>

// Buttons
<OrganicButton variant="primary|outline|ghost|ctaLight|ctaGhost">…</OrganicButton>
```

## When extending the system

- **New icon:** add `icons/<name>.tsx` matching the existing hand-drawn style (slightly wobbled bezier, round caps, no fill except small accents), then register it.
- **New form input type:** extend `Field` or compose with an existing one rather than starting from scratch.
- **New page layout:** see if `PageShell` + a custom inner grid works first. Only fork the container when there is a genuine layout need (e.g. card detail's narrow article column).
- **New section variant:** add a `variant` to `Panel` rather than introducing a sibling component.

## Adaptive wobble at a glance

`src/lib/design/wobAuto.ts` exposes three pure functions used by both border
atoms when you don't pass explicit props:

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

## Tokens to know (defined in `src/styles/tokens.css`)

- Page rhythm: `--app-header-h`, `--page-pad-top`, `--page-pad-bottom`, `--page-pad-x`, `--page-max-w`, `--page-max-w-wide`
- Forms: `--field-pad-y/x`, `--field-radius`, `--field-border`, `--field-border-hover`, `--field-border-focus`, `--placeholder`, `--label-size`, `--label-tracking`, `--hint-size`
- Color / typography: see DESIGN.md §2–§4

## When in doubt

Read [designs/DESIGN.md](../../../designs/DESIGN.md) — it is the source of truth. This Skill is the trail map; DESIGN.md is the territory.
