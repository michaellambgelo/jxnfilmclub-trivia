# CLAUDE.md

The source-of-truth for browser-only **pub trivia** presentation decks — and a hostable **General Trivia** deck in its own right (real general-knowledge questions, "GENERAL TRIVIA" branding). Originally forked from `~/Workspace/star-wars-trivia-game` (handed off from Claude Design as 4 standalone files; migrated to Vite + ES modules).

**Cloned by `/new-pub-trivia-deck`** to produce themed sibling decks at `~/Workspace/<slug>-trivia`. Themed events get a sibling; general-knowledge nights can run straight from this repo.

## Stack

- React 18 + JSX (no TypeScript) + Vite 5
- Custom `<deck-stage>` web component (vanilla JS) for slide layout, nav, scaling, print
- ESLint 9 (flat config)

## Commands

```bash
npm run dev      # Vite dev (localhost:5173) — runs the General Trivia deck standalone
npm run build    # production bundle
npm run preview  # serve built bundle
npm run lint     # ESLint
```

## Two windows: display + control

The app has two views, switched by URL hash:

- `/` (or any non-`#/control` hash) → `App.jsx` (display)
- `/#/control` → `ControlApp.jsx` (editor + presenter view)

`src/main.jsx` reads `window.location.hash` and renders the appropriate root. A `hashchange` listener triggers full reload so each mode boots cleanly.

The two windows talk via `BroadcastChannel` (channel name `pub-trivia-scaffold` in the scaffold; the skill renames this to `<slug>-trivia` per cloned sibling so multiple decks can run side-by-side without messages crossing). See `src/broadcast.js`. Message types in use:

| type             | direction        | payload                                               |
|------------------|------------------|-------------------------------------------------------|
| `rounds:update`  | control → display | full rounds array                                     |
| `nav:next`       | control → display | —                                                     |
| `nav:prev`       | control → display | —                                                     |
| `nav:goto`       | control → display | slide index                                           |
| `slidechange`    | display → control | `{ index, total, label }`                             |
| `pictures:update`| control → display | full pastes array (10 items, each `{ dataUrl, caption, position: {x, y} }`) |
| `tiebreakers:update`| control → display | array of 3 tiebreaker prompt strings |
| `meta:update`    | control → display | full meta object (`{ title, end, nextEvent, show, pictureRound, display }`) |
| `timer:toggle`   | control → display | — (toggles paused on active question slide)           |
| `timer:reset`    | control → display | — (resets to full duration)                           |
| `timer:adjust`   | control → display | delta seconds (+10, -10)                              |
| `timer:state`    | display → control | `{ enabled, seconds, paused }`                        |
| `sync:request`   | control → display | — (control just mounted; display re-emits state)      |

## Architecture notes

