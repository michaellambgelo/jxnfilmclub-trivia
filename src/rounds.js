// Round / question content. Default values + localStorage persistence.
// Edits made in the /control window save here; both windows read from here.

import { parseCsv } from './csv.js';

const STORAGE_KEY = 'pub-trivia-scaffold.rounds';
const TIEBREAKER_STORAGE_KEY = 'pub-trivia-scaffold.tiebreakers';

export const TIEBREAKER_COUNT = 3;

// Real general-knowledge content — this deck is hostable as-is. Themed forks
// (via /new-pub-trivia-deck) replace these arrays wholesale.
export const DEFAULT_ROUNDS = [
  {
    n: 2, title: "Warm-Up Round",
    subtitle: "A gentle start. Easy points to set the tone.",
    kicker: "10 Questions",
    questions: [
      { prompt: "What is the capital city of Australia?", answer: "Canberra" },
      { prompt: "How many sides does a hexagon have?", answer: "Six" },
      { prompt: "Which planet in our solar system is known as the Red Planet?", answer: "Mars" },
      { prompt: "What is the largest ocean on Earth?", answer: "The Pacific Ocean" },
      { prompt: "In which country would you find the Eiffel Tower?", answer: "France" },
      { prompt: "How many strings does a standard violin have?", answer: "Four" },
      { prompt: "What is the chemical symbol for gold?", answer: "Au" },
      { prompt: "What color do you get when you mix blue and yellow paint?", answer: "Green" },
      { prompt: "Which animal is known as the King of the Jungle?", answer: "The lion" },
      { prompt: "How many minutes are there in a full day?", answer: "1,440" },
    ],
  },
  {
    n: 3, title: "Food & Drink",
    subtitle: "Eat, drink, and answer accordingly.",
    kicker: "10 Questions",
    questions: [
      { prompt: "Which country gave the world the rice dish paella?", answer: "Spain" },
      { prompt: "What spirit is the traditional base of a mojito?", answer: "White rum" },
      { prompt: "Hummus is primarily made from which legume?", answer: "Chickpeas" },
      { prompt: "Which cheese is traditionally crumbled over a Greek salad?", answer: "Feta" },
      { prompt: "The Japanese spirit sake is brewed from which grain?", answer: "Rice" },
      { prompt: "Which nut is ground with sugar to make marzipan?", answer: "Almonds" },
      { prompt: "The Scoville scale measures the heat of what?", answer: "Chili peppers" },
      { prompt: "Which fruit is dried to make prunes?", answer: "Plums" },
      { prompt: "Miso paste is traditionally made by fermenting which bean?", answer: "Soybeans" },
      { prompt: "What is the Italian term for the appetizer course, literally meaning “before the meal”?", answer: "Antipasto" },
    ],
  },
  {
    n: 4, title: "Music & Pop Culture",
    subtitle: "Charts, screens, and stages.",
    kicker: "10 Questions",
    questions: [
      { prompt: "Which artist released “Thriller”, the best-selling album of all time?", answer: "Michael Jackson" },
      { prompt: "Freddie Mercury was the lead singer of which band?", answer: "Queen" },
      { prompt: "In “The Wizard of Oz”, what is the name of Dorothy’s dog?", answer: "Toto" },
      { prompt: "Which band recorded the 1977 album “Rumours”?", answer: "Fleetwood Mac" },
      { prompt: "Jazz legend Miles Davis is famous for playing which instrument?", answer: "The trumpet" },
      { prompt: "Daniel Craig first played James Bond in which 2006 film?", answer: "Casino Royale" },
      { prompt: "What is Lady Gaga’s real first name?", answer: "Stefani" },
      { prompt: "Which composer wrote the set of violin concertos known as “The Four Seasons”?", answer: "Antonio Vivaldi" },
      { prompt: "Which pop star’s fans are known as “Swifties”?", answer: "Taylor Swift" },
      { prompt: "Which 1994 film features the line “Life is like a box of chocolates”?", answer: "Forrest Gump" },
    ],
  },
  {
    n: 5, title: "Final Round",
    subtitle: "The hardest questions. For the bragging rights.",
    kicker: "10 Questions · Tiebreaker Material",
    questions: [
      { prompt: "What is the only metal that is liquid at room temperature?", answer: "Mercury" },
      { prompt: "In what year did the Berlin Wall fall?", answer: "1989" },
      { prompt: "What is the longest river in Asia?", answer: "The Yangtze" },
      { prompt: "Which element has the atomic number 1?", answer: "Hydrogen" },
      { prompt: "The Strait of Gibraltar separates Spain from which country?", answer: "Morocco" },
      { prompt: "What is the smallest country in the world by area?", answer: "Vatican City" },
      { prompt: "Who wrote the novel “One Hundred Years of Solitude”?", answer: "Gabriel García Márquez" },
      { prompt: "Which artist painted “The Persistence of Memory” — the one with the melting clocks?", answer: "Salvador Dalí" },
      { prompt: "What is the name of the deepest known point in Earth’s oceans?", answer: "Challenger Deep, in the Mariana Trench" },
      { prompt: "Which of the Seven Wonders of the Ancient World still stands today?", answer: "The Great Pyramid of Giza" },
    ],
  },
];

