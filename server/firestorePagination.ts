export const DEFAULT_FIRESTORE_PAGE_SIZE = 50;
export const MAX_FIRESTORE_PAGE_SIZE = 100;
const CURSOR_TTL_MS = 30 * 60 * 1000;
const MAX_CURSOR_LENGTH = 4096;

type CursorScalar =
  | { kind: 'timestamp'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' };

export interface FirestorePageCursor {
  orderValue: unknown;
  documentId: string;
}

export interface FirestorePageRequest {
  pageSize: number;
  cursor: FirestorePageCursor | null;
  scope: string;
}

function toCursorScalar(value: unknown): CursorScalar {
  if (value === null || value === undefined) return { kind: 'null' };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('INVALID_PAGE_CURSOR');
    return { kind: 'timestamp', value: value.toISOString() };
  }
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('INVALID_PAGE_CURSOR');
    return { kind: 'timestamp', value: date.toISOString() };
  }
  if (typeof value === 'string') return { kind: 'string', value };
  if (typeof value === 'number' && Number.isFinite(value)) return { kind: 'number', value };
  if (typeof value === 'boolean') return { kind: 'boolean', value };
  throw new Error('INVALID_PAGE_CURSOR');
}

function fromCursorScalar(value: unknown): unknown {
  if (!value || typeof value !== 'object') throw new Error('INVALID_PAGE_CURSOR');
  const scalar = value as Partial<CursorScalar>;
  switch (scalar.kind) {
    case 'timestamp': {
      if (typeof scalar.value !== 'string') throw new Error('INVALID_PAGE_CURSOR');
      const date = new Date(scalar.value);
      if (Number.isNaN(date.getTime())) throw new Error('INVALID_PAGE_CURSOR');
      return date;
    }
    case 'string':
      if (typeof scalar.value !== 'string') throw new Error('INVALID_PAGE_CURSOR');
      return scalar.value;
    case 'number':
      if (typeof scalar.value !== 'number' || !Number.isFinite(scalar.value)) throw new Error('INVALID_PAGE_CURSOR');
      return scalar.value;
    case 'boolean':
      if (typeof scalar.value !== 'boolean') throw new Error('INVALID_PAGE_CURSOR');
      return scalar.value;
    case 'null':
      return null;
    default:
      throw new Error('INVALID_PAGE_CURSOR');
  }
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function parseFirestorePageRequest(
  pageSizeValue: string | undefined,
  cursorValue: string | undefined,
  scope: string,
  now = Date.now()
): FirestorePageRequest {
  let pageSize = DEFAULT_FIRESTORE_PAGE_SIZE;
  if (pageSizeValue !== undefined) {
    if (!/^\d+$/.test(pageSizeValue)) throw new Error('INVALID_PAGE_SIZE');
    const parsed = Number(pageSizeValue);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error('INVALID_PAGE_SIZE');
    pageSize = Math.min(parsed, MAX_FIRESTORE_PAGE_SIZE);
  }

  let cursor: FirestorePageCursor | null = null;
  if (cursorValue !== undefined && cursorValue !== '') {
    if (cursorValue.length > MAX_CURSOR_LENGTH) throw new Error('INVALID_PAGE_CURSOR');
    try {
      const parsed = JSON.parse(decodeBase64Url(cursorValue)) as Record<string, unknown>;
      if (parsed.version !== 1 || parsed.scope !== scope || typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now ||
          typeof parsed.documentId !== 'string' || parsed.documentId.length < 1 || parsed.documentId.length > 512) {
        throw new Error('INVALID_PAGE_CURSOR');
      }
      cursor = { orderValue: fromCursorScalar(parsed.orderValue), documentId: parsed.documentId };
    } catch {
      throw new Error('INVALID_PAGE_CURSOR');
    }
  }

  return { pageSize, cursor, scope };
}

export function encodeFirestorePageCursor(
  scope: string,
  orderValue: unknown,
  documentId: string,
  now = Date.now()
): string {
  if (!documentId || documentId.length > 512) throw new Error('INVALID_PAGE_CURSOR');
  return encodeBase64Url(JSON.stringify({
    version: 1,
    scope,
    expiresAt: now + CURSOR_TTL_MS,
    orderValue: toCursorScalar(orderValue),
    documentId
  }));
}

export function buildFirestorePage<T extends { id: string; data: () => Record<string, unknown> | undefined }>(
  documents: T[],
  request: FirestorePageRequest,
  orderField: string
): { documents: T[]; hasMore: boolean; nextCursor: string | null } {
  const hasMore = documents.length > request.pageSize;
  const pageDocuments = documents.slice(0, request.pageSize);
  const lastDocument = pageDocuments[pageDocuments.length - 1];
  const nextCursor = hasMore && lastDocument
    ? encodeFirestorePageCursor(request.scope, orderField === '__name__' ? lastDocument.id : lastDocument.data()?.[orderField], lastDocument.id)
    : null;
  return { documents: pageDocuments, hasMore, nextCursor };
}

export function firestorePageStartAfter(query: any, collection: any, cursor: FirestorePageCursor | null, orderField = 'createdAt'): any {
  if (!cursor) return query;
  return orderField === '__name__'
    ? query.startAfter(collection.doc(cursor.documentId))
    : query.startAfter(cursor.orderValue, collection.doc(cursor.documentId));
}
