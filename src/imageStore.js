// Media store — IndexedDB-backed blob storage for the picture round: each
// slot's picture plus its answer images (a face mash's two source photos, or
// any other "here's the answer" image). Ported from
// barstool-trivia-scaffold's imageStore.js, trimmed to images only.
//
// Everything lives in ONE object store (`images`, keyed by id). That's
// deliberate: adding a second store would need a DB_VERSION bump, and a
// version change makes every open connection close — a display window still
// running the previous build would then fail to reopen (VersionError) and
// lose every picture mid-show. The record's `kind` ('picture' / 'answer' /
// 'mash' / 'source' / 'image') is informational only.
//
// Why not localStorage: the picture buffer used to hold ten JPEG data URLs
// in localStorage (~5MB quota). Answer images triple that, and a face mash
// is three photos per slot. IndexedDB holds Blobs natively with a far larger
// quota. The paste buffer itself stays in localStorage
// (`jxnfilmclub-trivia.pictures`) and references images by id
// (`imageId`, `answerImageAId`, `answerImageBId` — see referencedPictureIds
// in pictures.js). Old buffers that still carry `dataUrl`s are migrated by
// the control window (see migratePastes in pictures.js).
//
// Both windows are the same origin, so the display reads the same database
// the control window writes. Writers call notifyImagesChanged(ids) after a
// change; it fires an `images:update` broadcast for the other window AND a
// local event for this one (a BroadcastChannel never delivers to the window
// that posted). useImageUrl() listens to both, so callers rarely touch it.
//
// IndexedDB can be missing or refuse to open (Safari private browsing,
// Firefox with storage disabled, blocked site data). Every async function
// here rejects with an ImageStoreUnavailableError in that case, and
// useImageUrl reports status 'unavailable' — the display renders a
// placeholder and never crashes; the control window shows a warning and
// falls back to the old data-URL-in-localStorage behaviour for pictures.
//
// Deck bundles carry images inline: exportImages(ids) → { images: { [id]:
// { dataUrl, kind, width, height } }, missing }, importImages(map) writes
// them back under the same ids, so a re-imported bundle's slots resolve
// without rewriting.

import { useCallback, useEffect, useState } from 'react';
import { broadcast, useBroadcast } from './broadcast.js';

// Same-origin decks (e.g. siblings on one GitLab Pages host) share IndexedDB
// exactly like they share localStorage, so the name is namespaced per deck.
const DB_NAME = 'jxnfilmclub-trivia';
// Don't bump without a real schema change — see the header comment. If a
// bump is ever needed, onupgradeneeded must only ADD stores/indexes (never
// delete `images`), so existing decks keep their media.
const DB_VERSION = 1;
const STORE = 'images';

// Long-edge caps per image kind. Slot pictures (and face-mash composites)
// fill most of a 1920×1080 slide; answer images (and face-mash source
// photos) sit in thirds on the answer slide.
export const INGEST_PRESETS = {
  picture: { maxEdge: 1600, quality: 0.85 },
  mash: { maxEdge: 1600, quality: 0.85 },
  answer: { maxEdge: 1000, quality: 0.85 },
  source: { maxEdge: 1000, quality: 0.85 },
};
const DEFAULT_PRESET = INGEST_PRESETS.picture;

export class ImageStoreUnavailableError extends Error {
  constructor(cause) {
    super('Image storage (IndexedDB) is unavailable in this browser — answer images and Face Mash slots can’t be saved or shown. Private browsing or blocked site data are the usual causes.');
    this.name = 'ImageStoreUnavailableError';
    this.cause = cause;
  }
}

// ---- Connection -------------------------------------------------------------
// One memoized open per window. A failed open is remembered too, so a missing
// IndexedDB doesn't retry (and re-warn) on every image.

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) {
        throw new Error('indexedDB is not defined');
      }
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(new ImageStoreUnavailableError(err));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading the schema asks us to let go; drop the
      // connection and reopen lazily next time.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(new ImageStoreUnavailableError(req.error));
    req.onblocked = () => reject(new ImageStoreUnavailableError(new Error('open blocked')));
  });
  return dbPromise;
}

// Resolves true/false; never rejects. For the control window's warning line.
export async function isImageStoreAvailable() {
  try {
    await openDb();
    return true;
  } catch {
    return false;
  }
}

