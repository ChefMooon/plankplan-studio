import type { Project } from '@/lib/planner/model';

type Entry = { key: string; fingerprint: string; image: string };
let queue: Promise<void> = Promise.resolve();
const pending = new Map<string, Promise<string | undefined>>();

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('plankplan-studio.preview-cache', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Preview cache is blocked'));
  });
}

async function read(key: string): Promise<Entry | undefined> {
  const db = await openCache();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('snapshots').objectStore('snapshots').get(key);
      request.onsuccess = () => resolve(request.result as Entry | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

async function write(entry: Entry): Promise<void> {
  const db = await openCache();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export function snapshotFingerprint(project: Project, aspect = 600 / 264): string {
  return JSON.stringify([4, project.previewView ?? 'auto', aspect, project.design]);
}

export function getModelSnapshot(project: Project, aspect = 600 / 264): Promise<string | undefined> {
  const fingerprint = snapshotFingerprint(project, aspect);
  const key = `${project.id}:${project.previewView ?? 'auto'}`;
  const pendingKey = `${key}:${fingerprint}`;
  const existing = pending.get(pendingKey);
  if (existing) return existing;
  const job = queue.then(async () => {
    const entry = await read(key).catch(() => undefined);
    if (entry?.fingerprint === fingerprint) return entry.image;
    const { renderModelSnapshot } = await import('./model-snapshot');
    const image = renderModelSnapshot(project, aspect);
    if (image) await write({ key, fingerprint, image }).catch(() => undefined);
    return image;
  }).catch(() => undefined);
  queue = job.then(() => undefined);
  pending.set(pendingKey, job);
  void job.finally(() => pending.delete(pendingKey));
  return job;
}
