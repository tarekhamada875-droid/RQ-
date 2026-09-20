import { getAuth, type Auth } from 'firebase-admin/auth';
import type { App } from 'firebase-admin/app';
import type { V2TokenClaims } from '../http/auth.js';

export type V2FirebaseAuth = Readonly<{
  auth: Auth;
  verifyIdToken: (token: string) => Promise<V2TokenClaims>;
}>;

export function createV2FirebaseAuth(app: App): V2FirebaseAuth {
  const auth = getAuth(app);
  return {
    auth,
    verifyIdToken: async (token) => {
      const decoded = await auth.verifyIdToken(token);
      return { uid: decoded.uid };
    }
  };
}
