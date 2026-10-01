import { BulkWriter, FieldPath, FieldValue, GrpcStatus, type Firestore } from 'firebase-admin/firestore';
import { storedSummary, summarize, type StorySummary } from './summary';

/**
 * Give published cards the list summary publishing now stores (./summary):
 * those published before it existed, and those whose story was written since
 * by something that doesn't restate it (the web editor applying an edit from
 * the browser). Run by scripts/backfill-card-summaries.ts; until it has run,
 * lists read those cards' stories instead, so it is safe to run any time and
 * again later.
 *
 * Each write is conditional on the card being unchanged since it was read (a
 * story edited in between is left for the next run: its summary would be the
 * old story's), and writes only the summary — `excerptAt` is the write's own
 * server time, later than the card's `updatedAt`, so it counts as current.
 */

export interface SummaryBackfillOptions {
  /** Actually write; without it nothing changes (a dry run). */
  write?: boolean;
  /** Restate every published card's summary, even a current one (after changing how summaries are made). */
  all?: boolean;
  /** Cards read per query page. */
  pageSize?: number;
  log?: (line: string) => void;
}

export interface SummaryBackfillReport {
  /** Card documents read. */
  scanned: number;
  /** Of those, published. */
  published: number;
  /** Published cards whose stored summary is current (left alone). */
  current: number;
  /** Published cards that need one (missing, behind their story, or `all`). */
  due: number;
  /** Summaries written (0 on a dry run). */
  written: number;
  /** Writes refused because the card changed after it was read; the next run picks them up. */
  changed: number;
  /** Writes that failed otherwise. */
  failed: number;
  /** The first due card ids, for a dry run's report. */
  sample: string[];
}

const same = (a: StorySummary, b: StorySummary) => a.excerpt === b.excerpt && a.readMinutes === b.readMinutes;

export async function backfillCardSummaries(db: Firestore, opts: SummaryBackfillOptions = {}): Promise<SummaryBackfillReport> {
  const { write = false, all = false, pageSize = 300, log = () => {} } = opts;
  const report: SummaryBackfillReport = { scanned: 0, published: 0, current: 0, due: 0, written: 0, changed: 0, failed: 0, sample: [] };
  const writer: BulkWriter | null = write ? db.bulkWriter() : null;
  // A card changed since it was read fails its precondition: never retried (the next run re-reads it).
  writer?.onWriteError((e) => e.code !== GrpcStatus.FAILED_PRECONDITION && e.failedAttempts < 3);
  const writes: Promise<void>[] = [];

  let last: string | null = null;
  for (;;) {
    let q = db
      .collection('cards')
      .orderBy(FieldPath.documentId())
      .select('story', 'publishedAt', 'updatedAt', 'excerpt', 'readMinutes', 'excerptAt')
      .limit(pageSize);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    if (page.empty) break;
    last = page.docs[page.docs.length - 1].id;
    report.scanned += page.size;

    for (const d of page.docs) {
      const data = d.data();
      if (data.publishedAt == null) continue;
      report.published++;
      const summary = summarize(data.story);
      const stored = storedSummary(data);
      if (!all && stored && same(stored, summary)) {
        report.current++;
        continue;
      }
      report.due++;
      if (report.sample.length < 20) report.sample.push(d.id);
      if (!writer) continue;
      writes.push(
        writer
          .update(d.ref, { ...summary, excerptAt: FieldValue.serverTimestamp() }, { lastUpdateTime: d.updateTime })
          .then(
            () => void report.written++,
            (e: { code?: number }) => {
              if (e.code === GrpcStatus.FAILED_PRECONDITION) report.changed++;
              else report.failed++;
            },
          ),
      );
    }
    log(`… ${report.scanned} read, ${report.due} due`);
    if (page.size < pageSize) break;
  }

  if (writer) {
    await writer.close();
    await Promise.all(writes);
  }
  return report;
}
