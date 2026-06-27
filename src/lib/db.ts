import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface Work {
  id: string;
  createdAt: number;
  /** The finished artwork (stylized cut-out) with the palette band composited
   *  on, shown in the gallery and on cards. Stored as a data URL. */
  compositeDataUrl: string;
  /** The unmodified source photo, shown on the detail page. */
  originalDataUrl: string;
  /** Five extracted palette colors as #RRGGBB strings. */
  palette: string[];
  title?: string;
  /** Locked studies are hidden from the gallery unless Private mode is on. */
  locked?: boolean;
}

interface FolioDB extends DBSchema {
  works: {
    key: string;
    value: Work;
    indexes: { "by-createdAt": number };
  };
}

let dbPromise: Promise<IDBPDatabase<FolioDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<FolioDB>("opal-folio", 1, {
      upgrade(db) {
        const store = db.createObjectStore("works", { keyPath: "id" });
        store.createIndex("by-createdAt", "createdAt");
      },
    });
  }
  return dbPromise;
}

export async function getAllWorks(): Promise<Work[]> {
  const db = await getDB();
  const works = await db.getAllFromIndex("works", "by-createdAt");
  // Newest first.
  return works.reverse();
}

export async function getWork(id: string): Promise<Work | undefined> {
  const db = await getDB();
  return db.get("works", id);
}

export async function saveWork(work: Work): Promise<void> {
  const db = await getDB();
  await db.put("works", work);
}

export async function deleteWork(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("works", id);
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ---- Private mode (whether locked studies are shown) ---- */
const PRIVATE_KEY = "opal-folio:private";

export function getPrivateMode(): boolean {
  return localStorage.getItem(PRIVATE_KEY) === "1";
}

export function setPrivateMode(on: boolean) {
  localStorage.setItem(PRIVATE_KEY, on ? "1" : "0");
}
