// Picture Show sound effects, synthesized with the Web Audio API — no audio
// files. A soft tick on each image change and a bell-style ding at "Pencils
// down". (Same idea as the barstool scaffold's bell.js, adapted.)
//
// Browsers keep an AudioContext suspended until the page gets a user gesture.
// App.jsx calls unlockAudio() from a one-shot pointerdown/keydown listener on
// the display window; the effects themselves are triggered by timers and
// broadcasts (not gestures), so until that unlock happens they stay silent.
// Nothing in here throws — a locked, missing, or broken audio stack is a no-op.

let ctx = null;

function ensureContext() {
  if (ctx) return ctx;
  try {
    const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!Ctor) return null;
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

// True once a gesture on this window has resumed the context, i.e. sounds
// triggered by the show will actually play. Gate on the real context state,
// not a "we asked once" latch — resume() can reject.
export function isAudioUnlocked() {
  return !!ctx && ctx.state === 'running';
}

export function unlockAudio() {
  const audio = ensureContext();
  if (!audio) return;
  try {
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch {
    // ignore — stays locked
  }
}

// Returns the running context, or null when sound can't play right now.
function runningContext() {
  const audio = ensureContext();
  if (!audio || audio.state !== 'running') return null;
  return audio;
}

// Short, quiet woodblock-ish click — audible in a quiet room, not over a song.
export function playTick() {
  const audio = runningContext();
  if (!audio) return;
  try {
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1320, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.18, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(g);
    g.connect(audio.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  } catch {
    // ignore
  }
}

// Inharmonic partials evoking a struck bell; sharp attack, ~1.5 s decay.
const BELL_PARTIALS = [
  { freq: 1047, gain: 0.42, decay: 1.6 },
  { freq: 1568, gain: 0.22, decay: 1.2 },
  { freq: 2093, gain: 0.16, decay: 0.9 },
  { freq: 3136, gain: 0.10, decay: 0.7 },
  { freq: 4186, gain: 0.05, decay: 0.5 },
];

export function playDing() {
  const audio = runningContext();
  if (!audio) return;
  try {
    const now = audio.currentTime;
    const master = audio.createGain();
    master.gain.value = 0.5;
    master.connect(audio.destination);
    BELL_PARTIALS.forEach(({ freq, gain, decay }) => {
      const osc = audio.createOscillator();
      const g = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(g);
      g.connect(master);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(gain, now + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.start(now);
      osc.stop(now + decay + 0.05);
    });
  } catch {
    // ignore
  }
}