// Question shape is `string` (legacy) OR
// `{ prompt, answer?, audioUrl?, imageUrl?, videoUrl?, displayHint? }`.
// normalizeQuestion always returns the object form for rendering / editing.
// Storage keeps whichever form the user wrote so legacy decks don't bloat.
export function normalizeQuestion(q) {
  if (typeof q === 'string') return { prompt: q };
  return { ...q };
}

function cloneQuestion(q) {
  return typeof q === 'string' ? q : { ...q };
}

function clone(rounds) {
  return rounds.map((r) => ({ ...r, questions: r.questions.map(cloneQuestion) }));
}

export function loadRounds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to defaults
  }
  return clone(DEFAULT_ROUNDS);
}

export function saveRounds(rounds) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds));
}

export function resetRounds() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---- Tiebreakers ---------------------------------------------------------
// Sudden-death questions used after the final round when teams are tied.
// Numeric closest-wins prompts; editable via the control window's editor.
// Answers (for the host): 88 keys · 206 bones · 118 elements.

export const DEFAULT_TIEBREAKERS = [
  "How many keys are on a standard full-size piano?",
  "How many bones are in the adult human body?",
  "How many elements are on the periodic table?",
];

export function loadTiebreakers() {
  try {
    const raw = localStorage.getItem(TIEBREAKER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === TIEBREAKER_COUNT) return parsed;
    }
  } catch {
    // fall through
  }
  return [...DEFAULT_TIEBREAKERS];
}

export function saveTiebreakers(tiebreakers) {
  localStorage.setItem(TIEBREAKER_STORAGE_KEY, JSON.stringify(tiebreakers));
}

export function resetTiebreakers() {
  localStorage.removeItem(TIEBREAKER_STORAGE_KEY);
}

// Recap slide chunking — splits a round's questions into balanced chunks of
// at most 5 each. Returns [[start, end], ...] half-open ranges into the
// round's questions array. Generic across question-count so themed decks
// with different round lengths get sensible recap slides automatically.
export function recapSplitsFor(round) {
  const total = round.questions.length;
  if (total <= 5) return [[0, total]];
  if (total <= 10) {
    const half = Math.ceil(total / 2);
    return [[0, half], [half, total]];
  }
  const a = Math.ceil(total / 3);
  const b = Math.ceil((total - a) / 2);
  return [[0, a], [a, a + b], [a + b, total]];
}

// DEFAULT_ROUNDS numbers trivia rounds 2..5 because slot 1 is reserved for
// the Picture Round. When the host hides the picture round, shift the
// on-screen number down by 1 so players see rounds 1..4 with no gap.
export function displayRoundNumber(rN, pictureRoundShown) {
  return pictureRoundShown ? rN : rN - 1;
}

// ---- Round structure helpers ----------------------------------------------
// Hosts can add/remove rounds and questions at runtime. Internal round
// numbers always stay sequential starting at 2 (slot 1 = Picture Round);
// renumber after every structural edit.

export function renumberRounds(rounds) {
  return rounds.map((r, i) => ({ ...r, n: i + 2 }));
}

export function makeBlankRound() {
  // n is a placeholder — call renumberRounds after inserting.
  return { n: 0, title: 'New Round', subtitle: '', kicker: deriveKicker(1), questions: [''] };
}

