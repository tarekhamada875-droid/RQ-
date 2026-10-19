import { signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase';

let anonymousSignInPromise: Promise<any> | null = null;

async function waitForCurrentUser(user: any) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (auth.currentUser?.uid === user.uid) return auth.currentUser;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return user;
}

export function signInAnonymouslyOnce() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!anonymousSignInPromise) {
    anonymousSignInPromise = signInAnonymously(auth)
      .then((userCredential) => userCredential.user)
      .then(waitForCurrentUser)
      .finally(() => {
        anonymousSignInPromise = null;
      });
  }
  return anonymousSignInPromise;
}
