/* Optional cloud sync via Firebase Storage.
 *
 * Works are stored, one JSON file each, at  users/{uid}/works/{id}.json
 * (the JSON carries the palette, dates and the image data URLs). Signing in
 * with the same Google account on another device and pulling restores the
 * folio there.
 *
 * Firebase config is supplied either at build time via VITE_FIREBASE_* env
 * vars, or pasted into the in-app Cloud panel at runtime (kept in
 * localStorage) so the app can be wired to a project without a rebuild. */

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth";
import {
  getStorage,
  ref,
  uploadString,
  getBytes,
  listAll,
  deleteObject,
  type FirebaseStorage,
} from "firebase/storage";
import { saveWork, type Work } from "./db";

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  appId: string;
  messagingSenderId?: string;
}

const CONFIG_KEY = "opal-folio:firebaseConfig";

function envConfig(): FirebaseConfig | null {
  const e = import.meta.env;
  if (e.VITE_FIREBASE_API_KEY && e.VITE_FIREBASE_PROJECT_ID) {
    return {
      apiKey: e.VITE_FIREBASE_API_KEY as string,
      authDomain: e.VITE_FIREBASE_AUTH_DOMAIN as string,
      projectId: e.VITE_FIREBASE_PROJECT_ID as string,
      storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET as string,
      appId: e.VITE_FIREBASE_APP_ID as string,
      messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    };
  }
  return null;
}

export function getFirebaseConfig(): FirebaseConfig | null {
  const stored = localStorage.getItem(CONFIG_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as FirebaseConfig;
    } catch {
      /* ignore malformed */
    }
  }
  return envConfig();
}

export function saveFirebaseConfig(cfg: FirebaseConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  // Force re-init on next use.
  app = null;
  authInstance = null;
  storageInstance = null;
}

export function clearFirebaseConfig() {
  localStorage.removeItem(CONFIG_KEY);
  app = null;
  authInstance = null;
  storageInstance = null;
}

export function isConfigured(): boolean {
  return getFirebaseConfig() !== null;
}

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let storageInstance: FirebaseStorage | null = null;

function ensureApp(): FirebaseApp {
  if (app) return app;
  const cfg = getFirebaseConfig();
  if (!cfg) throw new Error("Firebase is not configured.");
  app = initializeApp(cfg);
  return app;
}

export function auth(): Auth {
  if (!authInstance) authInstance = getAuth(ensureApp());
  return authInstance;
}

function storage(): FirebaseStorage {
  if (!storageInstance) storageInstance = getStorage(ensureApp());
  return storageInstance;
}

export function onUserChange(cb: (user: User | null) => void): () => void {
  if (!isConfigured()) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth(), cb);
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth(), provider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth());
}

function workRef(uid: string, id: string) {
  return ref(storage(), `users/${uid}/works/${id}.json`);
}

/** Upload every local work to the signed-in user's cloud folder. */
export async function backupWorks(
  uid: string,
  works: Work[],
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  let done = 0;
  for (const work of works) {
    await uploadString(workRef(uid, work.id), JSON.stringify(work), "raw", {
      contentType: "application/json",
    });
    done++;
    onProgress?.(done, works.length);
  }
  return done;
}

export async function listCloudWorkIds(uid: string): Promise<string[]> {
  const res = await listAll(ref(storage(), `users/${uid}/works`));
  return res.items.map((item) => item.name.replace(/\.json$/, ""));
}

/** Download cloud works into IndexedDB. Returns the number newly restored. */
export async function restoreWorks(
  uid: string,
  existingIds: Set<string>,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const ids = await listCloudWorkIds(uid);
  const missing = ids.filter((id) => !existingIds.has(id));
  let done = 0;
  for (const id of missing) {
    const bytes = await getBytes(workRef(uid, id));
    const text = new TextDecoder().decode(bytes);
    const work = JSON.parse(text) as Work;
    await saveWork(work);
    done++;
    onProgress?.(done, missing.length);
  }
  return done;
}

export async function deleteCloudWork(uid: string, id: string): Promise<void> {
  try {
    await deleteObject(workRef(uid, id));
  } catch {
    /* already gone — ignore */
  }
}

export type { User };