// Run one request inside a transaction and resolve with its result once the
// transaction commits (so a resolved put is durable, and quota errors that
// surface at commit time still reject).
async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE, mode);
    } catch (err) {
      reject(err);
      return;
    }
    let result;
    let req;
    try {
      req = fn(tx.objectStore(STORE));
    } catch (err) {
      // e.g. DataCloneError from put — reject instead of hanging forever.
      try { tx.abort(); } catch { /* already finished */ }
      reject(friendlyError(err));
      return;
    }
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(friendlyError(tx.error || req?.error));
    tx.onerror = () => {}; // onabort follows with the same error
  });
}

function friendlyError(err) {
  if (err && err.name === 'QuotaExceededError') {
    const e = new Error('Image storage is full — clear unused picture slots, or free up browser storage, then try again.');
    e.name = 'QuotaExceededError';
    return e;
  }
  return err || new Error('Image storage request failed.');
}

// ---- Ids --------------------------------------------------------------------
// crypto.randomUUID needs a secure context (https or localhost); a deck served
// over plain http on a LAN IP doesn't have one, so fall back. The prefix is
// cosmetic (records carry `kind`); it just makes a bundle readable.
function newMediaId(prefix) {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // fall through
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
}
export const newImageId = () => newMediaId('img');

// ---- CRUD -------------------------------------------------------------------
// Record shape: { id, blob, type, width, height, kind, createdAt } —
// `kind` is an ingest preset name ('picture' / 'answer' / 'mash' / 'source')
// or 'image' (stored as-is: migrated data URLs, bundle imports).

// Store a blob as-is (no re-encode). Returns the id. Pass `id` to overwrite.
export async function putImage(blob, {
  kind = 'image', id = newImageId(), width = 0, height = 0, notify = true,
} = {}) {
  const record = {
    id, blob, type: blob.type || 'application/octet-stream',
    width, height, kind, createdAt: Date.now(),
  };
  await run('readwrite', (store) => store.put(record));
  revokeCached(id);
  if (notify) notifyImagesChanged([id]);
  return id;
}

// Resolves the record, or null when the id isn't stored.
export async function getImage(id) {
  if (!id) return null;
  const rec = await run('readonly', (store) => store.get(id));
  return rec || null;
}

export async function deleteImage(id, { notify = true } = {}) {
  await run('readwrite', (store) => store.delete(id));
  revokeCached(id);
  if (notify) notifyImagesChanged([id]);
}

// Metadata for every stored record (blobs omitted — use getImage/getImageUrl).
export async function listImages() {
  const all = await run('readonly', (store) => store.getAll());
  return (all || []).map(({ blob, ...rest }) => ({ ...rest, size: blob?.size ?? 0 }));
}

export async function clearImages() {
  await run('readwrite', (store) => store.clear());
  revokeCached();
  notifyImagesChanged(null);
}

// ---- Pending writes -----------------------------------------------------------
// A writer that stores images and only then links them into the paste buffer
// (a slot or answer-image drop, a bundle import, the legacy-data-URL
// migration, the Face Mash Maker's three sequential addImage calls) has a
// window where the record exists but no slot references it yet; any paste
// commit in that window runs GC and would delete it. Writers pick their ids
// up front and hold them:
//
//   const id = newImageId();
//   const release = holdMedia([id]);
//   try { await addImage(src, { id }); updatePastes(...); } finally { release(); }
//
// gcImages never deletes a held id. release() lets go after HOLD_GRACE_MS,
// not at once, so a GC already scheduled off a commit that raced the write
// still sees the hold. Held ids live in this window only — another control
// window's GC can still collect them (the known two-windows caveat).
const HOLD_GRACE_MS = 2000;
const pendingMedia = new Set();

export function holdMedia(ids) {
  const held = (ids || []).filter(Boolean);
  held.forEach((id) => pendingMedia.add(id));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    setTimeout(() => held.forEach((id) => pendingMedia.delete(id)), HOLD_GRACE_MS);
  };
}

export function pendingMediaIds() {
  return [...pendingMedia];
}

