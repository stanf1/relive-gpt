import type { Activity } from './gpx';

let connection: Promise<IDBDatabase> | undefined;
function openDb(): Promise<IDBDatabase> {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('trailogue', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('activities', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('資料庫被其他分頁佔用，請關閉其他分頁後重試。'));
    }).catch((error) => { connection = undefined; throw error; });
  }
  return connection;
}

export async function loadActivities(): Promise<Activity[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activities', 'readonly');
    const request = tx.objectStore('activities').getAll();
    tx.oncomplete = () => resolve((request.result as Activity[]).sort((a, b) => b.importedAt - a.importedAt));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveActivity(activity: Activity): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activities', 'readwrite');
    tx.objectStore('activities').put(activity);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function deleteActivity(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activities', 'readwrite');
    tx.objectStore('activities').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
