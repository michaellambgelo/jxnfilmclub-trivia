// Game-level meta: title slide text, end slide text, and which optional
// slides to include. Mirrors rounds.js pattern (defaults + localStorage
// load/save) so the control window can edit and the display window picks up
// changes via broadcast.

import { PICTURE_FITS, PICTURE_ASPECTS } from './pictures.js';

const STORAGE_KEY = 'jxnfilmclub-trivia.meta';

// Picture Show settings (meta.pictureRound.mode / showSeconds / showPasses).
export const PICTURE_MODES = ['paper', 'screen', 'both'];
export const PICTURE_MODE_LABELS = {
  paper: 'Paper handout',
  screen: 'On screen (timed Picture Show)',
  both: 'Both — handout + on screen',
};
export const SHOW_SECONDS_MIN = 5;
export const SHOW_SECONDS_MAX = 180;
export const SHOW_PASSES_MAX = 3;

export const DEFAULT_META = {
  title: {
    eyebrow: "Presented by JXN Film Club",
    // Optional secondary line between the eyebrow and the edition name.
    // Blank by default — the design leads with the edition hero. Slides
    // uppercase via CSS, so store display case here.
    hero: "",
    edition: "Film Club Trivia",
    // Highlight line under the edition hero — the deck's standing subtitle.
    // Hosts can append an event number per night ("Reel Knowledge #2").
    tagline: "Reel Knowledge",
    hosts: "JXN Film Club",
    // Blank by default — the host fills the date in live, per event.
    footerDate: "",
  },
  end: {
    hero1: "Thanks For",
    hero2: "Watching.",
    subtitle: "Hosts Tallying Scores · Stand By",
  },
  // Next-event announcement slide (after End, before tiebreakers).
  nextEvent: {
    eyebrow: "Before You Go",
    hero: "Next Screening",
    date: "TBA",
    venue: "Jackson, MS",
    detail: "Same teams welcome back. Bring someone who argues about films.",
  },
  // Join-the-club promo slide (JoinClubSlide). `url` is shown as text AND is
  // what public/join-qr.svg encodes — if you change it, regenerate the QR
  // (see the comment above JoinClubSlide in slides.jsx) or the code and the
  // printed address will disagree, which nobody in the room can detect.
  joinClub: {
    eyebrow: "JXN Film Club",
    hero: "Join our digital clubhouse",
    url: "join.jxnfilm.club",
    detail: "Scan for screenings, the members directory, and what the club is watching. Membership is public — your email address is always private.",
  },
  show: {
    prize: true,
    costumeContest: false,
    pictureRound: true,
    tiebreakers: true,
    nextEvent: true,
    joinClub: true,
  },
  // House rules (RulesSlide). Items are { t: title, d: detail }; the Roman
  // numerals are derived from index at render, not stored. Fixed count — the
  // RuleGrid layout is a designed 2×2, so sanitizeItems pins the length.
  rules: {
    items: [
      { t: "Phones away", d: "Screens face down for the whole night. If you need yours, step out and sit the round out." },
      { t: "One sheet per team", d: "Every team writes on a single answer sheet — one team name on top, one set of answers turned in." },
      { t: "No looking it up", d: "Trust your memory and your teammates. Answers found on a screen cost your team the points." },
      { t: "Hosts' call is final", d: "The hosts settle every ruling on the night. No appeals, no rolling the tape back." },
    ],
  },
  // Prize slide copy (PrizeSlide) — every user-visible string on the slide.
  prize: {
    eyebrow: "Tonight's Prize",
    heading: "Grand Prize",
    banner: "★ WINNER TAKES ALL ★",
    amount: "CURATOR",
    award: "FOR A NIGHT",
    tagline: "The winning team picks the next screening.",
  },
  // Costume contest rules (CostumeContestSlide), same shape as `rules`.
  costume: {
    items: [
      { t: "Open to All Guests", d: "Any guest can enter — you don't need to be on a trivia team to win." },
      { t: "On-Theme Costumes", d: "Costumes must fit tonight's theme. Original concepts welcome if the connection is clear." },
      { t: "Hosts Decide", d: "The hosts will pick Best Overall. No appeals." },
      { t: "Individual Prize", d: "One winner takes home a separate side prize." },
    ],
  },
  // Final Wager rules (TiebreakerIntroSlide), same shape as `rules`.
  wager: {
    items: [
      { t: "Place Your Wager", d: "Each tied team secretly writes a wager from 0 up to their total score before the question is read." },
      { t: "One Question, One Answer", d: "Hosts read the prompt. Each team writes one answer on their sheet. No conferring." },
      { t: "Reveal & Adjust", d: "Correct answers add the wager to your score. Wrong answers subtract it. Highest total wins." },
      { t: "Up to Three Tries", d: "Still tied after wagers are settled? We play again with a new question — up to a maximum of three." },
    ],
  },
  pictureRound: {
    instruction: "Identify the film, the director, or the year.",
    // How picture cells render: "cover" crops images to fill, "contain"
    // letterboxes the whole image (e.g. a flag round). `aspect` is a key into
    // PICTURE_ASPECTS. Both are runtime-editable in the Picture Round card.
    fit: "cover",
    aspect: "316 / 220",
    // R1 opener slide copy (the trivia rounds' openers come from each round's
    // own title/subtitle/kicker; the picture round has no round object, so its
    // opener copy lives here).
    openerTitle: "Picture Round",
    openerSubtitle: "Ten stills, no titles. Played on paper — the hosts will hand it out.",
    openerKicker: "On Paper, Not On Screen",
    // Instruction-slide step cards. "{nextRound}" is replaced at render with
    // the display number of the first trivia round.
    steps: [
      { t: "Form your team", d: "Gather your group and pick a team name. Pun-heavy or on-theme is encouraged." },
      { t: "Collect your sheet", d: "One Round 1 picture sheet per team. Grab one from a host." },
      { t: "Identify the films", d: "Identify the film, the director, or the year. Write your answer next to each numbered still." },
      { t: "Return your answers", d: "Hand the sheet back to the hosts before Round {nextRound} begins." },
    ],
    // ── Picture Show (on-screen, timed picture round) ──────────────────────
    // "paper" = the handout-only round (the deck is exactly as before);
    // "screen" = the stills play on the display, one at a time, with a
    // countdown (PictureShowSlide is inserted after the instructions);
    // "both" = handout AND on-screen show. See PICTURE_MODES.
    mode: "paper",
    showSeconds: 30,   // seconds per image (clamped SHOW_SECONDS_MIN..MAX)
    showPasses: 2,     // times the whole set plays (clamped 1..SHOW_PASSES_MAX)
    showSound: true,   // tick on image change + ding at "Pencils down"
    // Screen-mode copy — used instead of openerSubtitle/openerKicker/steps when
    // mode is "screen" (paper/both use the paper copy above). Tokens, here and
    // in the paper copy: {nextRound} → first trivia round's number,
    // {seconds} → showSeconds, {passes} → "once" / "twice" / "three times".
    screenOpenerSubtitle: "Ten stills, no titles, up on the big screen — {seconds} seconds each. The reel runs {passes}.",
    screenOpenerKicker: "Eyes On The Screen",
    screenSteps: [
      { t: "Form your team", d: "Gather your group and pick a team name. Pun-heavy or on-theme is encouraged." },
      { t: "Watch the screen", d: "Each still holds for {seconds} seconds, and the whole reel runs {passes}." },
      { t: "Identify the films", d: "Next to each still's number, write the film, the director, or the year." },
      { t: "Return your answers", d: "Hand your answer sheet back to the hosts before Round {nextRound} begins." },
    ],
    // "both" mode: one extra line on the instructions slide (paper copy otherwise).
    bothNote: "The stills also play on the big screen — {seconds} seconds each, the whole reel {passes}.",
  },
  // Display tweaks — question-slide options.
  // App.jsx derives `tweaks = meta.display`; slides consume it unchanged.
  display: {
    showQNumbers: true,
    showTimer: true,
    timerSeconds: 60,
  },
};

