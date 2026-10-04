/**
 * Read-only data check for what the old firestore.rules let a client write
 * and the current ones refuse: forged publish dates, copied slugs, duplicate
 * or mismatched pen names, self-granted badges, card links pointing at the
 * wrong author, bells pinned to the future — and content past the limits the
 * rules now hold writes to (an older card past them can't be edited through
 * those fields until trimmed), and cards (or pending edits) anonymous and for
 * connections only, which nothing may make a card now. It changes nothing —
 * it lists what to look at, and each finding says what fixing it means.
 *
 *   npx tsx scripts/integrity.ts               production (credentials from .env)
 *   npx tsx scripts/integrity.ts --emulator    the local emulators
 *
 * Prints ids and counts only, never anyone's writing.
 */
import 'dotenv/config';
import { emulatorEnv, EMULATOR_PROJECT_ID } from './emulator-env.mjs';
import { formerPublicBases, publicBases, storageKeyOf } from '../src/lib/storage/publicUrl';
import { anonymousForConnections, editedAudience } from '../src/lib/db/firestore/cardContent';

const useEmulator = process.argv.includes('--emulator');
/** A publish date or bell this far ahead of now can only have been written by hand. */
const FUTURE_SLACK_MS = 60 * 60 * 1000;

interface Finding {
  check: string;
  fix: string;
  ids: string[];
}