// Delete every stored record whose id is not in `keepIds` and isn't held by
// an in-flight writer (holdMedia). Returns the number removed. The control
// window runs this after each successfully persisted paste commit, with
// every id the saved buffer references (referencedPictureIds).
export async function gcImages(keepIds) {
  const ids = (await run('readonly', (store) => store.getAllKeys())) || [];
  // Read the holds after the await, so a write that started meanwhile counts.
  const keep = new Set([...(keepIds || []), ...pendingMedia]);
  const doomed = ids.filter((id) => !keep.has(id));
  if (doomed.length === 0) return 0;
  await run('readwrite', (store) => { doomed.forEach((id) => store.delete(id)); return null; });
  doomed.forEach(revokeCached);
  notifyImagesChanged(doomed);
  return doomed.length;
}

// ---- Ingest -----------------------------------------------------------------
// Downscale + re-encode a pasted/dropped/generated image (the same recipe
// as pictures.js ingestImage): long edge capped by kind, JPEG at q0.85, alpha flattened onto
// white. Falls back to the original bytes only if decoding fails.
// Resolves { blob, width, height }.
export async function ingestImage(blob, { kind = 'picture', maxEdge, quality } = {}) {
  const preset = INGEST_PRESETS[kind] || DEFAULT_PRESET;
  const edge = maxEdge ?? preset.maxEdge;
  const q = quality ?? preset.quality;
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return { blob, width: 0, height: 0 };
  }
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';           // flatten transparency onto white
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q));
  return out ? { blob: out, width: w, height: h } : { blob, width: 0, height: 0 };
}

// Ingest + store in one call. Accepts a Blob/File, a data URL, or a canvas.
// Resolves the new id. This is the entry point for slot / answer-image
// paste + drop and the Face Mash Maker.
export async function addImage(source, { kind = 'picture', id, notify = true } = {}) {
  let blob = source;
  if (typeof source === 'string') blob = dataUrlToBlob(source);
  else if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    blob = await new Promise((resolve, reject) =>
      source.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read canvas.'))), 'image/png'));
  }
  const { blob: out, width, height } = await ingestImage(blob, { kind });
  return putImage(out, { id, kind, width, height, notify });
}

// ---- Object URLs ------------------------------------------------------------
// One cached object URL per id per window. Revoked when that id changes (put,
// delete, gc, or an images:update naming it) so the next read re-fetches.

const urlCache = new Map(); // id → Promise<string | null>

function revokeCached(id) {
  const drop = (key, p) => {
    p.then((url) => { if (url) URL.revokeObjectURL(url); }).catch(() => {});
    urlCache.delete(key);
  };
  if (id === undefined || id === null) {
    urlCache.forEach((p, key) => drop(key, p));
  } else if (urlCache.has(id)) {
    drop(id, urlCache.get(id));
  }
}

// Resolves an object URL for the image, or null when it isn't stored. Rejects
// with ImageStoreUnavailableError when IndexedDB is out.
export function getImageUrl(id) {
  if (!id) return Promise.resolve(null);
  if (!urlCache.has(id)) {
    const p = getImage(id).then((rec) => (rec?.blob ? URL.createObjectURL(rec.blob) : null));
    // Don't cache failures — a later read (after storage frees up) can retry.
    p.catch(() => { if (urlCache.get(id) === p) urlCache.delete(id); });
    urlCache.set(id, p);
  }
  return urlCache.get(id);
}

// ---- Change notification ----------------------------------------------------
// `ids` = array of changed ids, or null for "anything may have changed".

const localListeners = new Set();

export function notifyImagesChanged(ids = null) {
  const payload = { ids: Array.isArray(ids) ? ids : null };
  localListeners.forEach((fn) => {
    try { fn(payload); } catch { /* listener errors must not break writers */ }
  });
  try {
    broadcast('images:update', payload);
  } catch {
    // BroadcastChannel missing — other windows refresh on their next read.
  }
}

// Subscribe to image changes from this window AND the other one. Returns an
// unsubscribe function. The handler receives { ids }.
export function onImagesChanged(handler) {
  localListeners.add(handler);
  return () => localListeners.delete(handler);
}

// Remote changes: drop our cached URLs for those ids before anyone re-reads.
// Every mounted hook hears the same message (same payload object), so only
// the first one invalidates — later ones would revoke a URL a sibling hook
// already re-fetched.
const handledPayloads = new WeakSet();
function invalidateFrom(payload) {
  if (payload && typeof payload === 'object') {
    if (handledPayloads.has(payload)) return;
    handledPayloads.add(payload);
  }
  if (payload?.ids) payload.ids.forEach(revokeCached);
  else revokeCached();
}

