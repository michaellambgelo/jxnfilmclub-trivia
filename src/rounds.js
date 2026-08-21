// Round / question content. Default values + localStorage persistence.
// Edits made in the /control window save here; both windows read from here.

import { parseCsv } from './csv.js';

const STORAGE_KEY = 'jxnfilmclub-trivia.rounds';
const TIEBREAKER_STORAGE_KEY = 'jxnfilmclub-trivia.tiebreakers';

export const TIEBREAKER_COUNT = 3;

// Real film-trivia content — written for a room of JXN Film Club members and
// hostable as-is. Rounds are numbered 2..5 because slot 1 is the Picture Round.
export const DEFAULT_ROUNDS = [
  {
    n: 2, title: "Opening Frames",
    subtitle: "First shots, first lines, first frames. Points for knowing how a film introduces itself.",
    kicker: "10 Questions",
    questions: [
      { prompt: "Which 1977 film opens with the on-screen words “A long time ago in a galaxy far, far away”?", answer: "Star Wars" },
      { prompt: "Which 1975 Steven Spielberg film opens with a nighttime beach party and a young woman going for a swim alone?", answer: "Jaws" },
      { prompt: "Which 1994 Quentin Tarantino film opens with two robbers nicknamed Pumpkin and Honey Bunny deciding to hold up the diner they are sitting in?", answer: "Pulp Fiction" },
      { prompt: "“I believe in America” is the first line spoken in which 1972 film?", answer: "The Godfather" },
      { prompt: "Which 1950 Billy Wilder film opens on a dead screenwriter floating in a Hollywood swimming pool, narrating his own story?", answer: "Sunset Boulevard" },
      { prompt: "Which 1968 Stanley Kubrick film opens with a long wordless sequence titled “The Dawn of Man”?", answer: "2001: A Space Odyssey" },
      { prompt: "Saul Bass designed the sliding, fracturing grey bars of the title sequence for which 1960 Alfred Hitchcock film?", answer: "Psycho" },
      { prompt: "Which 1968 Sergio Leone western opens with three gunmen waiting out a long, near-silent scene at a desert railway station?", answer: "Once Upon a Time in the West" },
      { prompt: "Which 1958 Orson Welles film opens with a celebrated unbroken crane shot following a car with a bomb in its trunk toward the Mexican border?", answer: "Touch of Evil" },
      { prompt: "Which 1929 short film by Luis Buñuel and Salvador Dalí opens with a razor slicing a woman’s eye?", answer: "Un Chien Andalou" },
    ],
  },
  {
    n: 3, title: "Behind the Camera",
    subtitle: "The people whose names run before and after the cast. Directors, shooters, cutters.",
    kicker: "10 Questions",
    questions: [
      { prompt: "Which director made Jaws, E.T. the Extra-Terrestrial and Schindler’s List?", answer: "Steven Spielberg" },
      { prompt: "Which Japanese director made Seven Samurai, Rashomon and Ran?", answer: "Akira Kurosawa" },
      { prompt: "Which director won both Best Director and Best Picture for Parasite?", answer: "Bong Joon-ho" },
      { prompt: "Editor Thelma Schoonmaker has cut nearly every feature by which director since Raging Bull?", answer: "Martin Scorsese" },
      { prompt: "Which cinematographer shot Blade Runner 2049, Sicario and No Country for Old Men?", answer: "Roger Deakins" },
      { prompt: "Which director made Cléo from 5 to 7 and The Gleaners and I, and is often called the grandmother of the French New Wave?", answer: "Agnès Varda" },
      { prompt: "Which Taiwanese-born director won the Best Director Oscar for both Brokeback Mountain and Life of Pi?", answer: "Ang Lee" },
      { prompt: "Alfred Hitchcock was nominated five times for Best Director. How many of those did he win?", answer: "None — he never won a competitive directing Oscar" },
      { prompt: "Which cinematographer shot Citizen Kane, and is credited with its deep-focus photography?", answer: "Gregg Toland" },
      { prompt: "The 2022 Sight and Sound critics’ poll named which film the greatest of all time, putting a woman director at number one for the first time?", answer: "Jeanne Dielman, 23 quai du Commerce, 1080 Bruxelles" },
    ],
  },
  {
    n: 4, title: "Needle Drops",
    subtitle: "Scores, songs and cues — the half of a film you can hear with your eyes shut.",
    kicker: "10 Questions",
    questions: [
      { prompt: "Which composer wrote the two-note theme for Jaws as well as the scores for Star Wars, Jurassic Park and Schindler’s List?", answer: "John Williams" },
      { prompt: "Céline Dion’s “My Heart Will Go On” is the theme song from which 1997 film?", answer: "Titanic" },
      { prompt: "The Bee Gees’ “Stayin’ Alive” soundtracks the opening strut of which 1977 John Travolta film?", answer: "Saturday Night Fever" },
      { prompt: "Simon and Garfunkel’s “Mrs. Robinson” features in which 1967 Mike Nichols film?", answer: "The Graduate" },
      { prompt: "Which Italian composer scored The Good, the Bad and the Ugly, Once Upon a Time in America and The Hateful Eight?", answer: "Ennio Morricone" },
      { prompt: "Wagner’s “Ride of the Valkyries” blares from helicopter loudspeakers during the beach assault in which 1979 Francis Ford Coppola film?", answer: "Apocalypse Now" },
      { prompt: "Which Stealers Wheel song plays on the radio during the ear-cutting scene in Reservoir Dogs?", answer: "“Stuck in the Middle with You”" },
      { prompt: "Which composer scored Spirited Away, My Neighbor Totoro and Princess Mononoke for Studio Ghibli?", answer: "Joe Hisaishi" },
      { prompt: "Which composer wrote the shrieking strings of the Psycho shower scene, and later scored Taxi Driver?", answer: "Bernard Herrmann" },
      { prompt: "Which musician wrote the spare slide-guitar score for Wim Wenders’ 1984 film Paris, Texas?", answer: "Ry Cooder" },
    ],
  },
  {
    n: 5, title: "Final Reel",
    subtitle: "Endings, last lines and closing shots. The hardest round — spoilers throughout.",
    kicker: "10 Questions · Tiebreaker Material",
    questions: [
      { prompt: "“Louis, I think this is the beginning of a beautiful friendship” is the last line of which 1942 film?", answer: "Casablanca" },
      { prompt: "Which 1968 science-fiction film ends with its hero finding the Statue of Liberty half-buried on a beach?", answer: "Planet of the Apes" },
      { prompt: "Which 1999 M. Night Shyamalan film ends with the reveal that Malcolm Crowe has been dead the whole time?", answer: "The Sixth Sense" },
      { prompt: "Which 1974 Roman Polanski film ends with Evelyn Mulwray shot dead at the wheel of her car, a horn blaring, as Noah Cross leads her daughter away?", answer: "Chinatown" },
      { prompt: "“Nobody’s perfect” is the last line of which 1959 Billy Wilder comedy?", answer: "Some Like It Hot" },
      { prompt: "Which 1941 film ends with a sled burning in a furnace, revealing what Rosebud was?", answer: "Citizen Kane" },
      { prompt: "Which 1980 Stanley Kubrick film ends on a slow push into a 1921 ballroom photograph?", answer: "The Shining" },
      { prompt: "Which 1959 François Truffaut film ends on a freeze-frame of a boy’s face after he runs to the sea?", answer: "The 400 Blows — also accept Les Quatre Cents Coups" },
      { prompt: "Which 1948 Vittorio De Sica film ends with a humiliated father and his son walking away hand in hand into the crowd?", answer: "Bicycle Thieves — also accept The Bicycle Thief (Ladri di biciclette)" },
      { prompt: "Which 1962 Chris Marker short, told almost entirely in still photographs and later remade by Terry Gilliam as 12 Monkeys, ends with its traveller witnessing his own death?", answer: "La Jetée" },
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
// Answers (for the host): 11 Oscars · 35 years · 175 minutes.

export const DEFAULT_TIEBREAKERS = [
  "How many Academy Awards did Ben-Hur win?",
  "How many years separate the release of Blade Runner and its sequel Blade Runner 2049?",
  "How long is the theatrical cut of The Godfather, in minutes?",
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

export const QUESTIONS_EXPORT_TYPE = 'jxnfilmclub-trivia/questions';
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
    throw new Error('Not a JXN Film Club Trivia questions export (wrong "type").');
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
    '# JXN FILM CLUB TRIVIA — QUESTION TEMPLATE',
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
