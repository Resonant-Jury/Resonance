// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { render, screen } from '@/../test/render';
import { penLines } from '@/../test/organic';
import { INK_LIGHT } from '@/lib/design/strokes';
import { AuthCard, SHEET_EDGE_TURNS, SHEET_EDGE_TURN_PX } from './AuthCard';

function serverHtml(ui: React.ReactElement) {
  const host = document.createElement('div');
  host.innerHTML = renderToString(ui);
  return host;
}

describe('AuthCard', () => {
  it('heads the card with its title, the intro right under it', () => {
    render(
      <AuthCard title="Welcome back" intro="We never see your password.">
        <button type="button">Continue</button>
      </AuthCard>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Welcome back' });
    expect(title.nextElementSibling).toHaveTextContent('We never see your password.');
    expect(title.nextElementSibling?.nextElementSibling).toHaveTextContent('Continue');
  });

  it('goes straight from the title to the form when there is no intro', () => {
    render(
      <AuthCard title="Create your account">
        <label>
          Pen name <input />
        </label>
      </AuthCard>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Create your account' });
    expect(title).not.toHaveAttribute('data-intro');
    expect(title.nextElementSibling).toContainElement(screen.getByLabelText('Pen name'));
  });
});

// On a phone the card is a sheet at the foot of the screen: the card's paper
// under one wavy pen line, a turn every ~68px of its width, and no rule below.
describe('the phone sheet', () => {
  // The phone's design must be the first paint, scripts or none: the edge
  // cannot wait to measure the sheet, so every band of widths has its own.
  it('has its top edge in the server HTML, one pen line per band of widths', () => {
    const host = serverHtml(<AuthCard title="Welcome back">…</AuthCard>);
    const edges = Array.from(host.querySelectorAll('svg[data-turns]'));
    expect(edges.map((e) => Number(e.getAttribute('data-turns')))).toEqual([...SHEET_EDGE_TURNS]);

    for (const edge of edges) {
      const [line] = penLines(edge);
      expect(penLines(edge)).toHaveLength(1);
      expect(line).toHaveAttribute('stroke-width', String(INK_LIGHT));
      // A curve per turn.
      expect(line.getAttribute('d')?.match(/C/g)).toHaveLength(Number(edge.getAttribute('data-turns')));
      // Above the line lies the page's paper, so the sheet starts at the line.
      expect(edge.querySelector('path[fill="var(--color-cream)"]')).not.toBeNull();
    }
  });

  it('draws nothing along its bottom', () => {
    const host = serverHtml(<AuthCard title="Welcome back">…</AuthCard>);
    const chrome = host.querySelector('svg[data-turns]')!.parentElement!;
    expect(penLines(chrome)).toHaveLength(SHEET_EDGE_TURNS.length);
  });

  // jsdom applies no media queries, so read the stylesheet: at every phone
  // width exactly one band shows, the one with round(width / 68) turns
  // (5 on the narrowest phones, 9 up to the 640px the sheet ends at).
  it('shows the band whose turns fit the width, at every phone width', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/components/molecules/AuthCard/AuthCard.module.css'),
      'utf8',
    );
    const bands = Array.from(
      css.matchAll(/@media ([^{]+)\{\s*\.edge\[data-turns='(\d+)'\]\s*\{\s*display:\s*block;?\s*\}/g),
      ([, query, turns]) => ({
        turns: Number(turns),
        min: Number(query.match(/min-width:\s*([\d.]+)px/)?.[1] ?? 0),
        max: Number(query.match(/max-width:\s*([\d.]+)px/)?.[1] ?? Infinity),
      }),
    );
    expect(bands.map((b) => b.turns).sort()).toEqual([...SHEET_EDGE_TURNS]);

    const lo = SHEET_EDGE_TURNS[0];
    const hi = SHEET_EDGE_TURNS[SHEET_EDGE_TURNS.length - 1];
    for (let width = 280; width <= 640; width += 0.5) {
      const shown = bands.filter((b) => width >= b.min && width <= b.max).map((b) => b.turns);
      const turns = Math.min(hi, Math.max(lo, Math.round(width / SHEET_EDGE_TURN_PX)));
      expect(shown, `${width}px`).toEqual([turns]);
    }
  });
});
