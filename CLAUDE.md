# CLAUDE.md

The browser-only presentation deck for **JXN Film Club trivia nights**. Deployed to Cloudflare Workers at `https://jxnfilmclub-trivia.michaellamb.workers.dev`.

Forked from `~/Workspace/pub-trivia-scaffold` (itself descended from `star-wars-trivia-game`, handed off from Claude Design as 4 standalone files and migrated to Vite + ES modules). The scaffold stays on GitLab and remains the source-of-truth that `/new-pub-trivia-deck` clones.

**This repo is a deck, not a scaffold.** `/new-pub-trivia-deck` must never target it. The Night Shift palette, the self-hosted type, and the club's slide copy are the product — they are not theme-leak points to be replaced. Engine improvements worth sharing get ported back to the scaffold by hand; there is no automatic sync.

## Stack

- React 18 + JSX (no TypeScript) + Vite 5
- Custom `<deck-stage>` web component (vanilla JS) for slide layout, nav, scaling, print
- ESLint 9 (flat config)

## Commands

```bash
npm run dev      # Vite dev (localhost:5173)
npm run build    # production bundle
npm run preview  # serve built bundle
npm run lint     # ESLint
```

## Two windows: display + control

The app has two views, switched by URL hash:

- `/` (or any non-`#/control` hash) → `App.jsx` (display)
- `/#/control` → `ControlApp.jsx` (editor + presenter view)

`src/main.jsx` reads `window.location.hash` and renders the appropriate root. A `hashchange` listener triggers full reload so each mode boots cleanly.