export function deriveKicker(count) {
  return count === 1 ? '1 Question' : `${count} Questions`;
}

// Kickers matching this exact shape are treated as auto-generated and are
// re-derived when the question count changes. Anything custom (e.g.
// "10 Questions · Tiebreaker Material") is left alone.
export function isAutoKicker(kicker) {
  return /^\d+ Questions?$/.test(kicker || '');
}

// ---- Export / import ------------------------------------------------------
// The whole deck serializes to a single JSON file so a host can back up
// before clicking Reset, restore after a wipe, or move an event between
// machines. Version 2 adds the optional deck-bundle sections: `pictures`
// (the 10-slot picture-round buffer, data URLs included) and `meta` (full
// game meta). Version 1 files (questions + tiebreakers only) still import.

export const QUESTIONS_EXPORT_TYPE = 'pub-trivia-scaffold/questions';
export const QUESTIONS_EXPORT_VERSION = 2;

// `extras` carries the optional bundle sections: pass { pictures, meta } to
// export a complete deck as one file; omit for a questions-only export.
export function buildQuestionsExport(rounds, tiebreakers, extras = {}) {
  const payload = {
    type: QUESTIONS_EXPORT_TYPE,
    version: QUESTIONS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    rounds: clone(rounds),
    tiebreakers: [...tiebreakers],
  };
  if (extras.pictures) payload.pictures = extras.pictures;
  if (extras.meta) payload.meta = extras.meta;
  return payload;
}

export function parseQuestionsImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Expected a JSON object at the top level.');
  }
  if (data.type !== QUESTIONS_EXPORT_TYPE) {
    throw new Error('Not a Pub Trivia Scaffold questions export (wrong "type").');
  }
  if (!Array.isArray(data.rounds) || data.rounds.length === 0) {
    throw new Error('"rounds" must be a non-empty array.');
  }
  data.rounds.forEach((r, i) => {
    const where = `Round ${i + 1}`;
    if (!r || typeof r !== 'object') throw new Error(`${where}: not an object.`);
    if (typeof r.n !== 'number') throw new Error(`${where}: missing numeric "n".`);
    if (typeof r.title !== 'string') throw new Error(`${where}: missing "title".`);
    if (typeof r.subtitle !== 'string') throw new Error(`${where}: missing "subtitle".`);
    if (typeof r.kicker !== 'string') throw new Error(`${where}: missing "kicker".`);
    if (!Array.isArray(r.questions) || !r.questions.every((q) =>
      typeof q === 'string' ||
      (q && typeof q === 'object' && typeof q.prompt === 'string')
    )) {
      throw new Error(`${where}: "questions" must be an array of strings or { prompt, ... } objects.`);
    }
  });
  // Tiebreakers are optional: absent, null, or [] all mean "keep the ones the
  // deck already has" — the key is omitted from the result, and callers must
  // treat that as leave-alone. This matches parseQuestionsFullCsv, which
  // returns null for a CSV with no TB rows. A non-empty value still has to be
  // exactly TIEBREAKER_COUNT strings.
  const tbGiven = data.tiebreakers !== undefined && data.tiebreakers !== null &&
    !(Array.isArray(data.tiebreakers) && data.tiebreakers.length === 0);
  if (tbGiven) {
    if (!Array.isArray(data.tiebreakers) || !data.tiebreakers.every((t) => typeof t === 'string')) {
      throw new Error('"tiebreakers" must be an array of strings.');
    }
    if (data.tiebreakers.length !== TIEBREAKER_COUNT) {
      throw new Error(`"tiebreakers" must contain exactly ${TIEBREAKER_COUNT} entries.`);
    }
  }
  const result = {
    rounds: clone(data.rounds),
  };
  if (tbGiven) result.tiebreakers = [...data.tiebreakers];
  // Optional version-2 deck-bundle sections. Passed through loosely here —
  // the importer runs pictures through normalizePastes and meta through
  // sanitizeMeta, which coerce shape and drop garbage fields.
  if (data.pictures !== undefined) {
    if (!Array.isArray(data.pictures)) {
      throw new Error('"pictures" must be an array when present.');
    }
    result.pictures = data.pictures;
  }
  if (data.meta !== undefined) {
    if (!data.meta || typeof data.meta !== 'object' || Array.isArray(data.meta)) {
      throw new Error('"meta" must be an object when present.');
    }
    result.meta = data.meta;
  }
  return result;
}

