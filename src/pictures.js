// Picture Round data + paste-buffer persistence.
//
// Workflow: the host pastes images in the control window → they're
// downscaled + re-encoded and stored in IndexedDB (src/imageStore.js) → the
// 10-slot paste buffer in localStorage references them by id. Each slot:
//
//   { imageId, dataUrl, caption, position: { x, y },
//     answerImageAId, answerLabelA, answerImageBId, answerLabelB }
//
// - imageId: the slot's picture in the image store (null = empty slot).
// - dataUrl: LEGACY / DEGRADED only. Buffers saved before the image store
//   (and v1/v2 deck bundles) carry the picture inline as a data URL; the
//   control window migrates those into the store on load (migratePastes) and
//   swaps in an imageId once the write succeeds. When IndexedDB is
//   unavailable the control window keeps writing data URLs here as before.
//   Readers must tolerate dataUrl slots indefinitely (a display on an old
//   build, a browser without IndexedDB).
// - caption: the slot's answer text (host-only until the answer walkthrough's
//   reveal step; never shown in the Picture Show).
// - answerImageA/BId + answerLabelA/B: up to two answer images with optional
//   labels. A face mash uses both (the two source photos + actor names).
//
// The deck bundle export carries the buffer plus every referenced image as
// a data URL (`images` section), so a deck moves between machines as a
// single JSON file.

const COUNT = 10;
export const PICTURE_COUNT = COUNT;
const STORAGE_KEY = 'jxnfilmclub-trivia.pictures';

// Static fallbacks — predictable on-disk paths under public/images/. Decks
// that commit images there (e.g. deployed themed forks) get them served
// statically; otherwise the <img> 404s and the slide falls back to the
// placeholder. Pasted images always win over these.
// (`import.meta.env?.` so plain Node can import this module for checks.)
const BASE_URL = import.meta.env?.BASE_URL ?? '/';
export const DEFAULT_PICTURE_ITEMS = Array.from({ length: COUNT }, (_, i) => ({
  src: `${BASE_URL}images/picture-${String(i + 1).padStart(2, '0')}.png`,
  caption: null,
}));

// Picture-round cell geometry — single source of truth shared by the display
// slide (slides.jsx), the canvas handout (handout.js), and the editor preview
// (ControlApp.jsx) so all three crop/letterbox identically. Keys are the
// `meta.pictureRound.aspect` values; `label` is shown in the editor picker.
export const PICTURE_ASPECTS = {
  '316 / 220': { w: 316, h: 220, label: 'Landscape (default)' },
  '3 / 2': { w: 3, h: 2, label: 'Flag 3:2' },
  '2 / 1': { w: 2, h: 1, label: 'Banner 2:1' },
  '1 / 1': { w: 1, h: 1, label: 'Square 1:1' },
};
export const DEFAULT_ASPECT = '316 / 220';
export const PICTURE_FITS = ['cover', 'contain'];

// Resolve a `meta.pictureRound.aspect` string to a CSS value + numeric pair.
// Unknown/garbage values degrade to the default (never yields `undefined`,
// which would collapse the cells).
export function resolveAspect(aspect) {
  const a = PICTURE_ASPECTS[aspect] || PICTURE_ASPECTS[DEFAULT_ASPECT];
  return { css: `${a.w} / ${a.h}`, w: a.w, h: a.h };
}

// Size the picture grid honoring BOTH the horizontal (cols across contentW) and
// vertical (rows within availH) constraints, so tall aspects (e.g. square)
// shrink and center instead of overflowing the 2-row grid. `cellExtra` is the
// per-row non-photo height (handout's answer area + gap); the on-screen slide
// passes 0. Returns the photo cell width/height and the actual grid width
// (< contentW when vertically constrained → caller centers it).
export function pictureGridLayout({ aspect, cols, rows, contentW, availH, gap, cellExtra = 0 }) {
  const { w, h } = resolveAspect(aspect);
  const cellWByCols = (contentW - gap * (cols - 1)) / cols;
  const photoHMax = (availH - gap * (rows - 1)) / rows - cellExtra;
  const cellWByRows = photoHMax > 0 ? photoHMax * (w / h) : cellWByCols;
  const cellW = Math.min(cellWByCols, cellWByRows);
  const photoH = cellW * (h / w);
  const gridW = cellW * cols + gap * (cols - 1);
  return { cellW, photoH, gridW };
}

// Default crop position: 50/50 = centered (matches `object-position: center`).
export const DEFAULT_POSITION = { x: 50, y: 50 };

const ANSWER_SLOTS = ['A', 'B'];

