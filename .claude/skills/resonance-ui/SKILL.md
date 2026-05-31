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
| Pick from a fixed list (dropdown) | `<Select>` (from `atoms/Field/Field`) — organic surface + hand-drawn chevron |
| Add a label / hint / char counter | `<Field label hint trailing={<CharCount/>}>` |
| Switch between tabs / nav sections | `<OrganicTabs orientation="horizontal|vertical">` (from `molecules/OrganicTabs`) |
| Flip a boolean preference (on/off switch) | `<ToggleSwitch checked onChange>` (from `atoms/ToggleSwitch`) — wobbly track + knob |
| Separate stacked rows/sections | `<Divider seed={N} spacing={6} />` — wavy pen rule, never a flat 1px border |
| Group related controls into a side panel | one `<Panel>` with `<Divider />` between sub-sections |
| Show a status icon (bell, star, sparkle, check, close, plus, arrow-right, chevron-down, image, eye, lock, users, globe, wave, pen) | `<Icon name="…" size=… />` |
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
  <Select seed={43} value={region} onChange={(e) => setRegion(e.target.value)}>
    <option value="TW">🇹🇼 Taiwan</option>
  </Select>
</Field>

// Tabs / section switcher (horizontal = wavy underline, vertical = wobbly highlight)
<OrganicTabs
  orientation="horizontal" seed={23}
  tabs={keys.map((k) => ({ key: k, label: t(k) }))}
  active={active} onChange={setActive}
/>

// Toggle rows: organic switch + wavy dividers between rows (no flat borders),
// roomy padding so the section breathes.
<ToggleSwitch checked={on} onChange={() => setOn(!on)} ariaLabel="…" seed={71} />

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
autoSegments(edge)  // ~1 anchor per 75px, clamped 2–8
autoMag(w, h)       // 2 + min·0.014, clamped 2.5–5px
autoCurve(w, h)     // 2.8 − min·0.005, clamped 0.6–2.5
```

Result: a 120×44 visibility chip auto-resolves to `segH=2, segV=2, curve≈2.5`
(maximally curvy because it's small); a 600×500 panel resolves to
`segH=8, segV=7, curve≈0.6` (gently shaped). When an upload box's height
grows after the user drops an image, the vertical-edge anchors auto-increase.

## Tokens to know (defined in `src/styles/tokens.css`)

- Page rhythm: `--app-header-h`, `--page-pad-top`, `--page-pad-bottom`, `--page-pad-x`, `--page-max-w`, `--page-max-w-wide`
- Forms: `--field-pad-y/x`, `--field-radius`, `--field-border`, `--field-border-hover`, `--field-border-focus`, `--placeholder`, `--label-size`, `--label-tracking`, `--hint-size`
- Color / typography: see DESIGN.md §2–§4

## When in doubt

Read [designs/DESIGN.md](../../../designs/DESIGN.md) — it is the source of truth. This Skill is the trail map; DESIGN.md is the territory.
