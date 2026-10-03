import { describe, it, expect } from 'vitest';
import { wobRect } from './wobRect';
import { BUBBLE_RADIUS, TUCKED_RADIUS, bubbleCorners, bubblePath, bubbleStandInRadius, seedFromId } from './bubble';

/** The chat bubble's recipe — shared with the apps' MessageBubbleShape, so a message wobbles the same everywhere. */
describe('bubble', () => {
  it('seeds a message’s wobble from its key the way the apps do', () => {
    // The values the apps' seedFromId documents.
    expect(seedFromId('m1')).toBe(183);
    expect(seedFromId('card-77', 11)).toBe(6326);
    // A long key wraps at 32 bits and still lands in 1…9973.
    const long = seedFromId('x'.repeat(400));
    expect(long).toBeGreaterThanOrEqual(1);
    expect(long).toBeLessThanOrEqual(9973);
  });

  it('tucks the corners facing a neighbour in a run, on the sender’s side', () => {
    const tall = 100;
    expect(bubbleCorners(tall, { run: 'single' })).toBeUndefined();
    // Theirs tuck on the left: tl, tr, br, bl.
    expect(bubbleCorners(tall, { run: 'first' })).toEqual([BUBBLE_RADIUS, BUBBLE_RADIUS, BUBBLE_RADIUS, TUCKED_RADIUS]);
    expect(bubbleCorners(tall, { run: 'middle' })).toEqual([TUCKED_RADIUS, BUBBLE_RADIUS, BUBBLE_RADIUS, TUCKED_RADIUS]);
    expect(bubbleCorners(tall, { run: 'last' })).toEqual([TUCKED_RADIUS, BUBBLE_RADIUS, BUBBLE_RADIUS, BUBBLE_RADIUS]);
    // Your own on the right.
    expect(bubbleCorners(tall, { own: true, run: 'first' })).toEqual([BUBBLE_RADIUS, BUBBLE_RADIUS, TUCKED_RADIUS, BUBBLE_RADIUS]);
    expect(bubbleCorners(tall, { own: true, run: 'middle' })).toEqual([BUBBLE_RADIUS, TUCKED_RADIUS, TUCKED_RADIUS, BUBBLE_RADIUS]);
    expect(bubbleCorners(tall, { own: true, run: 'last' })).toEqual([BUBBLE_RADIUS, TUCKED_RADIUS, BUBBLE_RADIUS, BUBBLE_RADIUS]);
    // A one-line bubble's radius is h·0.42, and a tuck never rounds more than the corner it replaces.
    expect(bubbleCorners(38, { run: 'middle' })).toEqual([TUCKED_RADIUS, 38 * 0.42, 38 * 0.42, TUCKED_RADIUS]);
    expect(bubbleCorners(6, { run: 'middle' })).toEqual([6 * 0.42, 6 * 0.42, 6 * 0.42, 6 * 0.42]);
  });

  it('draws a bubble alone as the plain recipe, and a run’s with its tucks', () => {
    const w = 213;
    const h = 39;
    const plain = wobRect(w, h, Math.min(18, h * 0.42), 183, Math.min(2.6, h * 0.05), {
      curve: 1.3,
      cornerJitter: 1.6,
      cornerOffset: Math.min(w, h) * 0.04,
      segmentsH: 3,
      segmentsV: 1,
    });
    expect(bubblePath(w, h, 183)).toBe(plain);
    expect(bubblePath(w, h, 183, { run: 'middle' })).not.toBe(plain);
    // The same message draws the same shape every time (server HTML and the browser agree).
    expect(bubblePath(w, h, 183, { own: true, run: 'first' })).toBe(bubblePath(w, h, 183, { own: true, run: 'first' }));
    // The quote takes its own, smaller radius.
    expect(bubblePath(160, 60, 19, { maxRadius: 16 })).not.toBe(bubblePath(160, 60, 19));
  });

  it('stands in before it is measured as a rounded box with the same tucks', () => {
    expect(bubbleStandInRadius()).toBe('18px 18px 18px 18px');
    expect(bubbleStandInRadius({ own: true, run: 'middle' })).toBe('18px 4px 4px 18px');
    expect(bubbleStandInRadius({ run: 'last' })).toBe('4px 18px 18px 18px');
    expect(bubbleStandInRadius({ maxRadius: 16 })).toBe('16px 16px 16px 16px');
  });
});
