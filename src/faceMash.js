// ============================================================
// FACE MASH — the image math behind the Utilities → Face Mash Maker tool.
// Ported from the standalone Face Mash Maker page: three landmarks per photo
// (left eye, right eye, mouth centre) drive an affine warp of the "inside"
// face onto the "outside" head, clipped by a feathered rotated ellipse,
// with per-channel mean/std skin-tone transfer, brightness, and opacity.
//
// Pure canvas code, no React. The UI (point picking, sliders, Add to round)
// lives in ControlApp.jsx; this module only decodes and composes.
// ============================================================

// Long-edge cap for decoded source photos. The image store re-downscales on
// ingest (mash 1600 / source 1000), so this only bounds working memory.
export const MAXSIDE = 1800;

export const LANDMARK_PROMPTS = [
  'Click the eye on the left side of the photo',
  'Click the eye on the right side of the photo',
  'Click the center of the mouth',
];

export const DEFAULT_CONTROLS = {
  width: 100,   // face area width %
  height: 100,  // face area height %
  feather: 30,  // edge softness %
  color: 80,    // skin tone match %
  bright: 0,    // brightness offset (−40…40)
  opacity: 100, // face opacity %
};

// Decode an image File/Blob into a canvas capped at MAXSIDE. The canvas is
// created willReadFrequently because compose() calls getImageData on it.
export async function decodeToCanvas(file) {
  let src = null;
  if (typeof createImageBitmap === 'function') {
    try { src = await createImageBitmap(file); } catch { /* fall through */ }
  }
  if (!src) {
    const url = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    src = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
  }
  const w = src.width || src.naturalWidth;
  const h = src.height || src.naturalHeight;
  const s = Math.min(1, MAXSIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(src, 0, 0, c.width, c.height);
  src.close?.();
  return c;
}

// Solve x' = a x + c y + e,  y' = b x + d y + f  from three point pairs.
// Returns a canvas setTransform tuple, or null when the source points are
// collinear (no unique solution).
export function affine(src, dst) {
  const [p0, p1, p2] = src;
  const det = p0.x * (p1.y - p2.y) - p0.y * (p1.x - p2.x) + (p1.x * p2.y - p2.x * p1.y);
  if (Math.abs(det) < 1e-6) return null;
  const solve = (v0, v1, v2) => {
    const A = (v0 * (p1.y - p2.y) - p0.y * (v1 - v2) + (v1 * p2.y - v2 * p1.y)) / det;
    const B = (p0.x * (v1 - v2) - v0 * (p1.x - p2.x) + (p1.x * v2 - p2.x * v1)) / det;
    const C = (p0.x * (p1.y * v2 - p2.y * v1) - p0.y * (p1.x * v2 - p2.x * v1) + v0 * (p1.x * p2.y - p2.x * p1.y)) / det;
    return [A, B, C];
  };
  const [a, c, e] = solve(dst[0].x, dst[1].x, dst[2].x);
  const [b, d, f] = solve(dst[0].y, dst[1].y, dst[2].y);
  return [a, b, c, d, e, f];
}

// The blend ellipse on the outside head, derived from its three landmarks:
// centred between the eye line and just below the mouth, rotated with the
// eye line, scaled by the width/height controls.
export function faceEllipse(pts, ctl) {
  const [L, R, M] = pts;
  const ex = (L.x + R.x) / 2, ey = (L.y + R.y) / 2;
  const ed = Math.hypot(R.x - L.x, R.y - L.y);
  const ux = (R.x - L.x) / ed, uy = (R.y - L.y) / ed;
  const vx = -uy, vy = ux; // points "down" the face
  const mDown = (M.x - ex) * vx + (M.y - ey) * vy;
  const mSide = (M.x - ex) * ux + (M.y - ey) * uy;
  const top = -0.55 * ed, bottom = Math.max(mDown, 0.6 * ed) + 0.32 * ed;
  const mid = (top + bottom) / 2;
  const cx = ex + ux * mSide / 2 + vx * mid, cy = ey + uy * mSide / 2 + vy * mid;
  const rx = 1.25 * ed * ctl.width / 100;
  const ry = (bottom - top) / 2 * 1.08 * ctl.height / 100;
  return { cx, cy, rx, ry, ang: Math.atan2(uy, ux) };
}

function eyeGap(pts) {
  return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
}

export function isReady(outside, inside) {
  return Boolean(outside?.img && inside?.img && outside.pts.length === 3 && inside.pts.length === 3);
}

// Scratch canvases, reused across renders (compose runs per drag frame).
let warp = null;
let faceC = null;

// Draw the mash into `target` (resized to the outside photo). `outside` and
// `inside` are { img: canvas, pts: [{x,y}×3] }. Returns an error string for
// the host, or null on success.
export function compose(target, outside, inside, ctl, showOutline = false) {
  const O = outside, I = inside;
  const W = O.img.width, H = O.img.height;
  const T = affine(I.pts, O.pts);
  // Both sets must be non-degenerate: the inside set for the warp to have a
  // solution, the outside set so the warp doesn't flatten the face onto a
  // line and the ellipse (which divides by the outside eye distance) stays
  // finite. Coincident eyes (both dragged into the same corner) fail both.
  if (!T || !affine(O.pts, I.pts) || eyeGap(O.pts) < 1 || eyeGap(I.pts) < 1) {
    return 'The three points on one photo are in a straight line or on top of each other. Move the mouth point below the eyes and keep the eyes apart.';
  }
  target.width = W; target.height = H;
  const tctx = target.getContext('2d');
  tctx.drawImage(O.img, 0, 0);

  const g = faceEllipse(O.pts, ctl);
  const cos = Math.cos(g.ang), sin = Math.sin(g.ang);
  const hx = Math.sqrt((g.rx * cos) ** 2 + (g.ry * sin) ** 2), hy = Math.sqrt((g.rx * sin) ** 2 + (g.ry * cos) ** 2);
  const bx = Math.max(0, Math.floor(g.cx - hx)), by = Math.max(0, Math.floor(g.cy - hy));
  const bw = Math.min(W, Math.ceil(g.cx + hx)) - bx, bh = Math.min(H, Math.ceil(g.cy + hy)) - by;
  // Belt and braces: a NaN box would make getImageData throw.
  if (![bx, by, bw, bh].every(Number.isFinite)) return 'Could not place the face on these points. Re-pick the landmarks.';
  if (bw <= 0 || bh <= 0) return null;

  if (!warp) warp = document.createElement('canvas');
  if (!faceC) faceC = document.createElement('canvas');
  warp.width = W; warp.height = H;
  const wctx = warp.getContext('2d', { willReadFrequently: true });
  wctx.setTransform(1, 0, 0, 1, 0, 0); wctx.clearRect(0, 0, W, H);
  wctx.imageSmoothingEnabled = true; wctx.imageSmoothingQuality = 'high';
  wctx.setTransform(T[0], T[1], T[2], T[3], T[4], T[5]);
  wctx.drawImage(I.img, 0, 0);
  wctx.setTransform(1, 0, 0, 1, 0, 0);

  const wd = wctx.getImageData(bx, by, bw, bh), w = wd.data;
  const od = O.img.getContext('2d', { willReadFrequently: true }).getImageData(bx, by, bw, bh).data;

  // mask alpha per pixel
  const f = Math.max(0.02, ctl.feather / 100);
  const mask = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const dx = x + bx + 0.5 - g.cx, dy = y + by + 0.5 - g.cy;
    const lx = (dx * cos + dy * sin) / g.rx, ly = (-dx * sin + dy * cos) / g.ry;
    const r = Math.sqrt(lx * lx + ly * ly);
    let a = 0;
    if (r <= 1 - f) a = 1; else if (r < 1) { const t = (1 - r) / f; a = t * t * (3 - 2 * t); }
    mask[y * bw + x] = a;
  }

  // skin tone match (per-channel mean/std transfer over the solid part of the mask)
  const strength = ctl.color / 100, bright = ctl.bright * 1.5;
  const sI = [0, 0, 0], sO = [0, 0, 0], qI = [0, 0, 0], qO = [0, 0, 0];
  let n = 0;
  if (strength > 0) {
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] < 0.95 || w[i * 4 + 3] < 250) continue;
      for (let k = 0; k < 3; k++) { const a = w[i * 4 + k], b = od[i * 4 + k]; sI[k] += a; qI[k] += a * a; sO[k] += b; qO[k] += b * b; }
      n++;
    }
  }
  const mI = [], mO = [], ratio = [];
  const useMatch = n > 200;
  if (useMatch) for (let k = 0; k < 3; k++) {
    mI[k] = sI[k] / n; mO[k] = sO[k] / n;
    const dI = Math.sqrt(Math.max(1, qI[k] / n - mI[k] ** 2)), dO = Math.sqrt(Math.max(1, qO[k] / n - mO[k] ** 2));
    ratio[k] = Math.max(0.6, Math.min(1.6, dO / dI));
  }
  const op = ctl.opacity / 100;
  for (let i = 0; i < mask.length; i++) {
    const j = i * 4;
    if (mask[i] === 0 || w[j + 3] === 0) { w[j + 3] = 0; continue; }
    for (let k = 0; k < 3; k++) {
      let v = w[j + k];
      if (useMatch) v = v + (((v - mI[k]) * ratio[k] + mO[k]) - v) * strength;
      w[j + k] = v + bright;
    }
    w[j + 3] = w[j + 3] * mask[i] * op;
  }
  faceC.width = bw; faceC.height = bh;
  faceC.getContext('2d').putImageData(wd, 0, 0);
  tctx.drawImage(faceC, bx, by);

  if (showOutline) {
    const lw = Math.max(2, W / 500);
    tctx.save(); tctx.translate(g.cx, g.cy); tctx.rotate(g.ang);
    tctx.lineWidth = lw; tctx.setLineDash([lw * 4, lw * 3]);
    tctx.strokeStyle = 'rgba(255,255,255,.9)';
    tctx.beginPath(); tctx.ellipse(0, 0, g.rx, g.ry, 0, 0, Math.PI * 2); tctx.stroke();
    tctx.strokeStyle = 'rgba(255,255,255,.45)';
    tctx.beginPath(); tctx.ellipse(0, 0, g.rx * (1 - f), g.ry * (1 - f), 0, 0, Math.PI * 2); tctx.stroke();
    tctx.restore();
  }
  return null;
}
