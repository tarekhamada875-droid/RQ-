import { z } from 'zod';

export type DocumentSnapshotLike = Readonly<{
  id: string;
  exists: boolean;
  data(): unknown;
}>;

export type TypedDocumentConverter<T> = Readonly<{
  fromSnapshot(snapshot: DocumentSnapshotLike): T;
  toDocument(value: T): Record<string, unknown>;
}>;

export function createTypedConverter<T>(schema: z.ZodType<T>): TypedDocumentConverter<T> {
  return {
    fromSnapshot(snapshot) {
      if (!snapshot.exists) throw new Error('DOCUMENT_NOT_FOUND');
      return schema.parse(snapshot.data());
    },
    toDocument(value) {
      const parsed = schema.parse(value);
      const document = parsed as unknown;
      if (typeof document !== 'object' || document === null || Array.isArray(document)) {
        throw new Error('DOCUMENT_MUST_BE_AN_OBJECT');
      }
      return { ...(document as Record<string, unknown>) };
    }
  };
}