// React hook: resolve an image id to a displayable URL. Re-resolves when the
// id changes or an images:update (local or remote) names it.
//   status: 'none'        — no id given (nothing to show)
//           'loading'     — reading IndexedDB
//           'ready'       — url is set
//           'missing'     — id not in the store (deleted, or bundle lacked it)
//           'unavailable' — IndexedDB is out in this browser
// Render a placeholder for anything but 'ready'.
export function useImageUrl(id) {
  const [state, setState] = useState(() => ({ id, url: null, status: id ? 'loading' : 'none' }));
  const [version, setVersion] = useState(0);

  const touches = useCallback((payload) => !payload?.ids || payload.ids.includes(id), [id]);

  // Remote window changed something.
  useBroadcast(useCallback((msg) => {
    if (msg.type !== 'images:update') return;
    invalidateFrom(msg.payload);
    if (touches(msg.payload)) setVersion((v) => v + 1);
  }, [touches]));

  // This window changed something (writers already revoked the cache).
  useEffect(() => onImagesChanged((payload) => {
    if (touches(payload)) setVersion((v) => v + 1);
  }), [touches]);

  useEffect(() => {
    if (!id) {
      setState({ id, url: null, status: 'none' });
      return undefined;
    }
    let live = true;
    setState((s) => (s.id === id && s.status === 'ready' ? s : { id, url: null, status: 'loading' }));
    getImageUrl(id).then(
      (url) => { if (live) setState({ id, url, status: url ? 'ready' : 'missing' }); },
      (err) => {
        if (live) setState({ id, url: null, status: err instanceof ImageStoreUnavailableError ? 'unavailable' : 'missing' });
      },
    );
    return () => { live = false; };
  }, [id, version]);

  // Guard against one render of a stale url after the id prop changes.
  return state.id === id ? state : { id, url: null, status: id ? 'loading' : 'none' };
}

// ---- Bundle export / import -------------------------------------------------

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!m) throw new Error('Not a data URL.');
  const type = m[1] || 'application/octet-stream';
  if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type });
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

// Serialize the given ids for a deck bundle. Ids not in the store are listed
// in `missing` rather than failing the export.
// Resolves { images: { [id]: { dataUrl, kind, width, height } }, missing: [id] }.
export async function exportImages(ids) {
  const images = {};
  const missing = [];
  for (const id of ids || []) {
    const rec = await getImage(id);
    if (!rec?.blob) { missing.push(id); continue; }
    images[id] = {
      dataUrl: await blobToDataUrl(rec.blob),
      kind: rec.kind,
      width: rec.width,
      height: rec.height,
    };
  }
  return { images, missing };
}

// Write a bundle's images back under their original ids. Accepts the rich
// { dataUrl, kind, width, height } shape or a bare 'data:image/…' string per
// id; malformed entries are skipped (counted in `failed`), never fatal.
// Storage being out or full rejects (after notifying for what did land).
// Resolves { restored, failed, ids } — `ids` = the ids actually written.
export async function importImages(map) {
  let restored = 0;
  let failed = 0;
  const written = [];
  for (const [id, entry] of Object.entries(map || {})) {
    const dataUrl = typeof entry === 'string' ? entry : entry?.dataUrl;
    if (!id || typeof dataUrl !== 'string' || !/^data:image\//.test(dataUrl)) { failed++; continue; }
    try {
      const blob = dataUrlToBlob(dataUrl);
      await putImage(blob, {
        id,
        kind: typeof entry?.kind === 'string' && entry.kind ? entry.kind : 'image',
        width: Number(entry?.width) || 0,
        height: Number(entry?.height) || 0,
        notify: false,
      });
      written.push(id);
      restored++;
    } catch (err) {
      if (err instanceof ImageStoreUnavailableError || err?.name === 'QuotaExceededError') {
        if (written.length) notifyImagesChanged(written);
        throw err;
      }
      failed++;
    }
  }
  if (written.length) notifyImagesChanged(written);
  return { restored, failed, ids: written };
}
