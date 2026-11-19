import { signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase';
import { debugRecorder } from '../debug/debugRecorder';

let anonymousSignInPromise: Promise<any> | null = null;

async function waitForCurrentUser(user: any) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (auth.currentUser?.uid === user.uid) return auth.currentUser;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return user;
}

/**
 * Anonymous sign-in, single-flighted + instrumented for the debug recorder.
 *
 * AUDIT EXTENSION (2026-11-19, owner login-hang investigation): the previous
 * implementation called `signInAnonymously(auth)` with no instrumentation and
 * no error visibility. A hung Firebase Auth call (slow first-paint after a
 * cold deploy, network-blackhole to securetoken.googleapis.com) produced a
 * debug file with zero events past boot — no signal that the call had even
 * started. The wrapper below emits begin / success / error events so the next
 * hung-login debug file shows exactly which call is not resolving.
 *
 * Behavior is otherwise identical: single-flight, .finally clears the promise
 * slot, no new timeouts or retries. PR 2 will add the actual fix (Promise.race
 * timeout that rejects on hang); PR 1 is observation-only.
 */
export function signInAnonymouslyOnce() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!anonymousSignInPromise) {
    debugRecorder.authEvent('signin_anon_begin');
    const startMs = Date.now();
    anonymousSignInPromise = signInAnonymously(auth)
      .then((userCredential) => userCredential.user)
      .then(waitForCurrentUser)
      .then((user) => {
        debugRecorder.authEvent('signin_anon_success', {
          uid: user?.uid || null,
          isAnonymous: user?.isAnonymous ?? null,
          ms: Date.now() - startMs,
        });
        return user;
      })
      .catch((err) => {
        debugRecorder.authEvent('signin_anon_error', {
          ms: Date.now() - startMs,
          code: err?.code || null,
          msg: String(err?.message || '').slice(0, 200),
        });
        throw err;
      })
      .finally(() => {
        anonymousSignInPromise = null;
      });
  }
  return anonymousSignInPromise;
}
