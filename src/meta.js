// Game-level meta: title slide text, end slide text, and which optional
// slides to include. Mirrors rounds.js pattern (defaults + localStorage
// load/save) so the control window can edit and the display window picks up
// changes via broadcast.

import { PICTURE_FITS, PICTURE_ASPECTS } from './pictures.js';

const STORAGE_KEY = 'jxnfilmclub-trivia.meta';

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
    pictureRound: { ...meta.pictureRound, steps: meta.pictureRound.steps.map((it) => ({ ...it })) },
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
    },
    display: {
      showQNumbers: display.showQNumbers ?? DEFAULT_META.display.showQNumbers,
      showTimer: display.showTimer ?? DEFAULT_META.display.showTimer,
      timerSeconds: display.timerSeconds ?? DEFAULT_META.display.timerSeconds,
    },
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