async function main() {
  if (useEmulator) Object.assign(process.env, emulatorEnv);
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');

  const projectId = useEmulator ? EMULATOR_PROJECT_ID : process.env.FIREBASE_PROJECT_ID;
  const app = useEmulator
    ? initializeApp({ projectId }, 'integrity')
    : initializeApp(
        {
          projectId,
          credential: cert({
            projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        },
        'integrity',
      );
  const db = getFirestore(app);
  const now = Date.now();
  const findings: Finding[] = [];
  const add = (check: string, fix: string, ids: string[]) => findings.push({ check, fix, ids });

  // --- cards ---
  const cards = await db
    .collection('cards')
    .select('authorId', 'slug', 'publishedAt', 'anonymous', 'visibility', 'referenceCardId', 'readCount', 'resonanceCount', 'thoughtCore', 'story', 'tags', 'media')
    .get();
  const card = new Map(cards.docs.map((d) => [d.id, d]));
  const badDate: string[] = [];
  const futureDate: string[] = [];
  const noAnonymous: string[] = [];
  const oddId: string[] = [];
  const pastLimits: string[] = [];
  const foreignCover: string[] = [];
  const ownedKeyAnonymous: string[] = [];
  const coverOnFormerHost: string[] = [];
  const anonymousConnections: string[] = [];
  // Our storage: R2_PUBLIC_BASE, and the hosts it was served from before (R2_FORMER_PUBLIC_BASES).
  const storageBases = publicBases();
  const formerBases = formerPublicBases();
  let longestStory = 0;
  const bySlug = new Map<string, string[]>();
  for (const d of cards.docs) {
    // The rules' validCardContent (and lib/db/firestore/cardContent): lengths in UTF-16 units.
    const story = String(d.get('story') ?? '');
    const tags = d.get('tags');
    const media = d.get('media') as { url?: unknown; label?: unknown } | undefined;
    longestStory = Math.max(longestStory, story.length);
    const over = [
      String(d.get('thoughtCore') ?? '').length > 200 && 'title',
      story.length > 200_000 && 'story',
      Array.isArray(tags) && (tags.length > 30 || tags.join(' ').length > 1000) && 'tags',
      typeof media?.label === 'string' && media.label.length > 200 && 'cover label',
    ].filter(Boolean);
    if (over.length) pastLimits.push(`${d.id} (${over.join(', ')})`);
    const cover = typeof media?.url === 'string' ? media.url : null;
    const coverKey = cover && storageKeyOf(cover, storageBases);
    if (storageBases.length && cover && !coverKey) foreignCover.push(d.id);
    if (cover && coverKey && storageKeyOf(cover, formerBases)) coverOnFormerHost.push(d.id);
    // An owner-named key in an anonymous card's cover (scripts/backfill.ts rekey-images covers its story's pictures too).
    if (d.get('anonymous') === true && coverKey && /^(image|video)\/[^/]+\/\d{4}-\d{2}\/[^/]+$/.test(coverKey)) ownedKeyAnonymous.push(d.id);
    const at = d.get('publishedAt');
    if (at != null && !(at instanceof Timestamp)) badDate.push(d.id);
    else if (at instanceof Timestamp && at.toMillis() > now + FUTURE_SLACK_MS) futureDate.push(d.id);
    if (typeof d.get('anonymous') !== 'boolean') noAnonymous.push(d.id);
    if (anonymousForConnections(d.data())) anonymousConnections.push(d.id);
    if (!/^[A-Za-z0-9]{20}$/.test(d.id)) oddId.push(d.id);
    const slug = d.get('slug');
    if (typeof slug === 'string' && slug) bySlug.set(slug, [...(bySlug.get(slug) ?? []), d.id]);
  }
  add('cards: publishedAt is not a timestamp', 'set it from createdAt, or back to null (a draft)', badDate);
  add('cards: publishedAt in the future (pinned to the top of the feed)', 'set it from createdAt', futureDate);
  add('cards: slug shared with another card', 'the earliest published keeps it; re-publishing the others through v1 gives them a fresh one',
    [...bySlug.entries()].filter(([, ids]) => ids.length > 1).map(([slug, ids]) => `${slug}: ${ids.join(', ')}`));
  add('cards: no boolean `anonymous` field', "backfill anonymous: false before any query filters on it", noAnonymous);
  add('cards: hand-picked document id (not a 20-character auto id)', 'check it is not squatting another card\'s slug', oddId);
  add('cards: past the limits the rules hold writes to', 'trim the field (its author cannot save it as it is)', pastLimits);
  add('cards: a cover not on our storage (R2_PUBLIC_BASE, or a former base)', 'look at it: a picture elsewhere is fetched by every reader', foreignCover);
  add('cards: a cover still on a former storage host (R2_FORMER_PUBLIC_BASES)', 'npx tsx scripts/backfill.ts rehost-images --apply', coverOnFormerHost);
  add("cards: anonymous, with a cover whose key names its author", 'npx tsx scripts/backfill.ts rekey-images --apply', ownedKeyAnonymous);
  // No card becomes one now (the rules, publish, PATCH, an applied edit); these are from before, and are left as they are.
  add('cards: anonymous and for connections only (a block would show who wrote it)',
    'ask its author to make it public or private, or to take the byline back; never change it for them', anonymousConnections);

  // --- pending edits ---
  // What applying each would leave its card as (editedAudience, as lib/api/v1/edits applies it); applying one so is refused.
  const edits = await db.collectionGroup('edits').select('visibility', 'anonymous').get();
  const editsAnonymousConnections = edits.docs.flatMap((d) => {
    const owner = card.get(d.ref.parent.parent?.id ?? '');
    if (!owner || !anonymousForConnections(editedAudience(d.data(), owner.data()))) return [];
    return [anonymousForConnections(owner.data()) ? `${d.ref.path} (its card already is: it applies)` : `${d.ref.path} (applying it is refused)`];
  });
  add('pending edits: would leave their card anonymous and for connections only',
    'its author picks public or private in the editor before saving; never change it for them', editsAnonymousConnections);
  console.log(`(the longest story: ${longestStory} UTF-16 units; the rules take 200000)`);

  // --- users ---
  const [users, handles] = await Promise.all([
    db.collection('users').select('handle', 'handleLower', 'verified', 'joinedAt', 'avatarUrl').get(),
    db.collection('handles').get(),
  ]);
  const reservedFor = new Map(handles.docs.map((d) => [d.id, d.get('uid')]));
  const unreserved: string[] = [];
  const byHandle = new Map<string, { id: string; joined: number }[]>();
  const mismatched: string[] = [];
  const verified: string[] = [];
  const avatarOnFormerHost: string[] = [];
  for (const d of users.docs) {
    const handle = String(d.get('handle') ?? '');
    const lower = String(d.get('handleLower') ?? '');
    if (lower !== handle.toLowerCase() || handle !== handle.trim()) mismatched.push(`${d.id} (${JSON.stringify(handle)})`);
    const joined = d.get('joinedAt');
    byHandle.set(lower, [...(byHandle.get(lower) ?? []), { id: d.id, joined: joined instanceof Timestamp ? joined.toMillis() : 0 }]);
    if (d.get('verified') === true) verified.push(d.id);
    if (lower && reservedFor.get(lower) !== d.id) unreserved.push(`${d.id} (${JSON.stringify(lower)})`);
    if (typeof d.get('avatarUrl') === 'string' && storageKeyOf(d.get('avatarUrl'), formerBases)) avatarOnFormerHost.push(d.id);
  }
  add('users: pen name taken by more than one account', 'the earliest joinedAt keeps it; ask the others to choose again',
    [...byHandle.entries()]
      .filter(([h, list]) => h && list.length > 1)
      .map(([h, list]) => `${h}: ${list.sort((a, b) => a.joined - b.joined).map((u) => u.id).join(', ')}`));
  add('users: handleLower does not match the pen name', 'rewrite handleLower (and trim the handle) through the server', mismatched);
  add('users: verified badge set', 'confirm each one was granted on purpose; the client could set it before', verified);
  add('users: pen name without its reservation (handles/{name})', 'npx tsx scripts/backfill.ts handles (duplicates first)', unreserved);
  add('users: a profile photo still on a former storage host (R2_FORMER_PUBLIC_BASES)', 'npx tsx scripts/backfill.ts rehost-images --apply', avatarOnFormerHost);

  // --- card links ---
  const links = await db.collection('cardLinks').get();
  const wrongTarget: string[] = [];
  const anonymousEnd: string[] = [];
  for (const d of links.docs) {
    const target = card.get(String(d.get('targetCardId') ?? ''));
    const source = card.get(String(d.get('sourceCardId') ?? ''));
    if (target && target.get('authorId') !== d.get('targetAuthorId')) wrongTarget.push(d.id);
    if (d.get('sourceAuthorId') && source && source.get('authorId') !== d.get('sourceAuthorId')) wrongTarget.push(d.id);
    if (target?.get('anonymous') === true || source?.get('anonymous') === true) anonymousEnd.push(d.id);
  }
  add('cardLinks: author does not match the card (injected into someone\'s profile)', 'delete the link', [...new Set(wrongTarget)]);
  add('cardLinks: to or from an anonymous card (names its author publicly)', 'delete the link', anonymousEnd);

  // --- notifications ---
  const future = await db.collection('notifications').where('createdAt', '>', Timestamp.fromMillis(now + FUTURE_SLACK_MS)).get();
  add('notifications: createdAt in the future (pinned to the top of a bell)', 'delete the row', future.docs.map((d) => d.id));
  // For a day (5998ec4 → 90d9728) the browser rang a "like" with the very row a
  // resonance rings — only the date tells them apart, and when 90d9728 went
  // live is recorded nowhere. A reader who liked a card then and has answered
  // it since counts as having rung its author: their answer rang no one and
  // connected no one (lib/api/v1/resonate.ts legacyBell).
  const likeDays = await db
    .collection('notifications')
    .where('createdAt', '>=', Timestamp.fromDate(new Date('2026-06-04T00:00:00+08:00')))
    .where('createdAt', '<', Timestamp.fromDate(new Date('2026-06-06T00:00:00+08:00')))
    .select('type', 'payload.fromUserId', 'payload.cardId')
    .get();
  const answers = new Set(cards.docs.filter((d) => typeof d.get('referenceCardId') === 'string').map((d) => `${d.get('authorId')}>${d.get('referenceCardId')}`));
  add("notifications: a resonance bell from the day likes rang the same row, its reader having answered that card since (their answer reached no one)",
    'look at each: if it was a like, their answer never rang the author — deleting the row lets it ring (and connect) the next time it reaches out: made public again, or picked again',
    likeDays.docs
      .filter((d) => d.get('type') === 'resonance' && answers.has(`${d.get('payload.fromUserId')}>${d.get('payload.cardId')}`))
      .map((d) => d.id));

  console.log(`${projectId}: ${cards.size} cards, ${users.size} users, ${links.size} card links\n`);
  for (const f of findings) {
    console.log(`${f.ids.length ? '✗' : '✓'} ${f.check}: ${f.ids.length}`);
    if (!f.ids.length) continue;
    console.log(`    fix: ${f.fix}`);
    for (const id of f.ids.slice(0, 20)) console.log(`    ${id}`);
    if (f.ids.length > 20) console.log(`    … and ${f.ids.length - 20} more`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