function clone(meta) {
  // Sections holding arrays of objects need deep copies — a shallow spread
  // would let draft edits mutate DEFAULT_META through the shared items.
  return {
    title: { ...meta.title },
    end: { ...meta.end },
    nextEvent: { ...meta.nextEvent },
    joinClub: { ...meta.joinClub },
    show: { ...meta.show },
    rules: { items: meta.rules.items.map((it) => ({ ...it })) },
    prize: { ...meta.prize },
    costume: { items: meta.costume.items.map((it) => ({ ...it })) },
    wager: { items: meta.wager.items.map((it) => ({ ...it })) },
    pictureRound: {
      ...meta.pictureRound,
      steps: meta.pictureRound.steps.map((it) => ({ ...it })),
      screenSteps: meta.pictureRound.screenSteps.map((it) => ({ ...it })),
    },
    display: { ...meta.display },
  };
}

// Coerce an untrusted { t, d } item list to exactly defaults.length entries,
// per-key string-or-default. Fixed count on purpose: the RuleGrid / step-card
// layouts are designed around four items.
function sanitizeItems(parsed, defaults) {
  const arr = Array.isArray(parsed) ? parsed : [];
  return defaults.map((def, i) => ({
    t: typeof arr[i]?.t === 'string' ? arr[i].t : def.t,
    d: typeof arr[i]?.d === 'string' ? arr[i].d : def.d,
  }));
}

