// IndexedDB wrapper for Workbench v0.1.
// Stores: skills, traces, bundles, replays. No 'keys' store - OpenRouter key
// lives in sessionStorage only (spec 7.1).
//
// All persistence is browser-local. No server.

import type { SkillBundle, SkillManifest, ReplayReport } from './types';

const DB_NAME = 'workbench-v0';
const DB_VERSION = 1;

type StoreName = 'skills' | 'traces' | 'bundles' | 'replays';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ['skills', 'traces', 'bundles', 'replays'] as StoreName[]) {
        if (!db.objectStoreNames.contains(s)) {
          db.createObjectStore(s, { keyPath: 'id' });
        }
      }
    };
  });
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

// Strip the storage-internal `id` keypath that putX adds via `{ id: <natural-key>, ...row }`.
// The `id` field is not part of any SkillBundle / SkillManifest / ReplayReport schema; leaving
// it on read pollutes the canonical bundle and breaks gate.content_hash on round-tripped bundles.
function stripStorageKey<T extends object>(row: T | undefined): T | undefined {
  if (!row) return row;
  if (!('id' in row)) return row;
  const { id: _id, ...rest } = row as T & { id?: unknown };
  void _id;
  return rest as T;
}

export async function putSkill(manifest: SkillManifest): Promise<void> {
  await tx('skills', 'readwrite', (s) => s.put({ id: manifest.skill_id, ...manifest }));
}

export async function listSkills(): Promise<SkillManifest[]> {
  const all = await tx<SkillManifest[]>('skills', 'readonly', (s) => s.getAll());
  return all.map((m) => stripStorageKey(m)!);
}

export async function getSkill(id: string): Promise<SkillManifest | undefined> {
  const row = await tx<SkillManifest | undefined>('skills', 'readonly', (s) => s.get(id));
  return stripStorageKey(row);
}

export async function putBundle(bundle: SkillBundle): Promise<void> {
  await tx('bundles', 'readwrite', (s) => s.put({ id: bundle.bundle_id, ...bundle }));
}

export async function getBundle(id: string): Promise<SkillBundle | undefined> {
  const row = await tx<SkillBundle | undefined>('bundles', 'readonly', (s) => s.get(id));
  return stripStorageKey(row);
}

export async function listBundles(): Promise<SkillBundle[]> {
  const all = await tx<SkillBundle[]>('bundles', 'readonly', (s) => s.getAll());
  return all.map((b) => stripStorageKey(b)!);
}

export async function putReplay(report: ReplayReport): Promise<void> {
  await tx('replays', 'readwrite', (s) => s.put({ id: report.replay_id, ...report }));
}

export async function listReplaysForSkill(skillId: string): Promise<ReplayReport[]> {
  const all = await tx<ReplayReport[]>('replays', 'readonly', (s) => s.getAll());
  return all.map((r) => stripStorageKey(r)!).filter((r) => r.skill_id === skillId);
}

export async function clearAll(): Promise<void> {
  for (const s of ['skills', 'traces', 'bundles', 'replays'] as StoreName[]) {
    await tx(s, 'readwrite', (store) => store.clear());
  }
}

// sessionStorage key handling - spec 7.1 / 7.5
export const OR_KEY_STORAGE = 'workbench.openrouter_key';

export function setOpenRouterKey(key: string): void {
  sessionStorage.setItem(OR_KEY_STORAGE, key);
}

export function getOpenRouterKey(): string | null {
  return sessionStorage.getItem(OR_KEY_STORAGE);
}

export function clearOpenRouterKey(): void {
  sessionStorage.removeItem(OR_KEY_STORAGE);
}
