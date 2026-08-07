# Pub Trivia Scaffold

The source-of-truth for browser-only **pub trivia** presentation decks — and a hostable **General Trivia** deck in its own right. Teams play across rounds of questions on written paper sheets, hosts grade per round. Plus an optional picture round (10 images, played from a handout), optional tiebreakers, and a next-event announcement slide.

The deck ships ready to host: 4 rounds × 10 real general-knowledge questions under a "GENERAL TRIVIA" title slide, with the round count and questions-per-round fully editable from the control window (or via CSV import).

Two audiences, two halves of this document:

- **[Instructions for Hosts](#instructions-for-hosts)** — running an event: the two windows, game flow, the control tabs, casting to a TV.
- **[Instructions for Developers](#instructions-for-developers)** — building, deploying, the file layout, and how themed decks are produced.

---

# Instructions for Hosts

## The two windows

The deck has **two URLs** that you open in two separate browser windows on the same origin:

| URL | Mode | Where to open it |
|---|---|---|
| [`https://michaellambgelo.gitlab.io/pub-trivia-scaffold/`](https://michaellambgelo.gitlab.io/pub-trivia-scaffold/) | **Display** | The TV / projector / external screen the room watches |
| [`https://michaellambgelo.gitlab.io/pub-trivia-scaffold/#/control`](https://michaellambgelo.gitlab.io/pub-trivia-scaffold/#/control) | **Control** | Your laptop screen — editor + presenter view |
| `http://localhost:5173/` | **Display** | The TV / projector / external screen the room watches |
| `http://localhost:5173/#/control` | **Control** | Your laptop screen — editor + presenter view |

The two windows talk live via `BroadcastChannel` (a built-in browser API; no server). Edits in the control window push to the display instantly; navigating in control drives the display.

## Game flow

A typical event flows through this slide order:

1. **Title** — venue, edition, hosts, date.
2. **Rules** — four house rules (no phones, spelling best-attempt, hosts final, have fun).
3. **Prize** *(optional)*, **Costume Contest** *(optional)* — toggleable from Edit Questions.
4. **Round 1 (Picture Round)** *(optional)* — opener → instructions → intermission → recap. Always image-based; the host hands out a paper sheet generated from the Picture Round tab.
5. **Rounds 2–5** *(or however many you configure — rounds and questions-per-round are editable)* — each round is opener → questions → intermission → recap. Question slides have a per-question countdown timer in the corner.
6. **End** — sign-off slide while hosts tally scores.
7. **Next Event** *(optional)* — announces the next trivia night (date / venue / detail, edited per event).
8. **Tiebreakers** *(optional)* — parked at the very end of the deck; advance into them only when there's an actual tie.

Anything from #3 onward (prize / costume / picture round / next event / tiebreakers) can be hidden per-event from the control window's **Edit Questions → Slides to Include** card, so a single deck handles "full event" and "casual game night" formats without code changes.

## Control mode

Three tabs:

### 1. Presenter tab
A live outline of every slide in the deck with the active slide highlighted. Click any row to jump the display straight to that slide. The currently-active question slide also surfaces a **timer panel**: Start/Pause, Reset, ±10s — the timer state is broadcast to the display, so the room sees the seconds ticking down on the slide while you control it from your laptop.

### 2. Edit Questions tab
Cards at the top edit the **Title Slide**, **End Slide**, and **Next Event Slide** strings (eyebrow, hero text, edition, hosts, date, sign-off, next-event details). Below that, cards per round let you edit each question and answer — plus restructure the game: **add/remove questions** within a round (the "N Questions" kicker tracks the count automatically), and **add/remove whole rounds**. Edits are buffered locally — "Save & Push to Display" sends them to the display (and persists to `localStorage`), "Revert" discards.

Bulk editing goes through **Export Deck / Import…**: **Export Deck** is the one export — a JSON file carrying the questions, tiebreakers, picture round (images included), and all game meta, so importing it on another machine restores the whole event. Import also accepts spreadsheet CSVs (`round,round_title,question,answer,subtitle,kicker`, with `TB` rows for tiebreakers) — round count and questions-per-round are detected from the rows — and the older `category,question` writer-template CSV, which opens a category→round mapping dialog.

#### Writing questions in a spreadsheet

Most questions get drafted in a spreadsheet before the event rather than typed in here. Two buttons seed one:

- **Google Sheets Template ↗** opens Google's *Make a copy* dialog on your group's shared template. The writer gets their **own private copy** — nobody else can see it, including you, unless they share it back. Hand this button (or the link behind it) to anyone writing questions. *The scaffold ships with this button hidden — each group makes its own template sheet and sets `SHEET_TEMPLATE_ID` in `src/ControlApp.jsx` (see below).*
- **CSV Template** downloads the same thing as a file, for Excel or Numbers.

The writer fills in the rows, then `File → Download → Comma-separated values`, and you drop that file into **Import…**. Round count and questions-per-round are read from the rows; the import reports what it loaded, and lands in the editor as unsaved changes so you can review before **Save & Push**.

Two things to know:

- **Sheets exports only the active tab.** Keep the template to one tab.
- **Never publish a sheet that has real questions in it.** *File → Share → Publish to web* makes it readable by anyone on the internet, and it is not the same as link-sharing. A template is safe to share because it holds no questions; the writers' copies are private by default. Leave it that way.

To build your group's shared template: click **CSV Template**, then in a new Sheet use `File → Import → Upload → Replace spreadsheet` (Separator type **Comma**). Share it *Anyone with the link → Viewer* and put its file ID (from the `/d/<ID>/edit` URL — **not** a `2PACX-…` publish token) in `SHEET_TEMPLATE_ID` in `src/ControlApp.jsx`.

The **Slides to Include** card has the toggle switches that hide/show Prize, Costume Contest, Picture Round, Next Event, and Tiebreakers in the deck.

### 3. Picture Round tab
The picture round (Round 1) needs ten themed images. The workflow:

1. Click a numbered cell, then **⌘V (Mac) / Ctrl+V** to paste an image from your clipboard. Drag-and-drop a file onto the cell also works. Images are automatically downscaled and recompressed on the way in (so a full-resolution phone photo won't blow the browser's storage quota), saved to `localStorage`, and pushed to the display live.
2. **Crop / re-frame** — once an image is in a cell, drag it to pan the visible crop. The ↺ button next to a cell resets the crop to centered.
3. **Copy Handout to Clipboard** — copies a 1920×1080 print-friendly PNG (white background, dark borders, "PICTURE ROUND" title) for pasting into Word / Pages / email so the room can play with paper sheets.
4. **Download Handout PNG** — same image as a file.

Pictures travel with the deck: **Export Deck** on the Edit Questions tab bundles them (with the questions and game meta) into one JSON file, and **Import…** on another machine restores them instantly.

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

## How themed decks are produced

The `/new-pub-trivia-deck` Claude Code skill clones this scaffold to `~/Workspace/<slug>-trivia` and swaps every theme-leak point (palette, slide copy, BroadcastChannel name, `localStorage` keys, package name, Vite `base`), then re-fills `DEFAULT_ROUNDS` with real themed trivia questions per round.

Because the skill edits **exact anchor strings**, changing them casually will silently break it. The authoritative anchor table lives in `CLAUDE.md` — read it before renaming constants, palette keys, storage keys, or slide copy.

## Rebranding for a new group or venue

Theming is only one axis. Standing the deck up for a **different group or venue** — new logo, new "Presented at …", new prize, new deploy target — is a separate, mostly orthogonal set of decisions that the skill deliberately does *not* touch (it keeps the venue branding as-is). [`docs/REBRANDING.md`](docs/REBRANDING.md) is the full playbook: a stakeholder-facing asset list (logo, fonts, palette, copy — with priorities and specs), a decision matrix separating the **theme / group / venue / per-night / deploy** axes, and the developer checklist for identifier namespacing and the deploy configuration. The scaffold ships live Fertile Ground branding as the working example of every venue slot.

## Deploy

Auto-deploys to GitLab Pages via `.gitlab-ci.yml` on every push to `main`. The subpath base is `/pub-trivia-scaffold/` (set in `vite.config.js`); image fallbacks in `src/pictures.js` use `import.meta.env.BASE_URL` so they resolve in both dev (`/`) and prod. Live at `https://michaellambgelo.gitlab.io/pub-trivia-scaffold/`.

The `/#/control` route is intentionally ungated: every visitor's browser gets its own isolated `localStorage`, so writes only ever land in that visitor's own browser and every fresh session loads the `DEFAULT_*` content.

## Further reading

`CLAUDE.md` in this repo is the deep architectural reference — broadcast message types, the import/export formats, the palette naming convention, per-module notes, and the anchor strings the skill replaces.