The two windows talk via `BroadcastChannel` (channel name `jxnfilmclub-trivia` — namespaced to this deck so the scaffold and any sibling deck can run side-by-side without messages crossing). See `src/broadcast.js`. Message types in use:

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
- `src/App.jsx` composes the slide list, holds a `useRef` on the `<deck-stage>`, listens for nav/content broadcasts, and forwards `slidechange` events to the control window. Per-question `total` is `r.questions.length` (not hardcoded), so a night with a different question count works without engine changes.
- `src/ControlApp.jsx` has three tabs (Presenter, Edit Questions, Picture Round). Editor edits are buffered (`dirty` flag) and only push to display when the user clicks Save. The Edit Questions tab also edits **structure**: per-question "×" remove buttons (disabled at 1 question), "+ Add question" per round, "Remove round" (confirm dialog, disabled at 1 round), and "+ Add round". Structural edits run `renumberRounds` so `n` stays sequential from 2, and re-derive the round kicker when it matches the auto pattern (`isAutoKicker` → `deriveKicker`, e.g. "10 Questions" → "11 Questions"); custom kickers like "10 Questions · Tiebreaker Material" are never touched. Round card titles (and the remove-round confirm + CSV mapping modal slots) mirror the display numbering via `roundCardTitle`: with the picture round shown they read "Round 2"; with it hidden, "Round 1 (R2)" — display number first, internal `n` in parens (internal `n` is what `ROUND_ACCENTS` and the CSV mapping key off).
- `src/rounds.js` — `DEFAULT_ROUNDS` (4 rounds × 10 questions in `{ prompt, answer }` form, `n: 2..5` because slot 1 is reserved for the Picture Round) + `loadRounds`/`saveRounds`/`resetRounds`. Persists to `localStorage` under `jxnfilmclub-trivia.rounds`. Also exports `DEFAULT_TIEBREAKERS` (3 real numeric sudden-death prompts; host answers in a comment above the array) + `loadTiebreakers`/`saveTiebreakers`/`resetTiebreakers` (key `jxnfilmclub-trivia.tiebreakers`). `normalizeQuestion(q)` returns the object form `{ prompt, answer?, audioUrl?, imageUrl?, videoUrl?, displayHint? }`. `recapSplitsFor` is generic across question count: `<=5` → 1 chunk, `<=10` → 2 chunks, `>10` → 3 chunks. `displayRoundNumber(rN, pictureRoundShown)` shifts trivia rounds down by 1 when the picture round is hidden, so players see 1..4 instead of 2..5 with no gap. Structure helpers: `renumberRounds(rounds)` (n = index + 2), `makeBlankRound()`, `deriveKicker(count)`, `isAutoKicker(kicker)` (`/^\d+ Questions?$/`).
- **Import/export** (`src/rounds.js` + `src/csv.js`): three formats, all through `parseImport(text, filename)`:
  - **JSON deck bundle** (lossless): `buildQuestionsExport`/`parseQuestionsImport`, type `'jxnfilmclub-trivia/questions'`, version 2. Validates round shape; tiebreakers are **optional** — absent/`null`/`[]` all mean "keep the deck's current ones" (the key is omitted from the parse result and ControlApp only overwrites the draft when it's present), while a non-empty value must be exactly `TIEBREAKER_COUNT` (3) strings. Version 2 adds optional `pictures` (the 10-slot paste buffer, data URLs included) and `meta` (full game meta) sections — `buildQuestionsExport(rounds, tiebreakers, { pictures, meta })`; version-1 files (questions only) still import. On import, rounds/tiebreakers/meta land in the editor drafts (dirty → Save & Push), while pictures commit immediately through `normalizePastes` (they have no draft stage); imported meta is coerced via `sanitizeMeta` (the exported `withDefaults` path). The "Export Deck" button downloads the full bundle — one file moves the whole event between machines. An empty paste buffer exports **no `pictures` section at all** (never ten null cells); when at least one image exists the full 10-slot array ships, because null entries are positional (they keep images in the right cells). Importing a bundle without a `pictures` section leaves the machine's existing pictures untouched.
  - **Full-fidelity CSV (import-only)**: `parseQuestionsFullCsv`. Header row `round,round_title,question,answer,subtitle,kicker` — columns resolved by name, any order; only `round` + `question` required. The `round` column is the 1-based user-facing ordinal and a grouping key only: rounds are sorted numerically, compacted, and assigned internal `n = ordinal + 1` (CSV round 1 → `n: 2`). Round value `TB` groups tiebreaker rows (exactly 3 when present; absent → existing tiebreakers kept). First non-empty `round_title`/`subtitle`/`kicker` per round wins; missing kicker → `deriveKicker(count)`. Empty answer cell → plain-string question. There is no CSV export — the deck bundle is the only export; `src/csv.js` is parse-only.
  - **Legacy writer-template CSV (import-only)**: `parseQuestionsCsv` still accepts the old `category,question` format; on import the host maps discovered categories onto rounds via `CsvImportModal`. `parseImport` sniffs the CSV header to dispatch: header containing `round` → `kind: 'csv-full'`; `category,question` → `kind: 'csv-categories'`. **`buildCsvTemplate` no longer emits this format** — the "CSV Template" download now uses the full-fidelity header so a filled-in copy round-trips with answers intact (the legacy header has no answer column and silently dropped them). It ships 3 `TB` example rows (not 1 — the importer takes exactly 3 tiebreakers or none). **No comment line in the template may contain a comma or quote**: a quoted cell defeats Google Sheets' "Detect automatically" separator guess and collapses every data row into column A.
  - **Google Sheets template button** (`src/ControlApp.jsx`): `SHEET_TEMPLATE_ID` holds the *file ID* of a group's shared question-writing sheet (from the `/d/<ID>/edit` URL, **not** a `2PACX-…` publish token); the button links to `/d/<ID>/copy`, which forces Google's "Make a copy" dialog so each writer owns a private copy. The sheet must be shared "Anyone with the link → Viewer" — Publish-to-web does not work here. **Per-group, not per-theme**, and the button is rendered conditionally (`{SHEET_TEMPLATE_URL && …}`) — an empty ID means no button at all, not a disabled one, so "the code is present" does not mean "the feature is visible". This deck is wired to `1egPdf…`, the shared `trivia-questions-template` (blank, already link-shared) that Fertile Ground also uses; its header still says "TAPROOM TRIVIA" with ENTERTAINMENT / SPORTS / GEOGRAPHY / SCIENCE rounds, so swap in a film-club sheet when one exists. All import sources funnel through `applyImport(text, filename)` in `EditorPanel`, and full-CSV imports report what landed via `describeImport`.
  - `src/csv.js` is the dependency-free parse layer (quoted fields, embedded commas/newlines, doubled quotes, BOM strip).
- `src/meta.js` — game-level meta (`title` text fields, `end` text fields, `nextEvent` fields for the next-event announcement slide — `eyebrow`/`hero`/`date`/`venue`/`detail`, `show` toggles for prize / costume / pictureRound / tiebreakers / nextEvent, a `pictureRound` section (`handoutInstruction` string + `fit` `'cover'`|`'contain'` + `aspect` — a key into `PICTURE_ASPECTS` in `pictures.js`, e.g. `'316 / 220'`/`'3 / 2'`/`'2 / 1'`/`'1 / 1'`), and a `display` section carrying the question-slide options: `showQNumbers`, `showTimer`, `timerSeconds`). `loadMeta`/`saveMeta`/`resetMeta` (key `jxnfilmclub-trivia.meta`). `loadMeta` merges persisted state with `DEFAULT_META` (per-section spread in `withDefaults`) so adding a new field doesn't break older saves; the `display` **and** `pictureRound` merges are explicit picks of known keys (pictureRound's `fit`/`aspect` are validated against `PICTURE_FITS`/`PICTURE_ASPECTS` and degrade to default if invalid), so stale/garbage fields are stripped on load. App.jsx loads on mount + listens for `meta:update` and derives `const tweaks = meta.display` (slides still take a `tweaks` prop) and passes `meta.pictureRound` to `PictureRoundRecap`. ControlApp.jsx edits buffer-and-save like rounds and broadcasts on save — the **Display** card (Edit Questions tab) edits `meta.display`; the **Picture Round** card edits `meta.pictureRound` (handout instruction + fit/aspect), which PicturesPanel uses for the editor preview and the exported PNG. When `meta.show.pictureRound` is off, the Picture Round **tab** is disabled (and auto-falls-back to Presenter if open) and the Picture Round **card** in the Edit Questions tab is dimmed + non-interactive (keyed on `draftMeta.show.pictureRound`, so it reacts live as the toggle flips). App.jsx conditionally composes Prize/Costume/PictureRound/NextEvent/Tiebreakers slides based on `meta.show`; if you add a new toggle, also update `buildSlideOutline()` in ControlApp.jsx to match (the `display` tweaks don't affect slide composition).
- `src/pictures.js` — picture round data layer. **`ingestImage(blob)`** is the paste/drop entry point: it downscales to a 1600px long edge and re-encodes as JPEG q0.85 (alpha flattened onto white; falls back to the original bytes only if decoding fails), so ten photos fit `localStorage`'s ~5MB quota with room to spare — never store raw `FileReader` output. **`savePastes` returns a boolean** instead of throwing on quota; `commitPastes` in ControlApp broadcasts *before* saving so the display keeps the image for the session even when persistence fails, and panels surface the failure as a status warning. `DEFAULT_PICTURE_ITEMS` still points to `/images/picture-NN.png` as a silent static fallback (decks that commit images there get them served; pasted data URLs always win) — but the paste buffer + deck-bundle export is the supported workflow, not saving files into the repo. `loadPastes`/`clearPastes`/`normalizePastes` manage the 10-slot buffer (`jxnfilmclub-trivia.pictures`); `normalizePastes` coerces arbitrary arrays (old saves, imported bundles) to exactly 10 well-shaped entries. Paste shape: `{ dataUrl, caption, position: { x, y } }` where `x`/`y` are 0-100 percentages (default 50/50 = centered, matches `object-position: center`). `mergeItems(pastes)` resolves what the display actually renders: pasted data URLs win over disk paths, position falls back to centered. Also the **single source of truth for cell geometry**: `PICTURE_ASPECTS` (keyed by the `meta.pictureRound.aspect` string → `{ w, h, label }`), `DEFAULT_ASPECT`, `PICTURE_FITS`, and `resolveAspect(aspect)` (→ `{ css, w, h }`, degrades unknown values to default). slides.jsx, handout.js, and ControlApp.jsx all consume `resolveAspect` so the display slide, canvas handout, and editor preview crop/letterbox identically (previously the editor preview was hardcoded `1 / 1` while display/handout were `316 / 220` — now unified). `pictureGridLayout({ aspect, cols, rows, contentW, availH, gap, cellExtra })` sizes the grid honoring BOTH the column width and the vertical budget, so tall aspects (the `1 / 1` square) shrink + center instead of overflowing the 2-row grid — slides.jsx and handout.js both call it (slide passes `cellExtra: 0`; handout passes the answer-area height) and center the returned `gridW`.
- `src/handout.js` — pure-canvas PNG renderer for the picture round handout. White background, dark borders, "PICTURE ROUND" title, no recap eyebrow / no FooterBar. Geometry constants (margins, gap, grid bounds, answer-area height) mirror the slide so the same image crops the same way in both surfaces; the photo-box aspect is derived from `resolveAspect(opts.aspect)` rather than a hardcoded constant. `renderHandoutCanvas`/`copyHandoutToClipboard`/`downloadHandoutPng` take an `opts = { fit, aspect }` (defaults reproduce the historical cover/316:220 layout). In `cover` it honors `position` via the same percentage math as `object-position`; in `contain` it scales-to-fit, centers, and ignores `position`. Exports `copyHandoutToClipboard`, `downloadHandoutPng`, `downloadAnswersHandoutPng(lineCount)` (generic numbered answer sheet; PicturesPanel passes the longest round's question count, min 10, and the line gap compresses to fit). No html2canvas dependency.
- The `<img>` cells in `PictureRoundRecap` use an `onError` fallback (`PictureRecapCell` in `slides.jsx`) so missing disk-path images degrade to the "PHOTO" placeholder instead of a broken-image icon. They apply `objectPosition: ${x}% ${y}%` from the merged item position.
- `PictureCell` in `ControlApp.jsx` implements drag-to-pan via pointer events: pointer-down records the starting `position`, pointer-move translates pixel deltas into objectPosition percentage deltas (inverted — drag right reveals more of the right edge of the source). During the drag the position lives in local `livePos` state; the persist + broadcast commit fires **once on pointer-up** (committing per pointer-move would re-stringify all ten data URLs into localStorage at pointer-event rate). A 3px movement threshold prevents accidental drags from a click. The ↺ reset button only appears when position differs from 50/50.
- `src/QuestionSlide` (in `slides.jsx`): tracks `isActive` from `slidechange` events, holds local `seconds` + `paused` state. Only the active slide responds to timer broadcasts and emits `timer:state`. All mounted question slides see the broadcasts but only the active one acts.
- Display tweaks (question numbers, timer toggle/seconds) are persisted in `meta.display` and edited from the **Display** card in ControlApp's Edit Questions tab — they buffer-and-save and broadcast via `meta:update` like every other meta field. The runtime accent picker and ambient-backdrop toggle were removed: the global accent is now the `DEFAULT_ACCENT` code constant in App.jsx, and the `BackdropField` starfield component was deleted outright. This deck no longer depends on Claude Design (the old `tweaks-panel.jsx`, floating host panel, `useTweaks` postMessage protocol, and EDITMODE markers are long gone).
- `DEFAULT_ACCENT` + `ROUND_ACCENTS` (in `App.jsx`, near the top) are the accent controls. `DEFAULT_ACCENT` is the global accent (an `ACCENTS` key — `"accent-red"` here, the club's signal red). `ROUND_ACCENTS` is a per-round rotation hook: empty map by default; fill it in to map round number `n` → ACCENTS key. The `accentFor(n, global)` helper degrades to the global accent for any round not in the map, so the deck runs unchanged with the empty default — and since hosts can now add/remove rounds at runtime (which renumbers `n`), a stale map is cosmetic, never breaking. Picture round (R1) + title/rules/prize/costume/end/nextEvent stay on the global accent regardless of `ROUND_ACCENTS`.
- `slides.jsx` is the design system: typography scale, accents, shared layout components, and slide components. Inline styles only — no CSS files. The look is **Night Shift** — noir zine, photocopy collage: flat solid surfaces, hard offset shadows (`hardShadow(px, color)` — no glows), an inset `Frame` border on every slide, and red-background feature slides (Prize, Round Openers, Intermissions — `slideSurface("red")`; `Frame`/`FooterBar` take a matching `variant="red"` for stronger alpha + darker dots). The engine's pulp-poster bones are inherited from the scaffold; the palette and type are what make it the club's. Three font constants: `heroFont` (Playfair Display — hero lines, rendered 900 italic), `displayFont` (Oswald — headings/labels, always uppercase with wide tracking), `bodyFont` (Newsreader — body copy). All three are **self-hosted**: `@font-face` rules in `index.html` point at the variable `.woff2` files in `public/fonts/`. There is no Google Fonts link and no third-party request at runtime — keep it that way, and if you add a weight or a face, commit the file. `RuleGrid` is the shared 2×2 layout behind RulesSlide / CostumeContestSlide / TiebreakerIntroSlide (copy stays in each slide). The `AccentBar` component is a flat divider — two lines flanking a `ReelMark`, the club's filmstrip-frame mark (inline SVG, one `fillRule="evenodd"` path so the window and sprockets are knocked out and the slide shows through; all radii 0). It takes the accent straight through, so it reads red on ink slides and ink on the red ones. `Logo` renders the club mark on Title/End from `LOGO_SRC`; `onError` hides a missing file cleanly, so the slot degrades quietly when no PNG is committed to `public/`. `NextEventSlide` is pure layout — its copy lives in `meta.js`'s `nextEvent` defaults.
- `JoinClubSlide` (in `slides.jsx`) is the end-of-night promo: a committed static QR (`public/join-qr.svg`) on a paper card beside the club URL, placed between End and Next Event so it is on screen while hosts tally scores. The QR is **generated at author time, not runtime** —
  `qrencode -t SVG -l H -m 2 -s 8 -o public/join-qr.svg "https://join.jxnfilm.club"`
  — because the deck makes no third-party requests (same rule as the self-hosted fonts) and the URL never changes; there is no QR library in the bundle. Dark-on-light on a paper card rather than inverted onto the ink background, because scanners want that polarity. Error-correction level H; verified by decoding the rendered element with the browser's `BarcodeDetector`, still clean when shrunk to 140px. **If `meta.joinClub.url` changes, regenerate the SVG** — otherwise the printed address and the code disagree and nobody in the room can tell.
- **Shape language: the zine is square.** All radii are 0 — the only round things are dots. Borders over shadows, solid colors, no gradients on chrome. Keep new components inside that vocabulary rather than reaching for rounded cards or soft glows.
- **Translucent surfaces use alpha-hex on PALETTE tokens** rather than literal `rgba(...)`. Patterns like `${PALETTE.paper}29` (16% — Frame borders), `${PALETTE.paper}99` (60% — dimmed text), or `${PALETTE.inkDeep}D9` (85% — caption gradient) keep frames, hairlines, picture captions, and step-card tints tracking palette swaps automatically.
- All slide components stay mounted with `visibility: hidden` so input/timer/video state survives navigation.

## PALETTE naming convention

`PALETTE.ink` is **the slide background color** and `PALETTE.paper` is **the primary text color** — regardless of which is light or which is dark. The lineage has shipped both light-bg/dark-text and dark-bg/light-text under the same key names, so the *values* move and the *keys* never do; downstream styles like `slideBase` (`color: PALETTE.paper, background: PALETTE.ink`) don't change.

The seven keys, carrying Night Shift values (mirrors `~/Workspace/jxnfilmclub/css/tokens.css` — move them together):

| Key | Value | Role |
|---|---|---|
| `ink` | `#100f0e` | slide background (`--bg`) |
| `inkDeep` | `#000000` | outline + hard-shadow token; always darker than `ink` |
| `paper` | `#e8e3d8` | primary text (`--ink`) |
| `paperDim` | `#e8e3d899` | muted text — alpha-hex so it tracks the swap |
| `rust` | `#d7321f` | structural red (`--brand`) — rule bars, red-bg slides, chips |
| `rustDeep` | `#b52a19` | question-number shadow (`--brand-dark`) |
| `gold` | `#f0ebe0` | global highlight (`--ink-strong`) |

Night Shift has no third color: the "highlight" slot is paper-white and the accent is red. The `gold` key name is historical — it is a slot, not a color claim. `DEFAULT_ACCENT` points at `accent-red`, and the four `ACCENTS` presets are re-tuned to the same family (RED / PAPER / CORAL / DEEP RED) while keeping their key names verbatim.

## Slide outline duplication

`ControlApp.jsx`'s `buildSlideOutline()` mirrors `App.jsx`'s slide composition by hand. If you add or reorder slides in `App.jsx`, update `buildSlideOutline()` to match — otherwise the slide list in the presenter view drifts out of sync with what the display actually shows.

## Namespaced identifiers

Every identifier is namespaced `jxnfilmclub-trivia` so this deck can run beside the scaffold or any sibling without collision:

| Identifier | File |
|---|---|
| package name | `package.json` (+ both slots in `package-lock.json`) |
| Worker name `jxnfilmclub-trivia` | `wrangler.jsonc` |
| `CHANNEL_NAME` | `src/broadcast.js` |
| `jxnfilmclub-trivia.rounds` / `.tiebreakers` | `src/rounds.js` |
| `jxnfilmclub-trivia.pictures` | `src/pictures.js` |
| `jxnfilmclub-trivia.meta` | `src/meta.js` |
| export type `jxnfilmclub-trivia/questions` | `src/rounds.js` |

Because the export type is namespaced, a deck bundle exported from the scaffold or from a themed sibling will **not** import here — retag its `type` field first. Same in reverse: bundles exported from this deck won't load anywhere else.

## Club branding sites

In the scaffold these are theme-leak anchors that `/new-pub-trivia-deck` rewrites. **Here they are the product** — intentional content, not placeholders. Change them because the club changed, never to "re-theme" the deck.

| Site | File | Carries |
|---|---|---|
| Browser title | `index.html` `<title>` | the club's deck name |
| Palette mirror | `index.html` inline `<style>` | background / color / `::selection` hexes — duplicates `PALETTE.ink`/`paper`/`gold`, so it must change together with the `slides.jsx` palette |
| Self-hosted type | `index.html` `@font-face` + `public/fonts/*.woff2` | Playfair Display (+ italic), Oswald, Newsreader (+ italic) — variable `.woff2`, no Google Fonts |
| Palette | `src/slides.jsx` `PALETTE` | Night Shift: ink `#100f0e` / paper `#e8e3d8` / rust `#d7321f` |
| Accent presets | `src/slides.jsx` `ACCENTS` | `hex`/`glow` tuned to the red family; the four keys stay verbatim |
| Global accent | `src/App.jsx` `DEFAULT_ACCENT` | `"accent-red"` |
| Title / end / next-event copy | `src/meta.js` `DEFAULT_META.title`, `.end`, `.nextEvent` | eyebrow, hero, edition, tagline, hosts, footer date, sign-off, next-event date / venue / detail — hosts override any of them at runtime from the Edit Questions tab |
| Round content | `src/rounds.js` `DEFAULT_ROUNDS` + `DEFAULT_TIEBREAKERS` | the committed question set a fresh browser loads |
| House rules | `src/slides.jsx` `RulesSlide` | rules I–IV `d` text |
| Costume contest | `src/slides.jsx` `CostumeContestSlide` | rule I–IV body copy — keep, replace, or hide via `show.costumeContest` |
| Prize slide copy | `src/slides.jsx` `PrizeSlide` | award, amount, tagline |
| Picture-round instructions | `src/slides.jsx` `PictureRoundInstructions` | step 03 `d` text (where the handout comes from) |
| Title-slide footer | `src/slides.jsx` title slide `FooterBar left=` | the club name on the title slide |
| Club mark | `src/slides.jsx` `LOGO_SRC` → `public/` | shown on Title/End; `onError` hides it if the file is absent |
| Round 1 opener subtitle | `src/App.jsx` | picture-round flavor |
| Join-the-club promo | `src/meta.js` `DEFAULT_META.joinClub` + `public/join-qr.svg` | eyebrow / hero / url / detail, and the committed QR. **`joinClub.url` and the QR must agree** — the QR is a static file, so changing the URL means regenerating it |
| End-slide outline fallback | `src/ControlApp.jsx` | label used when `meta.end.hero1`+`hero2` are blank |
| Export filename | `src/ControlApp.jsx` | `` `trivia-deck-${date}.json` `` |
| Sheets template | `src/ControlApp.jsx` `SHEET_TEMPLATE_ID` | `1egPdf…` — the shared `trivia-questions-template`. Empty string hides the button entirely |
| Deployed URL | `scripts/deploy.sh` | `https://jxnfilmclub-trivia.michaellamb.workers.dev` — update on any redeploy or rename |

The internal `ACCENTS` keys (`accent-blue`, `accent-green`, `accent-red`, `accent-gold`) are **not** content — they're internal preset color identifiers, never user-visible, and their display names live in the preset values. Renaming the keys requires updating `ACCENTS` (in `slides.jsx`) plus `DEFAULT_ACCENT` and any `ROUND_ACCENTS` values in `App.jsx`, so don't.

[`docs/REBRANDING.md`](docs/REBRANDING.md) is the inherited playbook for this axis — asset list, the theme / group / venue / per-night / deploy decision matrix, and the namespacing checklist. It describes the pass that produced this deck.

## Lint warnings

`npm run lint` exits clean (zero errors) but reports 2 warnings (empty catches in `deck-stage.js`). These are intentional defensive code. Don't suppress globally; address case-by-case if cleanup is desired. Note: `App.jsx` still passes `tweaks`/`accent` to every slide, but only the components that consume them destructure them — if you re-add a consumer (e.g. an atmosphere overlay), just re-destructure the prop.

## Content (shipped defaults)

`DEFAULT_ROUNDS` ships with 4 rounds × 10 questions (`{ prompt, answer }` objects) of escalating difficulty, plus 3 numeric tiebreakers. Slide count: 70 (title, rules, prize, costume contest, R1 opener+instructions+intermission+recap, then for R2–R5: opener + 10 questions + intermission + recap splits, then end, next-event, tiebreaker intro + 3 tiebreaker question slides). Hosts change the round count and per-round question counts at runtime (editor or CSV import) — the committed defaults are the fallback a fresh browser loads, so per-night questions live in the deck-bundle JSON, not in this repo.

Keep default questions **time-stable**: only well-attested facts that won't go stale (no "current champion / president" phrasing).

`QuestionSlide` accepts a `kind` prop (`"round"` default, `"tiebreaker"` for sudden death). Tiebreaker variant changes the header text from "ROUND XX · QUESTION YY · OF ZZ" to "TIEBREAKER · QUESTION YY · OF ZZ", changes the FooterBar to "Sudden Death" / "Tiebreaker YY / ZZ", and uses `data-label="TIEBREAKER YY"` so `App.jsx`'s slidechange regex (`/^(R\d+ Q\d+|TIEBREAKER \d+)/`) keeps the timer enabled on tiebreaker slides like it does on regular question slides.

## Deploy

Auto-deploys to **Cloudflare Workers** on every push to `main` via the Workers build integration on the GitHub repo `michaellambgelo/jxnfilmclub-trivia`. Cloudflare runs `npm run build`, then `npx wrangler deploy`.

**`wrangler.jsonc` is load-bearing.** It declares an assets-only Worker (no `main` — there is no server code) pointing at `./dist`. Without it, `wrangler deploy` falls back to framework auto-detection, which requires Vite >= 6 and fails with *"The version of Vite used in the project cannot be automatically configured"* — the build succeeds and the deploy step dies. Don't delete it to let Cloudflare "figure it out".

`not_found_handling` is `"none"`, not `"single-page-application"`. Every route here is a hash (`/#/control`), so path fallback buys nothing, and SPA mode would answer a missing font or image with `200` + `index.html` — hiding real 404s behind a page that renders fine.

Base is `/` (set in `vite.config.js`), because the Worker serves `dist/` at the domain root. This differs from the scaffold's GitLab subpath base; `import.meta.env.BASE_URL` follows it, which is what `LOGO_SRC`, the grain overlay, and the `src/pictures.js` image fallbacks derive their URLs from. `wrangler` is pinned as a devDependency so CI stops installing a floating latest on every build.

`scripts/deploy.sh` (used by `/deploy`) is `git push origin main` plus the contract's `::deploy:` lines. It emits no `watch=` line — the build runs in Cloudflare, not GitHub Actions, so there is no workflow for the router to watch.

Each visitor's browser gets its own isolated `localStorage` — the `/#/control` route is intentionally ungated because writes only land in the visitor's own browser, and every fresh session loads `DEFAULT_*` content.

## What this project is NOT

- **Not a scaffold.** `/new-pub-trivia-deck` clones `~/Workspace/pub-trivia-scaffold`, never this repo.
- Not a general-purpose deck — the palette, type, and copy belong to JXN Film Club.
- Not tested (no test framework set up).
- Not using TypeScript by intent — keep it JSX.
