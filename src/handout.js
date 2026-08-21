// Render the picture round as a print-friendly PNG (light background, dark
// borders, no atmosphere overlays, no "Recap" eyebrow). Handles copy-to-
// clipboard and file download.
//
// Drawn directly on a 2D canvas — no html2canvas dependency, no DOM clones.

import { DEFAULT_ASPECT, pictureGridLayout } from './pictures.js';
import { DEFAULT_META } from './meta.js';

// Fallback instruction line printed under the handout title. Callers (the
// control window) pass the per-game value from meta.pictureRound; this keeps
// the bare renderHandoutCanvas(items) call working on its own.
const DEFAULT_HANDOUT_INSTRUCTION = DEFAULT_META.pictureRound.instruction;

// Default cell render options — mirrors meta.pictureRound so the bare
// renderHandoutCanvas(items) call reproduces the historical layout.
const DEFAULT_HANDOUT_OPTS = { fit: 'cover', aspect: DEFAULT_ASPECT };

// Page geometry — mirrors the on-screen PictureRoundRecap slide so the same
// image crops the same way in both surfaces. Margins, gaps, and per-cell
// dimensions match the deck's SPACING + TYPE_SCALE constants and the slide
// PictureRecapCell's fixed photo-box aspect ratio.
const W = 1920;
const H = 1080;
const MARGIN_X = 120;                            // matches slide paddingX
const TITLE_Y = 100;                             // matches slide paddingTop
const TITLE_HEIGHT = 96;
const RULE_Y = TITLE_Y + TITLE_HEIGHT + 14;      // 210
const INSTRUCTION_Y = RULE_Y + 32;               // 242
const GAP = 24;                                  // matches slide grid gap
const COLS = 5;
const ROWS = 2;
// Each cell is split into a photo box (top, aspect from meta.pictureRound) and
// an answer area (bottom). The photo aspect matches the slide PictureRecapCell
// so the same objectPosition produces the same visible crop on both surfaces.
const ANSWER_HEIGHT = 56;                        // matches slide answer-line area
const PHOTO_GAP = 14;                            // matches slide gap between photo and answer
const ANSWER_LINE_THICKNESS = 2;

