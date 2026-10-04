# JXN Film Club Trivia

The browser-only presentation deck for **JXN Film Club trivia nights**. Teams play across rounds of questions on written paper sheets, hosts grade per round. Plus an optional picture round (10 images, played from a handout), optional tiebreakers, and a next-event announcement slide.

The deck ships ready to host: 4 rounds × 10 questions, with the round count and questions-per-round fully editable from the control window (or via CSV import).

Forked from [`pub-trivia-scaffold`](https://gitlab.com/michaellambgelo/pub-trivia-scaffold), which stays the source-of-truth scaffold that `/new-pub-trivia-deck` clones. **This repo is a deck, not a scaffold** — the skill must never target it. The Night Shift look and the club's slide copy are the product here, not theme-leak points waiting to be replaced.

Two audiences, two halves of this document:

- **[Instructions for Hosts](#instructions-for-hosts)** — running an event: the two windows, game flow, the control tabs, casting to a TV.
- **[Instructions for Developers](#instructions-for-developers)** — building, deploying, the file layout, and how this deck relates to the scaffold.

---

# Instructions for Hosts

## The two windows

The deck has **two URLs** that you open in two separate browser windows on the same origin:

| URL | Mode | Where to open it |
|---|---|---|
| [`https://jxnfilmclub-trivia.michaellamb.workers.dev/`](https://jxnfilmclub-trivia.michaellamb.workers.dev/) | **Display** | The TV / projector / external screen the room watches |
| [`https://jxnfilmclub-trivia.michaellamb.workers.dev/#/control`](https://jxnfilmclub-trivia.michaellamb.workers.dev/#/control) | **Control** | Your laptop screen — editor + presenter view |
| `http://localhost:5173/` | **Display** | The TV / projector / external screen the room watches |
| `http://localhost:5173/#/control` | **Control** | Your laptop screen — editor + presenter view |

The two windows talk live via `BroadcastChannel` (a built-in browser API; no server). Edits in the control window push to the display instantly; navigating in control drives the display.

## Game flow

A typical event flows through this slide order:

1. **Title** — venue, edition, hosts, date.
2. **Rules** — four house rules (no phones, spelling best-attempt, hosts final, have fun).
3. **Prize** *(optional)*, **Costume Contest** *(optional)* — toggleable from Edit Questions.
4. **Round 1 (Picture Round)** *(optional)* — opener → instructions → intermission → recap. Always image-based. By default it's played from a paper sheet generated from the Picture Round tab; switch it to **on screen** (or **both**) and a timed **Picture Show** slide plays the stills on the display right after the instructions — see [Running the picture round on screen](#running-the-picture-round-on-screen).
5. **Rounds 2–5** *(or however many you configure — rounds and questions-per-round are editable)* — each round is opener → questions → intermission → recap. Question slides have a per-question countdown timer in the corner.
6. **End** — sign-off slide while hosts tally scores.
7. **Next Event** *(optional)* — announces the next trivia night (date / venue / detail, edited per event).
8. **Tiebreakers** *(optional)* — parked at the very end of the deck; advance into them only when there's an actual tie.

Anything from #3 onward (prize / costume / picture round / next event / tiebreakers) can be hidden per-event from the control window's **Edit Questions → Slides to Include** card, so a single deck handles "full event" and "casual game night" formats without code changes.

## Control mode

Three tabs:

### 1. Presenter tab
A live outline of every slide in the deck with the active slide highlighted. Click any row to jump the display straight to that slide. The currently-active question slide also surfaces a **timer panel**: Start/Pause, Reset, ±10s — the timer state is broadcast to the display, so the room sees the seconds ticking down on the slide while you control it from your laptop. On the Picture Show slide that panel becomes the **Picture Show** card (see below).

### 2. Edit Questions tab
Cards at the top edit the **Title Slide**, **End Slide**, and **Next Event Slide** strings (eyebrow, hero text, edition, hosts, date, sign-off, next-event details). Below that, cards per round let you edit each question and answer — plus restructure the game: **add/remove questions** within a round (the "N Questions" kicker tracks the count automatically), and **add/remove whole rounds**. Edits are buffered locally — "Save & Push to Display" sends them to the display (and persists to `localStorage`), "Revert" discards.

Bulk editing goes through **Export Deck / Import…**: **Export Deck** is the one export — a JSON file carrying the questions, tiebreakers, picture round (images included), and all game meta, so importing it on another machine restores the whole event. Import also accepts spreadsheet CSVs (`round,round_title,question,answer,subtitle,kicker`, with `TB` rows for tiebreakers) — round count and questions-per-round are detected from the rows — and the older `category,question` writer-template CSV, which opens a category→round mapping dialog.

#### Writing questions in a spreadsheet

Most questions get drafted in a spreadsheet before the event rather than typed in here. Two buttons seed one:

- **Google Sheets Template ↗** opens Google's *Make a copy* dialog on your group's shared template. The writer gets their **own private copy** — nobody else can see it, including you, unless they share it back. Hand this button (or the link behind it) to anyone writing questions. This deck points at the shared `trivia-questions-template` sheet — blank, and already shared *Anyone with the link → Viewer*. Its header still reads "TAPROOM TRIVIA" with generic round titles; swap `SHEET_TEMPLATE_ID` in `src/ControlApp.jsx` when the club has a film-specific sheet.
- **CSV Template** downloads the same thing as a file, for Excel or Numbers.

The writer fills in the rows, then `File → Download → Comma-separated values`, and you drop that file into **Import…**. Round count and questions-per-round are read from the rows; the import reports what it loaded, and lands in the editor as unsaved changes so you can review before **Save & Push**.

Two things to know:

- **Sheets exports only the active tab.** Keep the template to one tab.
- **Never publish a sheet that has real questions in it.** *File → Share → Publish to web* makes it readable by anyone on the internet, and it is not the same as link-sharing. A template is safe to share because it holds no questions; the writers' copies are private by default. Leave it that way.

To build your group's shared template: click **CSV Template**, then in a new Sheet use `File → Import → Upload → Replace spreadsheet` (Separator type **Comma**). Share it *Anyone with the link → Viewer* and put its file ID (from the `/d/<ID>/edit` URL — **not** a `2PACX-…` publish token) in `SHEET_TEMPLATE_ID` in `src/ControlApp.jsx`. An empty `SHEET_TEMPLATE_ID` hides the button entirely — if the button is missing from the Questions tab, that is why.

The **Slides to Include** card has the toggle switches that hide/show Prize, Costume Contest, Picture Round, Next Event, and Tiebreakers in the deck.

### 3. Picture Round tab
The picture round (Round 1) needs ten themed images. The workflow:

1. Click a numbered cell, then **⌘V (Mac) / Ctrl+V** to paste an image from your clipboard. Drag-and-drop a file onto the cell also works. Images are automatically downscaled and recompressed on the way in (so a full-resolution phone photo won't blow the browser's storage quota), saved to `localStorage`, and pushed to the display live.
2. **Crop / re-frame** — once an image is in a cell, drag it to pan the visible crop. The ↺ button next to a cell resets the crop to centered.
3. **Copy Handout to Clipboard** — copies a 1920×1080 print-friendly PNG (white background, dark borders, "PICTURE ROUND" title) for pasting into Word / Pages / email so the room can play with paper sheets.
4. **Download Handout PNG** — same image as a file.

Pictures travel with the deck: **Export Deck** on the Edit Questions tab bundles them (with the questions and game meta) into one JSON file, and **Import…** on another machine restores them instantly.

## Running the picture round on screen

Instead of (or as well as) handing out a picture sheet, you can show the stills on the TV one at a time, on a timer — the **Picture Show**.

1. **Show Setup → Picture Round → Mode**: pick **On screen** (no picture sheet — teams still need a blank answer sheet) or **Both** (handout *and* screen). **Paper handout** is the default and leaves the deck exactly as it always was.
2. Set **Seconds per image** (default 30) and **Passes** — how many times the whole set plays (default 2). **Sound** gives a soft tick on each still and a bell at the end. The opener and instruction-step copy switch to an on-screen version automatically; edit it right there. `{seconds}` and `{passes}` in the copy fill in from these settings (`{passes}` reads as "once" / "twice" / "three times").
3. Paste your stills in the **Picture Round** tab as usual. Empty cells are skipped — the show keeps each still's own number, so if you filled cells 1, 2 and 4 the room sees "Still 04" for the third picture and can match it to their sheet.
4. **Save & Push to Display.** The slide list now has a **Picture Show** slide right after the Round 1 instructions.

During the event:

- **Click the middle of the display window once** before the round (the left/right thirds navigate). Browsers keep sound off until the page itself has been clicked; until then the "Get Ready" card shows a small reminder and the show runs silently.
- Advance to the Picture Show slide. It holds on **Get Ready** — nothing moves until you press **Start** on the Presenter tab's **Picture Show** card.
- Each still shows for the set time with a big countdown, then the next appears. After the last one there's a 5-second **Second look — check your answers** card, then the next pass starts on its own. After the final pass it holds on **Pencils down**.
- The card's buttons: **Pause / Resume**, **← Back** and **Skip →** (one still, not one slide), **−10s / +10s** on the current still, and **Restart** (back to Get Ready).
- The deck never moves by itself — when you're ready, click **Next** to go to the intermission. Leaving the slide and coming back starts it over at Get Ready.
- Reloading the control window mid-show is safe: it picks the show's current state back up.

## Display keyboard shortcuts

If you want to drive the deck directly from the display window (no control window connected), all of these work:

- **← / →**, **Space**, **PgUp / PgDn** — previous / next slide
- **Home / End** — first / last slide
- **Number keys 1–9** — jump to slide N (10s of slides need the control window)
- **R** — reset to slide 0
- **Click left/right third of the screen** — back / forward (handy from a phone)
- **Browser Print → Save as PDF** — exports one slide per page at 1920×1080

Most events drive navigation from the control window instead, so the host can see "what's next" before the room does.

## Casting the display to a TV / projector

Same as any web page: HDMI cable, AirPlay, Chromecast, Miracast, or OBS Browser Source at 1920×1080. The deck auto-scales the 1920×1080 stage to whatever resolution the external display reports, so fullscreen the display window once and you're done.

---

# Instructions for Developers

## Quick start

```bash
npm install
npm run dev      # localhost:5173
npm run build    # production bundle in dist/
npm run preview  # serve dist/ for verification
npm run lint     # ESLint
```

Stack: React 18 + JSX (no TypeScript, by intent) + Vite 5, plus a custom `<deck-stage>` web component (vanilla JS) that handles slide layout, navigation, 1920×1080 auto-scaling, and print. Inline styles only — no CSS files.

## Structure

```
src/
├── main.jsx            entry — picks display vs control by URL hash
├── App.jsx             display: slide composition + broadcast wiring
├── ControlApp.jsx      control: presenter / editor / picture round tabs
├── rounds.js           DEFAULT_ROUNDS + structure helpers + JSON/CSV import-export + persistence
├── csv.js              dependency-free CSV parse/serialize
├── meta.js             title/end/next-event slide text + slide visibility toggles
├── pictures.js         picture round data + paste buffer
├── handout.js          canvas-based PNG renderers (picture handout + answer sheets)
├── broadcast.js        BroadcastChannel helper + useBroadcast hook
├── deck-stage.js       custom element (vanilla JS) — handles 1920×1080 auto-scale
└── slides.jsx          slide components + design system
```

`src/main.jsx` reads `window.location.hash` and renders display (`/`) or control (`/#/control`); a `hashchange` listener forces a full reload so each mode boots cleanly. The two windows exchange nav, content, and timer messages over `BroadcastChannel` — see `src/broadcast.js` and the message-type table in `CLAUDE.md`.

Two duplication points to know about: `ControlApp.jsx`'s `buildSlideOutline()` mirrors `App.jsx`'s slide composition by hand (add a slide in one, update the other), and the picture-round cell geometry is centralized in `pictures.js` so the slide, the canvas handout, and the editor preview crop identically.

## Relationship to the scaffold

This deck was forked out of `pub-trivia-scaffold` and keeps its engine, but it is **not** a scaffold. `/new-pub-trivia-deck` clones `~/Workspace/pub-trivia-scaffold` — never this repo. The club's palette, type, and slide copy are the product here; treating them as theme-leak anchors to be swapped would delete the deck.

Every identifier is namespaced `jxnfilmclub-trivia` — the package name, the `BroadcastChannel` name, the `localStorage` keys, and the JSON export type. Because the export type is namespaced, a deck bundle exported from the scaffold or from another sibling will not import here until you retag its `type` field.

Engine fixes worth sharing get ported back to the scaffold by hand. There is no automatic sync in either direction.

## Look and type

The deck wears JXN Film Club's **Night Shift** identity: ink black ground (`#100f0e`), signal red (`#d7321f`), paper white type (`#e8e3d8`). Square corners everywhere, borders over shadows, solid colors, no gradients on chrome.

Three voices, all **self-hosted** from `public/fonts/` — no Google Fonts, no third-party requests at runtime:

| Role | Face | Rendered as |
|---|---|---|
| Hero | Playfair Display | 900 italic — the signature |
| Display | Oswald | uppercase, wide tracking — labels and headings |
| Body | Newsreader | the reading voice |

Palette values track `~/Workspace/jxnfilmclub/css/tokens.css`, the club's design tokens. If the club's tokens move, move these with them.

## Rebranding

[`docs/REBRANDING.md`](docs/REBRANDING.md) is the playbook inherited from the scaffold: an asset list (logo, fonts, palette, copy — with priorities and specs), a decision matrix separating the **theme / group / venue / per-night / deploy** axes, and the developer checklist for identifier namespacing and deploy configuration. It is the pass that produced this deck; read it if you stand another one up.

## Deploy

Auto-deploys to **Cloudflare Workers** on every push to `main`, via the Workers build integration on the GitHub repo. Cloudflare runs `npm run build` and then `npx wrangler deploy`, which reads `wrangler.jsonc` and uploads `dist/` as Worker static assets.

The base is `/` (set in `vite.config.js`) because the Worker serves at the domain root; image fallbacks in `src/pictures.js` use `import.meta.env.BASE_URL` so they resolve in dev and prod alike. Live at `https://jxnfilmclub-trivia.michaellamb.workers.dev/`.

`wrangler.jsonc` is load-bearing: without it `wrangler deploy` falls back to framework auto-detection, which requires Vite >= 6 and fails the deploy step even though the build succeeds.

The `/#/control` route is intentionally ungated: every visitor's browser gets its own isolated `localStorage`, so writes only ever land in that visitor's own browser and every fresh session loads the `DEFAULT_*` content.

## Further reading

`CLAUDE.md` in this repo is the deep architectural reference — broadcast message types, the import/export formats, the palette naming convention, per-module notes, and the branding sites that make this deck the club's rather than the scaffold's.