function pickString(value, fallback) {
  return typeof value === 'string' ? value : fallback;
}

// Finite number (numeric strings accepted), rounded and clamped; anything
// else (NaN, "abc", objects, null) degrades to the fallback.
function pickInt(value, fallback, lo, hi) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function pickBool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

// Merge persisted state with defaults so adding a new field doesn't blow up
// for users who saved meta before that field existed.
function withDefaults(parsed) {
  // `display` picks known keys explicitly (instead of a blind spread) so
  // saves from before the accent/showStars removal come back clean.
  const display = parsed?.display || {};
  return {
    title: { ...DEFAULT_META.title, ...(parsed?.title || {}) },
    end: { ...DEFAULT_META.end, ...(parsed?.end || {}) },
    nextEvent: { ...DEFAULT_META.nextEvent, ...(parsed?.nextEvent || {}) },
    joinClub: { ...DEFAULT_META.joinClub, ...(parsed?.joinClub || {}) },
    show: { ...DEFAULT_META.show, ...(parsed?.show || {}) },
    rules: { items: sanitizeItems(parsed?.rules?.items, DEFAULT_META.rules.items) },
    // Explicit string picks (matching display's strictness) so non-string
    // garbage in an imported bundle degrades to the default copy.
    prize: {
      eyebrow: pickString(parsed?.prize?.eyebrow, DEFAULT_META.prize.eyebrow),
      heading: pickString(parsed?.prize?.heading, DEFAULT_META.prize.heading),
      banner: pickString(parsed?.prize?.banner, DEFAULT_META.prize.banner),
      amount: pickString(parsed?.prize?.amount, DEFAULT_META.prize.amount),
      award: pickString(parsed?.prize?.award, DEFAULT_META.prize.award),
      tagline: pickString(parsed?.prize?.tagline, DEFAULT_META.prize.tagline),
    },
    costume: { items: sanitizeItems(parsed?.costume?.items, DEFAULT_META.costume.items) },
    wager: { items: sanitizeItems(parsed?.wager?.items, DEFAULT_META.wager.items) },
    // Explicit, validated pick (like `display`) so a renamed/removed preset
    // degrades to the default instead of breaking the cell layout.
    pictureRound: {
      // Renamed from `handoutInstruction` — it now drives both the handout and
      // the recap slide. Fall back to the old key so saved decks keep their text.
      instruction:
        parsed?.pictureRound?.instruction
        ?? parsed?.pictureRound?.handoutInstruction
        ?? DEFAULT_META.pictureRound.instruction,
      fit: PICTURE_FITS.includes(parsed?.pictureRound?.fit)
        ? parsed.pictureRound.fit
        : DEFAULT_META.pictureRound.fit,
      aspect: PICTURE_ASPECTS[parsed?.pictureRound?.aspect]
        ? parsed.pictureRound.aspect
        : DEFAULT_META.pictureRound.aspect,
      openerTitle: pickString(parsed?.pictureRound?.openerTitle, DEFAULT_META.pictureRound.openerTitle),
      openerSubtitle: pickString(parsed?.pictureRound?.openerSubtitle, DEFAULT_META.pictureRound.openerSubtitle),
      openerKicker: pickString(parsed?.pictureRound?.openerKicker, DEFAULT_META.pictureRound.openerKicker),
      steps: sanitizeItems(parsed?.pictureRound?.steps, DEFAULT_META.pictureRound.steps),
      // Picture Show — absent in pre-Picture-Show saves/bundles → defaults
      // (mode "paper", so those decks compose exactly as before).
      mode: PICTURE_MODES.includes(parsed?.pictureRound?.mode)
        ? parsed.pictureRound.mode
        : DEFAULT_META.pictureRound.mode,
      showSeconds: pickInt(parsed?.pictureRound?.showSeconds, DEFAULT_META.pictureRound.showSeconds, SHOW_SECONDS_MIN, SHOW_SECONDS_MAX),
      showPasses: pickInt(parsed?.pictureRound?.showPasses, DEFAULT_META.pictureRound.showPasses, 1, SHOW_PASSES_MAX),
      showSound: pickBool(parsed?.pictureRound?.showSound, DEFAULT_META.pictureRound.showSound),
      screenOpenerSubtitle: pickString(parsed?.pictureRound?.screenOpenerSubtitle, DEFAULT_META.pictureRound.screenOpenerSubtitle),
      screenOpenerKicker: pickString(parsed?.pictureRound?.screenOpenerKicker, DEFAULT_META.pictureRound.screenOpenerKicker),
      screenSteps: sanitizeItems(parsed?.pictureRound?.screenSteps, DEFAULT_META.pictureRound.screenSteps),
      bothNote: pickString(parsed?.pictureRound?.bothNote, DEFAULT_META.pictureRound.bothNote),
    },
    display: {
      showQNumbers: display.showQNumbers ?? DEFAULT_META.display.showQNumbers,
      showTimer: display.showTimer ?? DEFAULT_META.display.showTimer,
      timerSeconds: display.timerSeconds ?? DEFAULT_META.display.timerSeconds,
    },
  };
}

