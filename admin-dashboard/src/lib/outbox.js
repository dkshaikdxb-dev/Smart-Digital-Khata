// Tiny dependency-free offline outbox backed by IndexedDB. Khata writes made
// while offline / on flaky 2G are queued here with a stable client_request_id
// and replayed when connectivity returns; the backend dedupes replays on that
// id so nothing is applied twice.
//
// Each record: { id, url, method, body, client_request_id, kind, label, created_at }.

const DB_NAME = 'skhata-outbox';
const STORE = 'outbox';
export const OUTBOX_EVENT = 'skhata-outbox';

// crypto.randomUUID with a plain fallback for older in-app WebViews.
export function newClientRequestId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) { /* fall through */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function asPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function emitChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OUTBOX_EVENT));
}

// Queue a write. Generates a client_request_id (if the body doesn't already
// carry one) and merges it into the body so the replayed request is byte-for-
// byte the same one the server may have already partially seen.
export async function enqueue({ url, method = 'POST', body = {}, kind, label }) {
  const client_request_id = body.client_request_id || newClientRequestId();
  const record = {
    url,
    method,
    body: { ...body, client_request_id },
    client_request_id,
    kind: kind || null,
    label: label || null,
    created_at: Date.now(),
  };
  const db = await openDb();
  const id = await asPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).add(record));
  db.close();
  emitChange();
  return { id, ...record };
}

export async function listOutbox() {
  const db = await openDb();
  const all = await asPromise(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
  db.close();
  return (all || []).sort((a, b) => a.id - b.id);
}

export async function countOutbox() {
  const db = await openDb();
  const n = await asPromise(db.transaction(STORE, 'readonly').objectStore(STORE).count());
  db.close();
  return n;
}

export async function removeOutbox(id) {
  const db = await openDb();
  await asPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
  db.close();
  emitChange();
}

// Replay queued writes oldest-first using the app's authenticated POST helper
// `apiPost(url, body)`.
//  - success            → remove the record
//  - 4xx (permanent)    → remove it and count it failed, so a bad entry can't
//                         wedge the queue forever
//  - network / 5xx      → stop and leave the rest queued for the next attempt
// Returns a summary { sent, failed, remaining }.
export async function flushOutbox(apiPost) {
  const items = await listOutbox();
  let sent = 0;
  let failed = 0;
  for (const rec of items) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await apiPost(rec.url, rec.body);
      // eslint-disable-next-line no-await-in-loop
      await removeOutbox(rec.id);
      sent += 1;
    } catch (err) {
      const status = err && typeof err.status === 'number' ? err.status : 0;
      if (status >= 400 && status < 500) {
        // eslint-disable-next-line no-await-in-loop
        await removeOutbox(rec.id);
        failed += 1;
      } else {
        break;
      }
    }
  }
  const remaining = await countOutbox();
  return { sent, failed, remaining };
}