// Wait for fonts so the canvas uses Oswald, not the system fallback.
async function ensureFonts() {
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* ignore */ }
  }
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';  // best-effort; data URLs and same-origin work regardless
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function renderHandoutCanvas(items, instruction = DEFAULT_HANDOUT_INSTRUCTION, opts = DEFAULT_HANDOUT_OPTS) {
  const fit = opts?.fit === 'contain' ? 'contain' : 'cover';
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // White background — print-friendly, ink-friendly.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // Title — "PICTURE ROUND" in deck typography
  ctx.fillStyle = '#100f0e';
  ctx.font = `700 88px 'Oswald', 'Bebas Neue', Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('PICTURE ROUND', W / 2, TITLE_Y);

  // Thin accent rule under the title — brand red
  const ruleW = 220;
  ctx.fillStyle = '#d7321f';
  ctx.fillRect((W - ruleW) / 2, RULE_Y, ruleW, 3);

  // Instruction line — what contestants are doing. Left-aligned to match the
  // slide layout (italic Newsreader body text under the accent rule).
  ctx.fillStyle = '#6e6a60';
  ctx.font = `italic 500 36px 'Newsreader', Georgia, 'Iowan Old Style', serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(instruction, MARGIN_X, INSTRUCTION_Y);

  // TEAM field — right side of the instruction row.
  drawTeamField(ctx, W - MARGIN_X - 480, INSTRUCTION_Y, 480);

  // Cell geometry — honor both the column width and the available vertical
  // budget so tall aspects (square) shrink + center instead of running off the
  // bottom of the page. Mirrors the on-screen slide via the shared helper, so
  // the same photo-box aspect produces the same crop on both surfaces.
  const GRID_TOP = INSTRUCTION_Y + 80;            // ~322; leaves headroom under the instruction
  const GRID_BOTTOM = H - 72;                      // bottom page margin
  const { cellW, photoH, gridW } = pictureGridLayout({
    aspect: opts?.aspect, cols: COLS, rows: ROWS,
    contentW: W - MARGIN_X * 2, availH: GRID_BOTTOM - GRID_TOP,
    gap: GAP, cellExtra: PHOTO_GAP + ANSWER_HEIGHT,
  });
  const rowH = photoH + PHOTO_GAP + ANSWER_HEIGHT;
  const startX = (W - gridW) / 2;                  // center horizontally (= MARGIN_X for full-width grids)

  // Pre-load every image (parallel)
  const images = await Promise.all(items.map((it) => loadImage(it.src)));

  for (let i = 0; i < items.length; i++) {
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    const x = startX + c * (cellW + GAP);
    const y = GRID_TOP + r * (rowH + GAP);

    // Photo box background (faint) for empty cells; transparent if image present
    if (!images[i]) {
      ctx.fillStyle = '#f2efe8';
      ctx.fillRect(x, y, cellW, photoH);
    }

    // Photo box border
    ctx.strokeStyle = '#100f0e';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, cellW - 2, photoH - 2);

    // Image inside the photo box. "cover" scales to fill + crops, honoring the
    // per-image position the same way object-position does in the DOM
    // (position.x/y are 0-100, selecting which slice of the over-sized image
    // lands in the cell). "contain" scales to fit inside + centers, showing the
    // whole image (flag round) — position is meaningless there and ignored.
    if (images[i]) {
      const img = images[i];
      let dW, dH, dX, dY;
      if (fit === 'contain') {
        const ratio = Math.min(cellW / img.width, photoH / img.height);
        dW = img.width * ratio;
        dH = img.height * ratio;
        dX = x + (cellW - dW) / 2;
        dY = y + (photoH - dH) / 2;
      } else {
        const ratio = Math.max(cellW / img.width, photoH / img.height);
        dW = img.width * ratio;
        dH = img.height * ratio;
        const px = (items[i].position?.x ?? 50) / 100;
        const py = (items[i].position?.y ?? 50) / 100;
        dX = x + (cellW - dW) * px;
        dY = y + (photoH - dH) * py;
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 2, y + 2, cellW - 4, photoH - 4);
      ctx.clip();
      ctx.drawImage(img, dX, dY, dW, dH);
      ctx.restore();
    } else {
      // "PHOTO" label centered when empty
      ctx.fillStyle = '#a89f8f';
      ctx.font = `500 28px 'Oswald', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PHOTO', x + cellW / 2, y + photoH / 2);
    }

    // Number badge (top-left of the photo box, dark on white for ink-friendly contrast)
    const badgeSize = 56;
    const bx = x + 12;
    const by = y + 12;
    ctx.fillStyle = '#100f0e';
    ctx.fillRect(bx, by, badgeSize, badgeSize);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 30px 'Oswald', 'Bebas Neue', Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1).padStart(2, '0'), bx + badgeSize / 2, by + badgeSize / 2 + 1);

    // Answer line — sits at the bottom of the answer area; writing goes above it.
    const lineY = y + photoH + PHOTO_GAP + ANSWER_HEIGHT - ANSWER_LINE_THICKNESS;
    ctx.fillStyle = '#100f0e';
    ctx.fillRect(x, lineY, cellW, ANSWER_LINE_THICKNESS);
  }

  return canvas;
}

function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve) => canvas.toBlob(resolve, type));
}

export async function copyHandoutToClipboard(items, instruction = DEFAULT_HANDOUT_INSTRUCTION, opts = DEFAULT_HANDOUT_OPTS) {
  const canvas = await renderHandoutCanvas(items, instruction, opts);
  const blob = await canvasToBlob(canvas);
  if (!blob) throw new Error('Failed to create handout blob');
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard image API not supported in this browser');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export async function downloadHandoutPng(items, instruction = DEFAULT_HANDOUT_INSTRUCTION, filename = 'picture-round-handout.png', opts = DEFAULT_HANDOUT_OPTS) {
  const canvas = await renderHandoutCanvas(items, instruction, opts);
  const blob = await canvasToBlob(canvas);
  if (!blob) throw new Error('Failed to create handout blob');
  triggerDownload(blob, filename);
}

// Generic "numbered answer lines + team / round field" worksheet for
// non-picture rounds. One PNG, photocopy as many as needed. Line count
// follows the longest round (minimum 10) so custom-length rounds fit.
export async function renderAnswersHandoutCanvas(lineCount = 10) {
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // White background — print-friendly, ink-friendly.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // Title — match the picture handout's typography.
  ctx.fillStyle = '#100f0e';
  ctx.font = `700 88px 'Oswald', 'Bebas Neue', Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('ANSWERS', W / 2, TITLE_Y);

  // Thin accent rule under the title (mirrors the picture handout).
  const ruleW = 220;
  ctx.fillStyle = '#d7321f';
  ctx.fillRect((W - ruleW) / 2, RULE_Y, ruleW, 3);

  // TEAM (left) + ROUND (right) on the same row as the instruction line.
  const fieldsY = INSTRUCTION_Y;
  ctx.font = `700 32px 'Oswald', 'Bebas Neue', Impact, sans-serif`;
  const roundLabelW = ctx.measureText('ROUND:').width;
  const roundLineW = 160;
  const roundBlockW = roundLabelW + 14 + roundLineW;
  drawTeamField(ctx, MARGIN_X, fieldsY, (W - 2 * MARGIN_X) - roundBlockW - 80);
  drawLabeledLine(ctx, 'ROUND:', W - MARGIN_X - roundBlockW, fieldsY, roundLineW);

  // Numbered answer lines, evenly spaced down the page. The gap shrinks as
  // the count grows so the last write-line stays inside the bottom margin;
  // at the default 10 lines this works out to the original 70px gap.
  const LINES_TOP = 332;
  const LINE_GAP = Math.min(70, Math.floor((H - 70 - 44 - LINES_TOP) / Math.max(lineCount - 1, 1)));
  ctx.font = `700 36px 'Oswald', 'Bebas Neue', Impact, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lineCount; i++) {
    const lineY = LINES_TOP + i * LINE_GAP;
    const numLabel = `${String(i + 1).padStart(2, '0')}.`;
    ctx.fillStyle = '#100f0e';
    ctx.fillText(numLabel, MARGIN_X, lineY);
    const numW = ctx.measureText(numLabel).width;
    const writeStart = MARGIN_X + numW + 24;
    const writeEnd = W - MARGIN_X;
    const writeY = lineY + 44;
    ctx.fillRect(writeStart, writeY, writeEnd - writeStart, ANSWER_LINE_THICKNESS);
  }

  return canvas;
}

export async function downloadAnswersHandoutPng(lineCount = 10, filename = 'answers-handout.png') {
  const canvas = await renderAnswersHandoutCanvas(lineCount);
  const blob = await canvasToBlob(canvas);
  if (!blob) throw new Error('Failed to create handout blob');
  triggerDownload(blob, filename);
}

// Render "TEAM:" + an underline running from the end of the label to a fixed
// total width. Used by both the picture handout and the answers handout so
// the field looks identical on both surfaces.
function drawTeamField(ctx, x, y, totalWidth) {
  drawLabeledLine(ctx, 'TEAM:', x, y, totalWidth - measureLabel(ctx, 'TEAM:') - 14);
}

function drawLabeledLine(ctx, label, x, y, lineWidth) {
  ctx.fillStyle = '#100f0e';
  ctx.font = `700 32px 'Oswald', 'Bebas Neue', Impact, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x, y + 4);
  const labelW = ctx.measureText(label).width;
  const lineX = x + labelW + 14;
  const lineY = y + 40;
  ctx.fillRect(lineX, lineY, lineWidth, 2);
}

function measureLabel(ctx, label) {
  const prevFont = ctx.font;
  ctx.font = `700 32px 'Oswald', 'Bebas Neue', Impact, sans-serif`;
  const w = ctx.measureText(label).width;
  ctx.font = prevFont;
  return w;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