// ---- CSV writer template + import ---------------------------------------
// Hosts hand `buildCsvTemplate()` to writers — either as a download for
// Excel/Numbers, or as the seed for the shared Google Sheets template
// (File → Import → Replace spreadsheet). Its header is the full-fidelity
// format, so a filled-in copy round-trips straight back through
// parseQuestionsFullCsv with answers intact.
//
// It deliberately does NOT emit the legacy `category,question` header: that
// format has no answer column, so a template seeded from it would route to
// the category-mapping modal and silently drop every answer.

export function buildCsvTemplate() {
  // Comment lines must stay in a single spreadsheet cell when the writer
  // opens the CSV in Sheets/Numbers/Excel. Any line that has a comma or a
  // quote gets wrapped + escaped so it doesn't spill into column B.
  const csvComment = (line) =>
    line.includes(',') || line.includes('"')
      ? `"${line.replace(/"/g, '""')}"`
      : line;
  // No comment line may contain a comma. A quoted comment cell defeats Google
  // Sheets' "Detect automatically" separator guess — it mis-splits the file and
  // the data rows land in a single column as literal text, which is unusable as
  // a writer template and won't re-import. Keeping every comment comma-free
  // means the file imports correctly whatever separator setting is chosen.
  const comments = [
    '# PUB TRIVIA — QUESTION TEMPLATE',
    '',
    '# Type your questions in the rows below the header.',
    '# Rows starting with # are ignored on import — leave them or delete them.',
    '# Only `round` and `question` are required. Other columns may be left blank.',
    '# `round` is a grouping key (1 / 2 / 3 …) — NOT the on-screen round number.',
    '#   Every row sharing a round number becomes one round. Rounds sort numerically.',
    '# `round_title` / `subtitle` / `kicker` are per-round — first non-empty one wins.',
    '#   Leave `kicker` blank and it is filled in automatically.',
    '# Put TB in the round column for sudden-death tiebreakers — exactly 3 or none.',
    '',
  ].map(csvComment);
  const body = [
    'round,round_title,question,answer,subtitle,kicker',
    '1,Warm-Up Round,What is the capital of France?,Paris,,',
    '1,,Which ocean is the largest?,Pacific,,',
    '2,Food & Drink,Which grain is used to make traditional malt whisky?,Barley,,',
    // Three TB rows, not one: the importer accepts exactly 3 tiebreakers or
    // none at all, so a template shipping a single example row would fail to
    // import the moment a writer left it in place. Tiebreakers are numeric
    // "closest guess wins" prompts — keep these as obvious placeholders rather
    // than real-looking venue facts, so nobody ships an invented answer.
    'TB,,EXAMPLE — replace: how many jellybeans are in the jar?,0,,',
    'TB,,EXAMPLE — replace: how many pages are in the menu?,0,,',
    'TB,,EXAMPLE — replace: closest guess wins (numeric answer),0,,',
    '',
  ];
  return [...comments, ...body].join('\n');
}

// Strip blank lines + `#` comment lines; returns parsed rows with the header
// row first. Shared by both CSV import formats.
//
// "Blank" means every cell is empty, not just a lone empty first cell: a
// spreadsheet pads every row out to the width of the widest one, so a blank
// spacer row exported from Google Sheets arrives as `,,,,,` — six empty cells,
// not one. Matching only single-cell blanks let those through, and the first
// one then got mistaken for the header row.
function cleanCsvRows(text) {
  return parseCsv(text)
    .filter((r) => !r.every((c) => (c || '').trim() === ''))
    .filter((r) => !(r[0] && r[0].trim().startsWith('#')));
}

export function parseQuestionsCsv(text) {
  const rows = cleanCsvRows(text);
  if (rows.length === 0) {
    throw new Error('CSV is empty after stripping comments and blank lines.');
  }
  const header = rows[0].map((c) => c.trim().toLowerCase());
  if (header[0] !== 'category' || header[1] !== 'question') {
    throw new Error('CSV header must be "category,question" on the first non-comment row.');
  }
  const buckets = {};
  const order = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const cat = (r[0] || '').trim();
    const q = (r[1] || '').trim();
    if (!cat || !q) continue;
    if (!(cat in buckets)) { buckets[cat] = []; order.push(cat); }
    buckets[cat].push(q);
  }
  if (order.length === 0) {
    throw new Error('No question rows found. Add at least one row with a category and a question.');
  }
  return { categories: order, buckets };
}