// ── Picture-round copy helpers ─────────────────────────────────────────────
const PASS_WORDS = { 1: 'once', 2: 'twice', 3: 'three times' };
export function passesWord(n) {
  return PASS_WORDS[n] || `${n} times`;
}

// Substitute the picture-round copy tokens. {passes} is a WORD ("twice") so
// copy reads naturally for every allowed pass count.
export function fillPictureTokens(str, { nextRound = 2, seconds, passes } = {}) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\{nextRound\}/g, String(nextRound))
    .replace(/\{seconds\}/g, String(seconds ?? DEFAULT_META.pictureRound.showSeconds))
    .replace(/\{passes\}/g, passesWord(passes ?? DEFAULT_META.pictureRound.showPasses));
}

// The copy set the deck should show for the current mode, tokens filled:
// screen → the screen* fields; paper/both → the paper fields (+ bothNote in
// "both"). Single source for App.jsx (opener), slides.jsx (instructions) and
// any future consumer, so the mode → copy mapping can't drift.
export function pictureCopyFor(pictureRound, nextRound = 2) {
  const pr = pictureRound || DEFAULT_META.pictureRound;
  const mode = PICTURE_MODES.includes(pr.mode) ? pr.mode : 'paper';
  const tok = { nextRound, seconds: pr.showSeconds, passes: pr.showPasses };
  const fill = (s) => fillPictureTokens(s, tok);
  const screen = mode === 'screen';
  const steps = (screen ? pr.screenSteps : pr.steps) || DEFAULT_META.pictureRound.steps;
  return {
    mode,
    openerSubtitle: fill(screen ? pr.screenOpenerSubtitle : pr.openerSubtitle),
    openerKicker: fill(screen ? pr.screenOpenerKicker : pr.openerKicker),
    steps: steps.map((it) => ({ t: fill(it.t), d: fill(it.d) })),
    note: mode === 'both' ? fill(pr.bothNote) : '',
  };
}

// Coerce an untrusted meta object (imported deck bundle) to the current
// schema — same merge/validation path persisted saves go through.
export function sanitizeMeta(parsed) {
  return withDefaults(parsed);
}

export function loadMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return withDefaults(JSON.parse(raw));
  } catch {
    // fall through to defaults
  }
  return clone(DEFAULT_META);
}

export function saveMeta(meta) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
}

export function resetMeta() {
  localStorage.removeItem(STORAGE_KEY);
}