- `src/main.jsx` imports `./deck-stage.js` for side effect — this registers the `<deck-stage>` custom element before React mounts.
- `src/App.jsx` composes the slide list, holds a `useRef` on the `<deck-stage>`, listens for nav/content broadcasts, and forwards `slidechange` events to the control window. Per-question `total` is `r.questions.length` (not hardcoded), so themed siblings with different question counts work without engine changes.
- `src/ControlApp.jsx` has three tabs (Presenter, Edit Questions, Picture Round). Editor edits are buffered (`dirty` flag) and only push to display when the user clicks Save. The Edit Questions tab also edits **structure**: per-question "×" remove buttons (disabled at 1 question), "+ Add question" per round, "Remove round" (confirm dialog, disabled at 1 round), and "+ Add round". Structural edits run `renumberRounds` so `n` stays sequential from 2, and re-derive the round kicker when it matches the auto pattern (`isAutoKicker` → `deriveKicker`, e.g. "10 Questions" → "11 Questions"); custom kickers like "10 Questions · Tiebreaker Material" are never touched. Round card titles (and the remove-round confirm + CSV mapping modal slots) mirror the display numbering via `roundCardTitle`: with the picture round shown they read "Round 2"; with it hidden, "Round 1 (R2)" — display number first, internal `n` in parens (internal `n` is what `ROUND_ACCENTS` and the CSV mapping key off).
- `src/rounds.js` — `DEFAULT_ROUNDS` (4 rounds × 10 **real general-knowledge questions** in `{ prompt, answer }` form, `n: 2..5` because slot 1 is reserved for the Picture Round) + `loadRounds`/`saveRounds`/`resetRounds`. Persists to `localStorage` under `pub-trivia-scaffold.rounds`. Also exports `DEFAULT_TIEBREAKERS` (3 real numeric sudden-death prompts; host answers in a comment above the array) + `loadTiebreakers`/`saveTiebreakers`/`resetTiebreakers` (key `pub-trivia-scaffold.tiebreakers`). `normalizeQuestion(q)` returns the object form `{ prompt, answer?, audioUrl?, imageUrl?, videoUrl?, displayHint? }`. `recapSplitsFor` is generic across question count: `<=5` → 1 chunk, `<=10` → 2 chunks, `>10` → 3 chunks. `displayRoundNumber(rN, pictureRoundShown)` shifts trivia rounds down by 1 when the picture round is hidden, so players see 1..4 instead of 2..5 with no gap. Structure helpers: `renumberRounds(rounds)` (n = index + 2), `makeBlankRound()`, `deriveKicker(count)`, `isAutoKicker(kicker)` (`/^\d+ Questions?$/`).
- **Import/export** (`src/rounds.js` + `src/csv.js`): three formats, all through `parseImport(text, filename)`:
  - **JSON deck bundle** (lossless): `buildQuestionsExport`/`parseQuestionsImport`, type `'pub-trivia-scaffold/questions'`, version 2. Validates round shape; tiebreakers are **optional** — absent/`null`/`[]` all mean "keep the deck's current ones" (the key is omitted from the parse result and ControlApp only overwrites the draft when it's present), while a non-empty value must be exactly `TIEBREAKER_COUNT` (3) strings. Version 2 adds optional `pictures` (the 10-slot paste buffer, data URLs included) and `meta` (full game meta) sections — `buildQuestionsExport(rounds, tiebreakers, { pictures, meta })`; version-1 files (questions only) still import. On import, rounds/tiebreakers/meta land in the editor drafts (dirty → Save & Push), while pictures commit immediately through `normalizePastes` (they have no draft stage); imported meta is coerced via `sanitizeMeta` (the exported `withDefaults` path). The "Export Deck" button downloads the full bundle — one file moves the whole event between machines. An empty paste buffer exports **no `pictures` section at all** (never ten null cells); when at least one image exists the full 10-slot array ships, because null entries are positional (they keep images in the right cells). Importing a bundle without a `pictures` section leaves the machine's existing pictures untouched.
  - **Full-fidelity CSV (import-only)**: `parseQuestionsFullCsv`. Header row `round,round_title,question,answer,subtitle,kicker` — columns resolved by name, any order; only `round` + `question` required. The `round` column is the 1-based user-facing ordinal and a grouping key only: rounds are sorted numerically, compacted, and assigned internal `n = ordinal + 1` (CSV round 1 → `n: 2`). Round value `TB` groups tiebreaker rows (exactly 3 when present; absent → existing tiebreakers kept). First non-empty `round_title`/`subtitle`/`kicker` per round wins; missing kicker → `deriveKicker(count)`. Empty answer cell → plain-string question. There is no CSV export — the deck bundle is the only export; `src/csv.js` is parse-only.
  - **Legacy writer-template CSV (import-only)**: `parseQuestionsCsv` still accepts the old `category,question` format; on import the host maps discovered categories onto rounds via `CsvImportModal`. `parseImport` sniffs the CSV header to dispatch: header containing `round` → `kind: 'csv-full'`; `category,question` → `kind: 'csv-categories'`. **`buildCsvTemplate` no longer emits this format** — the "CSV Template" download now uses the full-fidelity header so a filled-in copy round-trips with answers intact (the legacy header has no answer column and silently dropped them). It ships 3 `TB` example rows (not 1 — the importer takes exactly 3 tiebreakers or none). **No comment line in the template may contain a comma or quote**: a quoted cell defeats Google Sheets' "Detect automatically" separator guess and collapses every data row into column A.
  - **Google Sheets template button** (`src/ControlApp.jsx`): `SHEET_TEMPLATE_ID` holds the *file ID* of a group's shared question-writing sheet (from the `/d/<ID>/edit` URL, **not** a `2PACX-…` publish token); the button links to `/d/<ID>/copy`, which forces Google's "Make a copy" dialog so each writer owns a private copy. The sheet must be shared "Anyone with the link → Viewer" — Publish-to-web does not work here. **Per-group, not per-theme**: the scaffold ships `''` (button hidden); each group builds its own template (seed it from the CSV Template download) and sets the ID. All import sources funnel through `applyImport(text, filename)` in `EditorPanel`, and full-CSV imports report what landed via `describeImport`.
  - `src/csv.js` is the dependency-free parse layer (quoted fields, embedded commas/newlines, doubled quotes, BOM strip).
- `src/meta.js` — game-level meta (`title` text fields, `end` text fields, `nextEvent` fields for the next-event announcement slide — `eyebrow`/`hero`/`date`/`venue`/`detail`, `show` toggles for prize / costume / pictureRound / tiebreakers / nextEvent, a `pictureRound` section (`handoutInstruction` string + `fit` `'cover'`|`'contain'` + `aspect` — a key into `PICTURE_ASPECTS` in `pictures.js`, e.g. `'316 / 220'`/`'3 / 2'`/`'2 / 1'`/`'1 / 1'`), and a `display` section carrying the question-slide options: `showQNumbers`, `showTimer`, `timerSeconds`). `loadMeta`/`saveMeta`/`resetMeta` (key `pub-trivia-scaffold.meta`). `loadMeta` merges persisted state with `DEFAULT_META` (per-section spread in `withDefaults`) so adding a new field doesn't break older saves; the `display` **and** `pictureRound` merges are explicit picks of known keys (pictureRound's `fit`/`aspect` are validated against `PICTURE_FITS`/`PICTURE_ASPECTS` and degrade to default if invalid), so stale/garbage fields are stripped on load. App.jsx loads on mount + listens for `meta:update` and derives `const tweaks = meta.display` (slides still take a `tweaks` prop) and passes `meta.pictureRound` to `PictureRoundRecap`. ControlApp.jsx edits buffer-and-save like rounds and broadcasts on save — the **Display** card (Edit Questions tab) edits `meta.display`; the **Picture Round** card edits `meta.pictureRound` (handout instruction + fit/aspect), which PicturesPanel uses for the editor preview and the exported PNG. When `meta.show.pictureRound` is off, the Picture Round **tab** is disabled (and auto-falls-back to Presenter if open) and the Picture Round **card** in the Edit Questions tab is dimmed + non-interactive (keyed on `draftMeta.show.pictureRound`, so it reacts live as the toggle flips). App.jsx conditionally composes Prize/Costume/PictureRound/NextEvent/Tiebreakers slides based on `meta.show`; if you add a new toggle, also update `buildSlideOutline()` in ControlApp.jsx to match (the `display` tweaks don't affect slide composition).
- `src/pictures.js` — picture round data layer. **`ingestImage(blob)`** is the paste/drop entry point: it downscales to a 1600px long edge and re-encodes as JPEG q0.85 (alpha flattened onto white; falls back to the original bytes only if decoding fails), so ten photos fit `localStorage`'s ~5MB quota with room to spare — never store raw `FileReader` output. **`savePastes` returns a boolean** instead of throwing on quota; `commitPastes` in ControlApp broadcasts *before* saving so the display keeps the image for the session even when persistence fails, and panels surface the failure as a status warning. `DEFAULT_PICTURE_ITEMS` still points to `/images/picture-NN.png` as a silent static fallback (decks that commit images there get them served; pasted data URLs always win) — but the paste buffer + deck-bundle export is the supported workflow, not saving files into the repo. `loadPastes`/`clearPastes`/`normalizePastes` manage the 10-slot buffer (`pub-trivia-scaffold.pictures`); `normalizePastes` coerces arbitrary arrays (old saves, imported bundles) to exactly 10 well-shaped entries. Paste shape: `{ dataUrl, caption, position: { x, y } }` where `x`/`y` are 0-100 percentages (default 50/50 = centered, matches `object-position: center`). `mergeItems(pastes)` resolves what the display actually renders: pasted data URLs win over disk paths, position falls back to centered. Also the **single source of truth for cell geometry**: `PICTURE_ASPECTS` (keyed by the `meta.pictureRound.aspect` string → `{ w, h, label }`), `DEFAULT_ASPECT`, `PICTURE_FITS`, and `resolveAspect(aspect)` (→ `{ css, w, h }`, degrades unknown values to default). slides.jsx, handout.js, and ControlApp.jsx all consume `resolveAspect` so the display slide, canvas handout, and editor preview crop/letterbox identically (previously the editor preview was hardcoded `1 / 1` while display/handout were `316 / 220` — now unified). `pictureGridLayout({ aspect, cols, rows, contentW, availH, gap, cellExtra })` sizes the grid honoring BOTH the column width and the vertical budget, so tall aspects (the `1 / 1` square) shrink + center instead of overflowing the 2-row grid — slides.jsx and handout.js both call it (slide passes `cellExtra: 0`; handout passes the answer-area height) and center the returned `gridW`.
- `src/handout.js` — pure-canvas PNG renderer for the picture round handout. White background, dark borders, "PICTURE ROUND" title, no recap eyebrow / no FooterBar. Geometry constants (margins, gap, grid bounds, answer-area height) mirror the slide so the same image crops the same way in both surfaces; the photo-box aspect is derived from `resolveAspect(opts.aspect)` rather than a hardcoded constant. `renderHandoutCanvas`/`copyHandoutToClipboard`/`downloadHandoutPng` take an `opts = { fit, aspect }` (defaults reproduce the historical cover/316:220 layout). In `cover` it honors `position` via the same percentage math as `object-position`; in `contain` it scales-to-fit, centers, and ignores `position`. Exports `copyHandoutToClipboard`, `downloadHandoutPng`, `downloadAnswersHandoutPng(lineCount)` (generic numbered answer sheet; PicturesPanel passes the longest round's question count, min 10, and the line gap compresses to fit). No html2canvas dependency.
- The `<img>` cells in `PictureRoundRecap` use an `onError` fallback (`PictureRecapCell` in `slides.jsx`) so missing disk-path images degrade to the "PHOTO" placeholder instead of a broken-image icon. They apply `objectPosition: ${x}% ${y}%` from the merged item position.
- `PictureCell` in `ControlApp.jsx` implements drag-to-pan via pointer events: pointer-down records the starting `position`, pointer-move translates pixel deltas into objectPosition percentage deltas (inverted — drag right reveals more of the right edge of the source). During the drag the position lives in local `livePos` state; the persist + broadcast commit fires **once on pointer-up** (committing per pointer-move would re-stringify all ten data URLs into localStorage at pointer-event rate). A 3px movement threshold prevents accidental drags from a click. The ↺ reset button only appears when position differs from 50/50.
- `src/QuestionSlide` (in `slides.jsx`): tracks `isActive` from `slidechange` events, holds local `seconds` + `paused` state. Only the active slide responds to timer broadcasts and emits `timer:state`. All mounted question slides see the broadcasts but only the active one acts.
- Display tweaks (question numbers, timer toggle/seconds) are persisted in `meta.display` and edited from the **Display** card in ControlApp's Edit Questions tab — they buffer-and-save and broadcast via `meta:update` like every other meta field. The runtime accent picker and ambient-backdrop toggle were removed: the global accent is now the `DEFAULT_ACCENT` code constant in App.jsx, and the `BackdropField` starfield component was deleted outright. This scaffold no longer depends on Claude Design (the old `tweaks-panel.jsx`, floating host panel, `useTweaks` postMessage protocol, and EDITMODE markers are long gone).
- `DEFAULT_ACCENT` + `ROUND_ACCENTS` (in `App.jsx`, near the top) are the accent controls. `DEFAULT_ACCENT` is the global accent (an `ACCENTS` key; themed forks set their signature color here). `ROUND_ACCENTS` is a per-round rotation hook: empty map in the scaffold; themed forks fill it in to map round number `n` → ACCENTS key. The `accentFor(n, global)` helper degrades to the global accent for any round not in the map, so the scaffold runs unchanged with the empty default — and since hosts can now add/remove rounds at runtime (which renumbers `n`), a stale map is cosmetic, never breaking. Picture round (R1) + title/rules/prize/costume/end/nextEvent stay on the global accent regardless of `ROUND_ACCENTS`.
- `slides.jsx` is the design system: typography scale, accents, shared layout components, and slide components. Inline styles only — no CSS files. The look is **pulp-poster** (from the "Pub trivia scaffold refresh" Claude Design project): flat solid surfaces, hard offset shadows (`hardShadow(px, color)` — no glows), an inset `Frame` border on every slide, and red-background feature slides (Prize, Round Openers, Intermissions — `slideSurface("red")`; `Frame`/`FooterBar` take a matching `variant="red"` for stronger alpha + navy dots). Three font constants: `heroFont` (Alfa Slab One — hero lines), `displayFont` (Oswald — headings/labels), `bodyFont` (Work Sans — body copy); all three load from Google Fonts in `index.html`. `RuleGrid` is the shared 2×2 layout behind RulesSlide / CostumeContestSlide / TiebreakerIntroSlide (copy stays in each slide — theme anchors). The `AccentBar` component is a flat diamond divider — two lines flanking a rotated square with the `inkDeep` pulp outline (theme-neutral). Themed forks routinely replace it with a theme emblem. `Logo` renders the venue mark from `public/logo-fgbc-red.png` on Title/End (`onError` hides a missing file cleanly, so forks can just delete the PNG). `NextEventSlide` is pure layout — its copy lives in `meta.js`'s `nextEvent` defaults.
- **Visual identity is a first-class theme dimension.** Themed forks should expect to swap fonts (hero + display + body — the `index.html` fonts link and the three font constants in `slides.jsx` together), emblem (`AccentBar` → Pokeball / Eye / Saber / etc.), the venue logo PNG, and per-round accent rotation in addition to palette + copy.
- **Translucent surfaces use alpha-hex on PALETTE tokens** rather than literal `rgba(...)`. Patterns like `${PALETTE.paper}29` (16% — Frame borders), `${PALETTE.paper}99` (60% — dimmed text), or `${PALETTE.inkDeep}D9` (85% — caption gradient) keep frames, hairlines, picture captions, and step-card tints tracking palette swaps automatically.
- All slide components stay mounted with `visibility: hidden` so input/timer/video state survives navigation.

## PALETTE naming convention

`PALETTE.ink` is **the slide background color** and `PALETTE.paper` is **the primary text color** — regardless of which is light or which is dark. The scaffold has shipped both light-bg/dark-text and dark-bg/light-text (current: navy bg `#1A2A4A` / cream text `#F2E8CF`) under the same key names. Themed forks invert the *values* but keep the *keys*; downstream styles like `slideBase` (`color: PALETTE.paper, background: PALETTE.ink`) don't change. The full key set is now seven: `ink`, `inkDeep` (near-black outline + hard-shadow token), `paper`, `paperDim`, `rust` (structural red — rule bars, red-bg slides, chips), `rustDeep` (question-number shadow), `gold` (highlight — the scaffold's `DEFAULT_ACCENT` points at the matching ACCENTS entry).

## Slide outline duplication

`ControlApp.jsx`'s `buildSlideOutline()` mirrors `App.jsx`'s slide composition by hand. If you add or reorder slides in `App.jsx`, update `buildSlideOutline()` to match — otherwise the slide list in the presenter view drifts out of sync with what the display actually shows.

## Anchor strings the skill replaces

`/new-pub-trivia-deck` finds and replaces the following exact strings via the Edit tool. **Don't edit these casually** — changes here will silently break the skill until SKILL.md is updated to match.

| File | Anchor (scaffold value) | Slot |
|---|---|---|
| `index.html` | `<title>Taproom Trivia · Fertile Ground</title>` | `<title>` |
| `index.html` | inline `<style>` background / color / `::selection` hexes | palette mirror — duplicates `PALETTE.ink`/`paper`/`gold`; must change together with the `slides.jsx` palette |
| `index.html` + `src/slides.jsx` | Google Fonts `<link>` (Alfa Slab One · Oswald · Work Sans) + `heroFont`/`displayFont`/`bodyFont` constants | typography — the link and the three constants must change together |
| `src/broadcast.js` | `'pub-trivia-scaffold'` (CHANNEL_NAME) | BroadcastChannel name |
| `src/rounds.js` | `'pub-trivia-scaffold.rounds'` / `'pub-trivia-scaffold.tiebreakers'` | localStorage keys |
| `src/rounds.js` | `'pub-trivia-scaffold/questions'` | export type |
| `src/rounds.js` | `'Not a Pub Trivia Scaffold questions export'` | parseQuestionsImport error |
| `src/rounds.js` | full `DEFAULT_ROUNDS` array (real General Trivia content, `{ prompt, answer }` form) | round content |
| `src/rounds.js` | full `DEFAULT_TIEBREAKERS` array (real numeric prompts + answer comment) | tiebreaker content |
| `src/pictures.js` | `'pub-trivia-scaffold.pictures'` | localStorage key |
| `src/meta.js` | `'pub-trivia-scaffold.meta'` | localStorage key |
| `src/meta.js` `DEFAULT_META.title` | `eyebrow`, `hero` (blank by default — optional line, rendered only when non-empty), `edition` (`"Taproom Trivia"`), `tagline` (`"Summer Series"` — gold line under the edition; optional, follows the trivia-scorer series nomenclature, hosts append the event number per night), `hosts`, `footerDate` | title slide defaults — host can override at runtime via Edit Questions tab |
| `src/meta.js` `DEFAULT_META.end` | `hero1`, `hero2`, `subtitle` | end slide defaults — host can override at runtime |
| `src/meta.js` `DEFAULT_META.nextEvent` | `eyebrow`, `hero`, `date`, `venue`, `detail` | next-event slide defaults — theme only if a fitting metaphor exists; host edits per event |
| `src/meta.js` `DEFAULT_META.pictureRound` | `fit` (`'cover'`/`'contain'`) + `aspect` (`PICTURE_ASPECTS` key) | picture-cell defaults — a flag-style sibling can ship `fit: 'contain', aspect: '3 / 2'`; host can also flip at runtime via the Picture Round card |
| `src/slides.jsx` | full `PALETTE` object values (7 keys — `ink`/`inkDeep`/`paper`/`paperDim`/`rust`/`rustDeep`/`gold`; keys stay) | palette |
| `src/slides.jsx` RulesSlide | rules I–IV `d` text | rules |
| `src/slides.jsx` CostumeContestSlide | rule I–IV body copy | costume contest |
| `src/slides.jsx` PictureRoundInstructions | step 03 `d` text | picture-round instructions |
| `src/slides.jsx` `AccentBar` | optional rename + visual swap (rename hits 3 sites: definition + 2 call sites) | divider component |
| `src/slides.jsx` `Logo` + `public/logo-fgbc-red.png` | replace the PNG (or delete it — `onError` hides it) + update the `alt="Fertile Ground Beer Co"` | venue logo on Title/End |
| `src/slides.jsx` `ACCENTS` values | tune `hex`/`glow` per theme; keys (`accent-blue` etc.) stay verbatim | accent color tuning |
| `src/App.jsx` | Round 1 opener subtitle | picture-round flavor |
| `src/App.jsx` | `DEFAULT_ACCENT = "accent-gold"` | global accent — set to the theme's signature ACCENTS key |
| `src/ControlApp.jsx` | `'Thanks for Playing'` (fallback in `buildSlideOutline` when `meta.end.hero1`+`hero2` are blank) | end-slide outline label fallback |
| `src/ControlApp.jsx` | `` `trivia-deck-${date}.json` `` | export filename |
| `package.json` | `"pub-trivia-scaffold"` (name) | package name |
| `vite.config.js` | `base: '/pub-trivia-scaffold/'` | GitLab Pages subpath base |

The internal `ACCENTS` keys (`accent-blue`, `accent-green`, `accent-red`, `accent-gold`) are **not** theme-content anchors — they're internal preset color identifiers, never user-visible. Renaming the keys requires updating `ACCENTS` (in `slides.jsx`) plus `DEFAULT_ACCENT` and any `ROUND_ACCENTS` values in `App.jsx` — keep them in sync if you do rename.

## Venue & group branding sites

A second, orthogonal axis the skill deliberately does **not** touch: the skill re-themes decks *for the same venue*, so it keeps these values as-is. Rebranding for a **new group or venue** is a manual pass over the sites below — the full playbook (stakeholder asset list, decision matrix, developer checklist) is [`docs/REBRANDING.md`](docs/REBRANDING.md). The scaffold ships live Fertile Ground values as the working example of each slot.

| Site | File | Scaffold value |
|---|---|---|
| Title-slide eyebrow | `src/meta.js` `DEFAULT_META.title.eyebrow` | `"Presented at Fertile Ground"` |
| Series nomenclature | `src/meta.js` `title.edition` + `title.tagline` | `"Taproom Trivia"` / `"Summer Series"` (group-level, follows trivia-scorer series naming) |
| Next-event venue | `src/meta.js` `DEFAULT_META.nextEvent.venue` | `"Fertile Ground"` |
| Venue logo + alt | `src/slides.jsx` `LOGO_SRC` → `public/logo-fgbc-red.png`, `alt="Fertile Ground Beer Co"` | shown on Title/End; delete the PNG and `onError` hides it |
| Title-slide footer | `src/slides.jsx` title slide `FooterBar left=` | `"Fertile Ground"` — **not in the anchor table above**; a themed sibling silently inherits it |
| Prize slide copy | `src/slides.jsx` `PrizeSlide` | `"FERTILE GROUND GIFT CARD"`, `"$100"`, tagline |
| Costume contest | `src/slides.jsx` `CostumeContestSlide` | venue-flavored rules ("package beer" side prize) — keep, replace, or hide via `show.costumeContest` |
| Browser title suffix | `index.html` `<title>` | `· Fertile Ground` (the skill replaces the theme half, keeps the venue half) |
| Sheets template | `src/ControlApp.jsx` `SHEET_TEMPLATE_ID` | `''` — per-group sheet ID; button hidden until set |
| Deployed URL | `scripts/deploy.sh` | hardcoded `https://michaellambgelo.gitlab.io/pub-trivia-scaffold/` — **not in the anchor table**; update on any redeploy/rename |

Venue sites marked "not in the anchor table" have no skill protection at all — if you change them in the scaffold, nothing breaks, but themed siblings cloned afterward inherit the new values.

## Lint warnings

`npm run lint` exits clean (zero errors) but reports 2 warnings (empty catches in `deck-stage.js`). These are intentional defensive code. Don't suppress globally; address case-by-case if cleanup is desired. Note: `App.jsx` still passes `tweaks`/`accent` to every slide, but only the components that consume them destructure them — if you re-add a consumer (e.g. an atmosphere overlay), just re-destructure the prop.

## Content (scaffold defaults)

`DEFAULT_ROUNDS` ships with 4 rounds × 10 real general-knowledge questions (`{ prompt, answer }` objects) with escalating difficulty — Warm-Up Round / Food & Drink / Music & Pop Culture / Final Round — plus 3 real numeric tiebreakers. Slide count: 70 (title, rules, prize, costume contest, R1 opener+instructions+intermission+recap, then for R2–R5: opener + 10 questions + intermission + recap splits, then end, next-event, tiebreaker intro + 3 tiebreaker question slides). Hosts can change the round count and per-round question counts at runtime (editor or CSV import); themed siblings replace the content wholesale.

Keep default questions **time-stable**: only well-attested facts that won't go stale (no "current champion / president" phrasing).

`QuestionSlide` accepts a `kind` prop (`"round"` default, `"tiebreaker"` for sudden death). Tiebreaker variant changes the header text from "ROUND XX · QUESTION YY · OF ZZ" to "TIEBREAKER · QUESTION YY · OF ZZ", changes the FooterBar to "Sudden Death" / "Tiebreaker YY / ZZ", and uses `data-label="TIEBREAKER YY"` so `App.jsx`'s slidechange regex (`/^(R\d+ Q\d+|TIEBREAKER \d+)/`) keeps the timer enabled on tiebreaker slides like it does on regular question slides.

## Deploy

Auto-deploys to GitLab Pages via `.gitlab-ci.yml` on every push to `main`. Subpath base is `/pub-trivia-scaffold/` (set in `vite.config.js`); image fallbacks in `src/pictures.js` use `import.meta.env.BASE_URL` so they resolve in both dev (`/`) and prod (`/pub-trivia-scaffold/`).

The repo was historically hosted at `gitlab.com/michaellambgelo/trivia-scaffold`; on the split the GitLab project was renamed to `pub-trivia-scaffold` (live URL: `https://michaellambgelo.gitlab.io/pub-trivia-scaffold/`). The `voidnet` remote was likewise renamed.

Each visitor's browser gets its own isolated `localStorage` — the `/#/control` route is intentionally ungated because writes only land in the visitor's own browser, and every fresh session loads `DEFAULT_*` content. Themed siblings cloned by `/new-pub-trivia-deck` need their own `base`, BroadcastChannel name, and `.gitlab-ci.yml`.

## What this project is NOT

- Not a *themed* deck — `/new-pub-trivia-deck` produces those. (It **is** hostable as-is for general-knowledge nights.)
- Not tested (no test framework set up).
- Not using TypeScript by intent — keep it JSX.