// ---- Full-fidelity CSV ----------------------------------------------------
// One row per question: `round,round_title,question,answer[,subtitle,kicker]`.
// Columns are resolved by header name, any order. The `round` column is the
// 1-based user-facing ordinal and is a grouping key only — rounds are sorted
// numerically, compacted, and assigned internal n = ordinal + 1 (CSV round 1
// → n: 2, since slot 1 is the Picture Round). `round` value "TB" groups the
// tiebreaker rows (exactly TIEBREAKER_COUNT when present).
// CSV cannot carry audioUrl/imageUrl/videoUrl/displayHint — JSON export is
// the lossless format.

export function parseQuestionsFullCsv(text) {
  const rows = cleanCsvRows(text);
  if (rows.length === 0) {
    throw new Error('CSV is empty after stripping comments and blank lines.');
  }
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const col = {
    round: header.indexOf('round'),
    title: header.indexOf('round_title'),
    question: header.indexOf('question'),
    answer: header.indexOf('answer'),
    subtitle: header.indexOf('subtitle'),
    kicker: header.indexOf('kicker'),
  };
  if (col.round === -1 || col.question === -1) {
    throw new Error('CSV header must include "round" and "question" columns.');
  }
  const groups = new Map();
  const tb = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (idx) => (idx === -1 ? '' : (row[idx] || '').trim());
    const question = get(col.question);
    if (!question) continue; // blank padding row
    const roundRaw = get(col.round);
    if (/^tb$/i.test(roundRaw)) {
      tb.push(question);
      continue;
    }
    const ordinal = Number(roundRaw);
    if (!Number.isInteger(ordinal) || ordinal < 1) {
      throw new Error(`Row ${i + 1}: "round" must be a positive whole number or "TB" (got "${roundRaw}").`);
    }
    if (!groups.has(ordinal)) {
      groups.set(ordinal, { title: '', subtitle: '', kicker: '', questions: [] });
    }
    const g = groups.get(ordinal);
    if (!g.title) g.title = get(col.title);
    if (!g.subtitle) g.subtitle = get(col.subtitle);
    if (!g.kicker) g.kicker = get(col.kicker);
    const answer = get(col.answer);
    g.questions.push(answer ? { prompt: question, answer } : question);
  }
  if (groups.size === 0) {
    throw new Error('No question rows found.');
  }
  if (tb.length > 0 && tb.length !== TIEBREAKER_COUNT) {
    throw new Error(`CSV has ${tb.length} "TB" rows; tiebreakers require exactly ${TIEBREAKER_COUNT}.`);
  }
  const ordinals = [...groups.keys()].sort((a, b) => a - b);
  const rounds = renumberRounds(ordinals.map((ord, i) => {
    const g = groups.get(ord);
    return {
      n: 0,
      title: g.title || `Round ${i + 1}`,
      subtitle: g.subtitle,
      kicker: g.kicker || deriveKicker(g.questions.length),
      questions: g.questions,
    };
  }));
  return { rounds, tiebreakers: tb.length === TIEBREAKER_COUNT ? tb : null };
}

export function parseImport(text, filename = '') {
  const lower = filename.toLowerCase();
  const startsObj = /^\s*\{/.test(text);
  const isJsonByName = lower.endsWith('.json');
  if ((isJsonByName || startsObj) && !lower.endsWith('.csv')) {
    return { kind: 'json', ...parseQuestionsImport(text) };
  }
  return parseCsvImport(text);
}

// Sniff the CSV header row: `round,...` → full-fidelity import;
// `category,question` → legacy writer-template mapping flow.
function parseCsvImport(text) {
  const rows = cleanCsvRows(text);
  if (rows.length === 0) {
    throw new Error('CSV is empty after stripping comments and blank lines.');
  }
  const header = rows[0].map((c) => c.trim().toLowerCase());
  if (header.includes('round') && header.includes('question')) {
    return { kind: 'csv-full', ...parseQuestionsFullCsv(text) };
  }
  return { kind: 'csv-categories', ...parseQuestionsCsv(text) };
}
