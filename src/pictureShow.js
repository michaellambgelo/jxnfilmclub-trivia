// Picture Show state machine — the timed, on-screen picture round.
//
// Pure module (no React, no DOM, no import.meta) so it can be exercised from
// plain Node. PictureShowSlide owns one state object and feeds it actions;
// every action takes a context `{ count, showMs, gapMs, passes, now }`.
//
// Phases: 'ready' (waiting for the host's Start) → 'showing' (one image on
// screen, counting down) → 'gap' (the short "Second look" card between
// passes) → … → 'done' ("Pencils down", holds until the host clicks Next).
//
// Drift-free timing: a running segment stores an absolute deadline `endAt`
// (ms timestamp). A natural advance chains off the PREVIOUS deadline
// (`endAt += segmentMs`), never off `now`, so timer jitter and slow renders
// can't accumulate. `tick` loops, so a throttled background tab catches up to
// the right image instead of lagging. Pause stores `remaining`; resume
// re-derives `endAt = now + remaining`. Manual jumps (Skip/Back) start the new
// segment fresh at `now`.

export const SHOW_GAP_MS = 5000;

export function initialShow() {
  return { phase: 'ready', pass: 1, pos: 0, endAt: 0, remaining: 0, paused: false };
}

const isRunning = (s) => s.phase === 'showing' || s.phase === 'gap';
const segmentMs = (phase, ctx) => (phase === 'gap' ? ctx.gapMs : ctx.showMs);

// Set up a freshly entered segment starting at `now`, preserving pause.
function fresh(s, ctx) {
  if (!isRunning(s)) return { ...s, endAt: 0, remaining: 0, paused: false };
  const ms = segmentMs(s.phase, ctx);
  return s.paused
    ? { ...s, endAt: 0, remaining: ms }
    : { ...s, endAt: ctx.now + ms, remaining: 0 };
}

// The segment that follows `s` in the running order (position only — the
// caller decides the deadline).
function after(s, ctx) {
  if (s.phase === 'showing') {
    if (s.pos < ctx.count - 1) return { ...s, pos: s.pos + 1 };
    if (s.pass < ctx.passes) return { ...s, phase: 'gap' };
    return { ...s, phase: 'done', paused: false };
  }
  if (s.phase === 'gap') return { ...s, phase: 'showing', pass: s.pass + 1, pos: 0 };
  return s;
}

// The segment that precedes `s`. Back from the very first image just restarts
// it; back from the gap/done returns to the last image of the pass just played.
function before(s, ctx) {
  const last = Math.max(0, ctx.count - 1);
  if (s.phase === 'showing') {
    if (s.pos > 0) return { ...s, pos: s.pos - 1 };
    if (s.pass > 1) return { ...s, phase: 'gap', pass: s.pass - 1, pos: last };
    return s;
  }
  if (s.phase === 'gap' || s.phase === 'done') return { ...s, phase: 'showing', pos: last };
  return s;
}

// Keep a state valid after the image list or settings change mid-show.
function clampToCtx(s, ctx) {
  let next = s;
  if (next.pass > ctx.passes) next = { ...next, pass: ctx.passes };
  if (next.pos > ctx.count - 1) next = { ...next, pos: Math.max(0, ctx.count - 1) };
  // A gap with no pass left after it (passes lowered mid-show) is the end.
  if (next.phase === 'gap' && next.pass >= ctx.passes) next = { ...next, phase: 'done', paused: false, endAt: 0, remaining: 0 };
  return next;
}

export function reduceShow(state, action, ctx) {
  // No images → nothing can run; hold on ready (the slide shows its empty state).
  if (ctx.count < 1) return initialShow();
  const s = clampToCtx(state, ctx);
  switch (action.type) {
    case 'reset':
      return initialShow();
    case 'start':
      if (s.phase !== 'ready') return s;
      return fresh({ ...s, phase: 'showing', pass: 1, pos: 0, paused: false }, ctx);
    case 'toggle':
      if (s.phase === 'ready') return reduceShow(s, { type: 'start' }, ctx);
      if (!isRunning(s)) return s;
      if (s.paused) return { ...s, paused: false, endAt: ctx.now + s.remaining, remaining: 0 };
      return { ...s, paused: true, remaining: Math.max(0, s.endAt - ctx.now), endAt: 0 };
    case 'step': {
      if (s.phase === 'ready') return s;
      const delta = action.delta < 0 ? -1 : 1;
      if (delta > 0 && s.phase === 'done') return s;
      const moved = delta > 0 ? after(s, ctx) : before(s, ctx);
      return fresh(moved, ctx);
    }
    case 'adjust': {
      if (!isRunning(s)) return s;
      const d = (Number(action.seconds) || 0) * 1000;
      // Floor at 1 s so −10 shortens the image instead of silently skipping it.
      if (s.paused) return { ...s, remaining: Math.max(1000, s.remaining + d) };
      return { ...s, endAt: Math.max(ctx.now + 1000, s.endAt + d) };
    }
    case 'tick': {
      if (!isRunning(s) || s.paused) return s;
      let next = s;
      let guard = 0;
      while (isRunning(next) && ctx.now >= next.endAt && guard++ < 1000) {
        const prevEnd = next.endAt;
        next = after(next, ctx);
        if (isRunning(next)) next = { ...next, endAt: prevEnd + segmentMs(next.phase, ctx) };
        else next = { ...next, endAt: 0, remaining: 0 };
      }
      return next;
    }
    default:
      return s;
  }
}

// Whole seconds left in the current segment (what the countdown shows).
export function secondsLeft(s, now) {
  if (!isRunning(s)) return 0;
  const ms = s.paused ? s.remaining : s.endAt - now;
  return Math.max(0, Math.ceil(ms / 1000));
}
