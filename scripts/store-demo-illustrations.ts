/**
 * Illustrations for the store demo world (scripts/seed-store-demo.ts).
 *
 * For every published card in the demo world it runs the project's own
 * pipeline, generateStoryImage(story) from src/lib/ai/tasks.ts (story ->
 * concept -> the app's doodle STYLE_SUFFIX prompt -> gpt-image, quality low),
 * then saves docs/store/graphics/demo-media/<cardId>.jpg, 768 px wide, JPEG
 * quality 80 (sips). seed-store-demo.ts turns each file into a data: URI on
 * the card's media.
 *
 *   npx tsx scripts/store-demo-illustrations.ts            # every card that has no file yet
 *   npx tsx scripts/store-demo-illustrations.ts --only=hotpot-for-one,sunday-market
 *   npx tsx scripts/store-demo-illustrations.ts --dry      # list what it would generate, spend nothing
 *
 * Idempotent: a card whose file exists is skipped, so reruns never re-spend.
 * To redo one image, delete its file and run again. This is the only script
 * that calls OpenAI (OPENAI_API_KEY from .env, never printed); it touches no
 * Firebase, R2 or store. Each attempt is one image; a card gets one retry and
 * a run stops at MAX_ATTEMPTS.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { generateStoryImage } from '../src/lib/ai/tasks';
import { CARDS, DEMO_MEDIA_DIR } from './seed-store-demo';

const CONCURRENCY = 3;
const MAX_ATTEMPTS = 30;
/** Image requests may start at most 5 a minute (the account's gpt-image limit), so keep 13 s between starts. */
const START_GAP_MS = 13_000;
const RATE_LIMIT_WAIT_MS = 35_000;
const MAX_RATE_LIMIT_WAITS = 20;
const WIDTH = 768;
const QUALITY = 80;

function loadKey() {
  if (!process.env.OPENAI_API_KEY) {
    try {
      process.loadEnvFile(resolve(process.cwd(), '.env'));
    } catch {
      // no .env: the check below reports it
    }
  }
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set (put it in .env)');
}

function toJpeg(png: Uint8Array, out: string) {
  const dir = mkdtempSync(join(tmpdir(), 'demo-illustration-'));
  try {
    const src = join(dir, 'in.png');
    writeFileSync(src, png);
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(QUALITY), '--resampleWidth', String(WIDTH), src, '--out', out], {
      stdio: 'ignore',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean);
  const dir = resolve(process.cwd(), DEMO_MEDIA_DIR);
  mkdirSync(dir, { recursive: true });

  const unknown = (only ?? []).filter((id) => !CARDS.some((c) => c.id === id));
  if (unknown.length) throw new Error(`Unknown card id(s): ${unknown.join(', ')}`);

  const todo = CARDS.filter((c) => (!only || only.includes(c.id)) && !existsSync(join(dir, `${c.id}.jpg`)));
  console.log(`${CARDS.length} cards in the demo world, ${CARDS.length - todo.length} already illustrated or not selected, ${todo.length} to generate.`);
  if (todo.length > MAX_ATTEMPTS) throw new Error(`${todo.length} images would exceed the ${MAX_ATTEMPTS} budget`);
  if (dry) {
    for (const c of todo) console.log(`  would generate ${c.id}`);
    return;
  }
  if (todo.length === 0) return;
  loadKey();

  let attempts = 0;
  let saved = 0;
  let rateLimited = 0;
  let nextStart = 0;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** Reserve the next request slot, spaced START_GAP_MS after the previous one. */
  async function slot() {
    const at = Math.max(Date.now(), nextStart);
    nextStart = at + START_GAP_MS;
    await sleep(at - Date.now());
  }
  const failed: string[] = [];
  const queue = [...todo];

  async function worker() {
    for (let card = queue.shift(); card; card = queue.shift()) {
      const out = join(dir, `${card.id}.jpg`);
      const story = card.paragraphs.join('\n\n');
      let done = false;
      for (let attempt = 1; attempt <= 2 && !done; attempt++) {
        if (attempts >= MAX_ATTEMPTS) break;
        try {
          await slot();
          attempts++;
          const png = await generateStoryImage(story);
          toJpeg(png, out);
          saved++;
          done = true;
          console.log(`  ok   ${card.id} (${Math.round(statSync(out).size / 1024)} KiB)`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes(' 429 ') && rateLimited < MAX_RATE_LIMIT_WAITS) {
            // Throttled, not generated: wait out the minute and give the card this attempt again.
            rateLimited++;
            attempts--;
            attempt--;
            console.log(`  wait ${card.id}: rate limited, retrying in ${RATE_LIMIT_WAIT_MS / 1000} s`);
            await sleep(RATE_LIMIT_WAIT_MS);
            continue;
          }
          console.log(`  fail ${card.id} attempt ${attempt}: ${message.replace(/sk-[\w-]+/g, 'sk-…').slice(0, 200)}`);
        }
      }
      if (!done) failed.push(card.id);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`Saved ${saved} image(s) in ${attempts} attempt(s) (${rateLimited} rate-limit wait(s))${failed.length ? `; failed: ${failed.join(', ')}` : ''}.`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