// Sanitizers — every field is coerced to its expected type so old saves,
// hand-edited bundles, and garbage degrade to an empty field instead of
// reaching the slides. Ids must be non-empty strings; text fields are
// strings (empty → null); dataUrl must be a data:image/ URL.
const idOrNull = (v) => (typeof v === 'string' && v.trim() ? v : null);
const textOrNull = (v) => (typeof v === 'string' && v !== '' ? v : null);
const dataUrlOrNull = (v) => (typeof v === 'string' && /^data:image\//.test(v) ? v : null);
const pct = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
};

export function emptyPaste() {
  return {
    imageId: null, dataUrl: null, caption: null, position: { ...DEFAULT_POSITION },
    answerImageAId: null, answerLabelA: null, answerImageBId: null, answerLabelB: null,
  };
}

// Normalize a paste entry to the current shape, defaulting any missing fields.
// Older localStorage entries (pre-crop) won't have `position`; pre-store ones
// carry `dataUrl` and no `imageId`; pre-answer ones have no answer fields.
export function normalizePaste(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return emptyPaste();
  const imageId = idOrNull(p.imageId);
  return {
    imageId,
    // A slot holds ONE picture: an id wins over a stray inline copy.
    dataUrl: imageId ? null : dataUrlOrNull(p.dataUrl),
    caption: textOrNull(p.caption),
    position: { x: pct(p.position?.x), y: pct(p.position?.y) },
    answerImageAId: idOrNull(p.answerImageAId),
    answerLabelA: textOrNull(p.answerLabelA),
    answerImageBId: idOrNull(p.answerImageBId),
    answerLabelB: textOrNull(p.answerLabelB),
  };
}

// Normalize an arbitrary array (older saves, imported bundles) to exactly
// COUNT well-shaped entries — pads short arrays, drops extras.
export function normalizePastes(arr) {
  const list = Array.isArray(arr) ? arr : [];
  return Array.from({ length: COUNT }, (_, i) => normalizePaste(list[i]));
}

// Returns 10 normalized entries.
export function loadPastes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalizePastes(parsed);
    }
  } catch {
    // fall through
  }
  return normalizePastes([]);
}

// ---- Slot queries (pure) ----------------------------------------------------

// A slot "has a picture" when it references a stored image or still carries a
// legacy data URL. Disk fallbacks (public/images/picture-NN.png) don't count:
// they can only be known asynchronously, and the answer walkthrough + the
// presenter outline must agree synchronously across both windows.
export function hasPicture(p) {
  return !!(p && (p.imageId || p.dataUrl));
}

// Anything at all in the slot — picture, answer text, answer images/labels.
export function slotHasContent(p) {
  return !!(p && (p.imageId || p.dataUrl || p.caption ||
    p.answerImageAId || p.answerImageBId || p.answerLabelA || p.answerLabelB));
}

export function pastesHaveContent(pastes) {
  return (pastes || []).some(slotHasContent);
}

// A face-mash slot: two answers to write down (both labels or both answer
// images present). The answer sheet gives it two lines (3A / 3B).
export function isFaceMashSlot(p) {
  return !!(p && ((p.answerLabelA && p.answerLabelB) || (p.answerImageAId && p.answerImageBId)));
}

// The answer text shown on the reveal step. A typed caption always wins;
// with no caption, both labels derive "A · B" (a face mash's actor names),
// and a single label stands alone. Derived at read time, never stored, so a
// later typed caption simply takes over.
export function answerTextFor(p) {
  if (!p) return '';
  const caption = typeof p.caption === 'string' ? p.caption.trim() : '';
  if (caption) return caption;
  const a = typeof p.answerLabelA === 'string' ? p.answerLabelA.trim() : '';
  const b = typeof p.answerLabelB === 'string' ? p.answerLabelB.trim() : '';
  if (a && b) return `${a} · ${b}`;
  return a || b || '';
}

// Every image-store id the buffer references (GC keep-list + export set).
export function referencedPictureIds(pastes) {
  const ids = new Set();
  (pastes || []).forEach((p) => {
    if (!p) return;
    [p.imageId, p.answerImageAId, p.answerImageBId].forEach((id) => {
      if (typeof id === 'string' && id) ids.add(id);
    });
  });
  return [...ids];
}

// Slot indices (0-based) the answer walkthrough covers, in order: every slot
// with a picture. App.jsx and ControlApp's buildSlideOutline both call this.
export function walkthroughSlots(pastes) {
  const out = [];
  normalizePastes(pastes).forEach((p, i) => { if (hasPicture(p)) out.push(i); });
  return out;
}

// Line labels for the picture-round answer sheet: one per slot ("01"), two
// for a face-mash slot ("03A", "03B"). Always covers all COUNT slots so the
// numbering matches the Picture Show's "Image 03 / 10".
export function pictureAnswerLines(pastes) {
  const lines = [];
  normalizePastes(pastes).forEach((p, i) => {
    const n = String(i + 1).padStart(2, '0');
    if (isFaceMashSlot(p)) ANSWER_SLOTS.forEach((s) => lines.push(`${n}${s}`));
    else lines.push(n);
  });
  return lines;
}

