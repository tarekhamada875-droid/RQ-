import { performance } from 'node:perf_hooks';
import {
  buildFirestorePage,
  parseFirestorePageRequest
} from '../server/firestorePagination';

const PAGE_SIZE = 50;
const RUNS = 15;
const SIZES = [1_000, 10_000, 100_000];
const SCOPE = 'benchmark:admin-garages';

type FixtureDocument = {
  id: string;
  createdAt: Date;
  data: () => Record<string, unknown>;
};

function buildFixture(count: number): FixtureDocument[] {
  const docs = Array.from({ length: count }, (_, index) => {
    const createdAt = new Date(Date.UTC(2026, 0, 1) - Math.floor(index / 10) * 1_000);
    return {
      id: `garage-${String(index).padStart(7, '0')}`,
      createdAt,
      data: () => ({ createdAt })
    };
  });
  docs.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id));
  return docs;
}

function walkAllPages(docs: FixtureDocument[]) {
  const idToIndex = new Map(docs.map((doc, index) => [doc.id, index]));
  const seen = new Set<string>();
  let cursor: string | undefined;
  let pageCount = 0;
  let modeledDocumentReads = 0;
  let maxQueryResultSize = 0;

  while (true) {
    const request = parseFirestorePageRequest(String(PAGE_SIZE), cursor, SCOPE);
    const start = request.cursor ? (idToIndex.get(request.cursor.documentId) ?? -1) + 1 : 0;
    const queryResult = docs.slice(start, start + PAGE_SIZE + 1);
    modeledDocumentReads += queryResult.length;
    maxQueryResultSize = Math.max(maxQueryResultSize, queryResult.length);
    const page = buildFirestorePage(queryResult, request, 'createdAt');
    pageCount += 1;
    for (const doc of page.documents) {
      if (seen.has(doc.id)) throw new Error(`Duplicate document at page boundary: ${doc.id}`);
      seen.add(doc.id);
    }
    if (!page.hasMore) break;
    cursor = page.nextCursor ?? undefined;
  }

  if (seen.size !== docs.length) throw new Error(`Pagination skipped documents: expected ${docs.length}, got ${seen.size}`);
  return { pageCount, modeledDocumentReads, maxQueryResultSize };
}

function percentile(sortedValues: number[], fraction: number) {
  return sortedValues[Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * fraction) - 1)];
}

const results = SIZES.map((count) => {
  const fixture = buildFixture(count);
  const elapsedMs: number[] = [];
  let result = { pageCount: 0, modeledDocumentReads: 0, maxQueryResultSize: 0 };
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    result = walkAllPages(fixture);
    elapsedMs.push(performance.now() - started);
  }
  elapsedMs.sort((left, right) => left - right);
  return {
    documents: count,
    pageSize: PAGE_SIZE,
    runs: RUNS,
    pagesPerFullWalk: result.pageCount,
    modeledDocumentReadsPerFullWalk: result.modeledDocumentReads,
    maxDocumentsReturnedByAnySingleQuery: result.maxQueryResultSize,
    localCursorWalkP50Ms: Number(percentile(elapsedMs, 0.5).toFixed(3)),
    localCursorWalkP95Ms: Number(percentile(elapsedMs, 0.95).toFixed(3))
  };
});

console.log(JSON.stringify({
  benchmark: 'Synthetic Worker list pagination at 1k/10k/100k documents',
  node: process.version,
  note: 'The benchmark walks a pre-sorted in-memory fixture using the production cursor parser/encoder and page builder. Document reads are modeled as rows returned by each page query, including the one-row sentinel. This does not exercise live Firestore indexes, billing, Cloudflare Worker CPU/memory, or network latency.',
  results
}, null, 2));
