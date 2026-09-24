import type { GarageDeletionGarageState, GarageDeletionJobState } from '../domain/garageDeletion';

export type LegacyGarageDeletionRecord = Readonly<Record<string, unknown>>;

export function garageDocumentToDeletionState(document: LegacyGarageDeletionRecord | null): GarageDeletionGarageState {
  return {
    exists: document !== null,
    name: typeof document?.name === 'string' ? document.name : '',
  };
}

export function deletionJobDocumentToState(document: LegacyGarageDeletionRecord | null): GarageDeletionJobState {
  if (!document) return { exists: false };
  return {
    exists: true,
    ...(typeof document.status === 'string' ? { status: document.status } : {}),
  };
}