// ---- Legacy data-URL migration ----------------------------------------------
// Moves inline `dataUrl` pictures into the image store. `writeImage(dataUrl,
// slotIndex)` stores one and resolves its id (the caller picks + holds ids).
// Per slot: only after the write resolves does the slot swap its dataUrl for
// the id; a failed write leaves that slot untouched (it keeps rendering from
// its data URL). A store-unavailable error (err.unavailable or name
// 'ImageStoreUnavailableError') stops early — nothing else will succeed.
// Pure apart from the injected writer, so Node can exercise it.
// Resolves { pastes, migrated: [slot], failed: [slot], ids: { [slot]: id },
// unavailable }.
export async function migratePastes(pastes, writeImage) {
  const list = normalizePastes(pastes);
  const ids = {};
  const migrated = [];
  const failed = [];
  let unavailable = false;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.dataUrl) continue;
    if (unavailable) { failed.push(i); continue; }
    try {
      const id = await writeImage(p.dataUrl, i);
      if (typeof id !== 'string' || !id) throw new Error('no id');
      ids[i] = id;
      migrated.push(i);
    } catch (err) {
      failed.push(i);
      if (err?.name === 'ImageStoreUnavailableError' || err?.unavailable) unavailable = true;
    }
  }
  return { pastes: applyMigration(list, list, ids), migrated, failed, ids, unavailable };
}

// Land migration results on the CURRENT buffer (which may have changed
// while the writes were in flight): a slot takes its new id only if it still
// carries the exact data URL that was migrated. Anything the host replaced or
// cleared meanwhile is left alone (the orphaned record gets GC'd).
export function applyMigration(current, original, ids) {
  const cur = normalizePastes(current);
  const orig = normalizePastes(original);
  return cur.map((p, i) => {
    const id = ids[i];
    if (!id || !p.dataUrl || p.dataUrl !== orig[i].dataUrl) return p;
    return { ...p, imageId: id, dataUrl: null };
  });
}

// Degraded import (no IndexedDB): inline a v3 bundle's images back into the
// slots as data URLs so at least the pictures survive. Answer images can't
// be inlined (answer slots are id-only) and are dropped.
export function inlineBundlePictures(pastes, images) {
  return normalizePastes(pastes).map((p) => {
    const entry = p.imageId ? images?.[p.imageId] : null;
    const dataUrl = dataUrlOrNull(typeof entry === 'string' ? entry : entry?.dataUrl);
    return {
      ...p,
      imageId: null,
      dataUrl: dataUrl || p.dataUrl,
      answerImageAId: null,
      answerImageBId: null,
    };
  });
}

// Persist the paste buffer. Returns false when the write fails (in practice:
// QuotaExceededError) so callers can warn instead of dying mid-handler —
// the in-memory state and the display broadcast still carry the image for
// the session either way.
export function savePastes(pastes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pastes));
    return true;
  } catch {
    return false;
  }
}

// Downscale + re-encode a pasted/dropped image so the 10-slot buffer stays
// comfortably inside the localStorage quota. Long edge caps at `maxEdge`
// (cells render at ~350px on a 1080p slide, so 1600px keeps generous crop
// headroom) and output is JPEG — photographic sources shrink ~10-50×; the
// alpha channel is flattened onto white. Falls back to the original bytes
// only if decoding fails (corrupt/unsupported source).
export async function ingestImage(blob, { maxEdge = 1600, quality = 0.85 } = {}) {
  const readAsDataUrl = () => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.readAsDataURL(blob);
  });
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';           // flatten transparency onto white
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return readAsDataUrl();
  }
}

export function clearPastes() {
  localStorage.removeItem(STORAGE_KEY);
}

// Resolve what to render per slot, synchronously (never touches IndexedDB):
// `imageId` (resolve with useImageUrl / getImageUrl) wins over `dataUrl`,
// which wins over the disk fallback `src`. `src` is the inline data URL when
// there is one, else the disk path — so a renderer without store access
// still has something. Answer fields ride along; `answerText` is derived.
export function mergeItems(pastes) {
  const list = normalizePastes(pastes);
  return DEFAULT_PICTURE_ITEMS.map((item, i) => {
    const p = list[i];
    return {
      imageId: p.imageId,
      dataUrl: p.dataUrl,
      src: p.dataUrl || item.src,
      fallbackSrc: item.src,
      caption: p.caption || item.caption,
      answerText: answerTextFor(p),
      position: { ...p.position },
      answerImageAId: p.answerImageAId,
      answerLabelA: p.answerLabelA,
      answerImageBId: p.answerImageBId,
      answerLabelB: p.answerLabelB,
      isPasted: hasPicture(p),
    };
  });
}
