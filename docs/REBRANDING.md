# Rebranding Playbook

> **Inherited document — read this first.**
>
> This file came over from `pub-trivia-scaffold` unchanged. **Every "current value" below is
> the scaffold's Fertile Ground example, not this deck's.** This deck is JXN Film Club, on the
> "Night Shift" brand: ink black `#100f0e`, signal red `#d7321f`, paper `#e8e3d8`, self-hosted
> Playfair Display / Oswald / Newsreader, all radii square. See `CLAUDE.md` for the live values.
>
> It is kept for two things that are still true and still useful: the **asset list** (what a
> stakeholder has to supply, with specs and priorities) and the **decision matrix** separating
> the theme / group / venue / per-night / deploy axes. Read it if you stand another deck up.
> Do not read it as a description of this repo, and do not treat the branding it describes as
> theme-leak points waiting to be swapped — here, the club's look *is* the product.

**Purpose:** everything needed to stand this deck up for a **new group or venue** — the assets a stakeholder must supply, the decisions that have to be made, and the code sites where each one lands.

The scaffold ships **live Fertile Ground branding as its working example** (logo, "Presented at Fertile Ground", the gift-card prize slide). That's deliberate: every value below is real, so the shape of what you're replacing is never ambiguous. This doc marks every place a new group substitutes its own. Nothing here changes the trivia engine itself.

**How to read this doc.** Sections A–D are the stakeholder asset list — hand them to whoever owns the new brand; they fill in the "supply" side and hand the set back for implementation. Section E is the decision matrix (which choices belong to which axis), and section F is the developer checklist for the code-level rebrand.

**Priority key:** 🔴 **Required** for a rebrand · 🟡 **Recommended** · ⚪ **Optional / per-event** (editable live in the control window at `/#/control`, no code change).

> ⚠️ **Load-bearing anchors.** `/new-pub-trivia-deck` re-skins *clones* of this repo by matching the **exact strings** listed in CLAUDE.md § "Anchor strings the skill replaces". If you change one of those values **in the scaffold itself**, the skill silently breaks until its SKILL.md is updated to match. Rebranding a *clone* is always safe; editing the scaffold requires the paired skill update.

---

## A. Graphic assets — must be produced or sourced

| # | Asset | Priority | Spec | Current example |
|---|---|---|---|---|
| A1 | **Group / venue logo** | 🔴 | PNG, transparent background, roughly square, must read cleanly at ~110–150px tall. A light-on-dark variant too **if** the new palette flips light/dark. | `public/logo-fgbc-red.png` — alt text "Fertile Ground Beer Co". Appears on the **Title** and **End** slides. |
| A2 | **Favicon** | 🟡 | Browser-tab icon. `.png` (32×32 or 48×48) or `.ico`. **Net-new** — the deck currently ships without one. | *none today* |
| A3 | **Emblem / divider motif** | ⚪ | The slide divider is a neutral diamond today. If the new group has a signature emblem (mascot, icon, symbol), supply it as **SVG** or a clear reference to replace the diamond. If not, the diamond stays. | Diamond divider (`AccentBar`). Themed forks swap it for e.g. a hilt/wand/mascot. |
| A4 | **Picture-round photos** | ⚪ | Up to **10** photos. **Not required for the rebrand** — hosts normally paste these live per event in the control window, and pasted images override any committed files. Supply only if you want a fixed set baked in. | 10 slots, currently placeholders (none committed). |

<sub>Code targets: A1 → `LOGO_SRC` in `src/slides.jsx` + `alt` text a few lines below it, file in `public/` (deleting the PNG is also valid — `onError` hides it cleanly). A2 → `<link rel="icon">` in `index.html` + file in `public/`. A3 → `AccentBar` in `src/slides.jsx` (rename hits 3 sites: definition + 2 calls). A4 → `public/images/picture-01.png` … `picture-10.png`.</sub>

## B. Fonts — supply three family names

The deck uses three type roles. Each must be available on [Google Fonts](https://fonts.google.com) (how the deck loads them) or be delivered as web-font files.

| Role | What it's for | Current |
|---|---|---|
| **Hero** 🔴 | Big impact headlines (title, round openers) | **Alfa Slab One** |
| **Display** 🔴 | Labels, subheadings, question numbers | **Oswald** |
| **Body** 🔴 | Paragraph / rule copy | **Work Sans** |

<sub>Code targets: `heroFont` / `displayFont` / `bodyFont` in `src/slides.jsx`, plus the Google Fonts `<link>` in `index.html`. **Both must be updated together.**</sub>

## C. Color palette — supply hex values

Seven core tokens define the whole look; four accent colors drive per-slide highlights. **Token names never change — a rebrand changes the values, not the keys.**

### Core palette

| Token | Role | Current | New value |
|---|---|---|---|
| `ink` | **Slide background** | `#1A2A4A` (navy) | |
| `inkDeep` | Outline + hard-shadow near-black | `#1A1410` | |
| `paper` | **Primary text color** | `#F2E8CF` (cream) | |
| `paperDim` | Muted / secondary text (paper @ ~60%) | `#F2E8CF99` | |
| `rust` | Structural red — rule bars, red feature slides, chips | `#C8201E` | |
| `rustDeep` | Question-number drop shadow | `#9A1716` | |
| `gold` | Highlight color (the deck's global accent) | `#E2A828` | |

> `ink` is always the background and `paper` is always the text color — regardless of whether the scheme is light-on-dark or dark-on-light. Supply the values; the names don't change. Translucent surfaces derive from these via alpha-hex suffixes (`${PALETTE.paper}29` etc.), so they track a palette swap automatically.

### Accent colors (highlights)

| Accent | Current | New value |
|---|---|---|
| Blue | `#5B8DD9` | |
| Green | `#4E9A6A` | |
| Red | `#C8201E` | |
| Gold | `#E2A828` | |

- **Global accent:** which of the four is the default highlight. Current: **Gold**.
- **Per-round accent rotation (optional):** each round can use a different accent. Currently **off**. Specify a mapping only if wanted.

<sub>Code targets: `PALETTE` and `ACCENTS` in `src/slides.jsx`; `DEFAULT_ACCENT` / `ROUND_ACCENTS` in `src/App.jsx`. **⚠️ The background/text/selection hexes are duplicated in the inline `<style>` in `index.html` — both places must be updated together.**</sub>

## D. Copy / text content — supply wording

No design work — just words. ⚪ items are editable live in the control window and need no code change; supply them only for new baked-in defaults.

### D1. Title slide & page 🔴

| Field | Current | Lands in |
|---|---|---|
| Eyebrow | "Presented at Fertile Ground" | `src/meta.js` `DEFAULT_META.title` |
| Edition | "Taproom Trivia" | `src/meta.js` |
| Tagline | "Summer Series" | `src/meta.js` |
| Hosts | "Jack Smith · Michael Lamb" | `src/meta.js` |
| Footer date | "July 7 · 2026" | `src/meta.js` |
| Title-slide venue label (footer) | "Fertile Ground" | `FooterBar left=` on the title slide in `src/slides.jsx` |
| Browser page title | "Taproom Trivia · Fertile Ground" | `<title>` in `index.html` |

### D2. Prize slide 🔴

| Field | Current |
|---|---|
| Eyebrow / hero | "Tonight's Bounty" / "Grand Prize" |
| Prize amount | "$100" |
| Prize name | "FERTILE GROUND GIFT CARD" |
| Tagline | "More than enough to cover your tab tonight." |

*Supply the new group's prize wording + amount (all in `src/slides.jsx` `PrizeSlide`).*

### D3. Costume contest slide 🟡

Venue-specific — **confirm keep, replace, or drop.** Title "Costume Contest" + four rule lines, including a "package beer" side prize. Provide replacement rules, or say "hide it" (the `show.costumeContest` toggle removes the slide without a code change).

### D4. Next-event slide ⚪

"Before You Go" / "Next Trivia Night" / date "TBA" / venue "Fertile Ground" / "Same teams welcome back. Bring a friend." — defaults in `src/meta.js` `DEFAULT_META.nextEvent`.

### D5. End slide ⚪

"Thanks For" / "Playing." / "Hosts Tallying Scores · Stand By" — defaults in `src/meta.js` `DEFAULT_META.end`.

### D6. Picture-round handout instruction ⚪

"Identify the character, place, ship or creature." — reword to match the picture theme (`src/meta.js` `DEFAULT_META.pictureRound`).

### D7. Rounds, questions & tiebreakers ⚪

Round titles/subtitles plus all questions and the 3 tiebreakers. **Fully editable live** in the control window or via CSV / Google Sheets import — this is normally **per-event content, not a rebrand asset**. Supply new defaults only for a fresh baseline (`DEFAULT_ROUNDS` / `DEFAULT_TIEBREAKERS` in `src/rounds.js`).

---

## E. Decision matrix — which choices belong to which axis

Five axes, from most to least permanent. A decision on one axis never forces one on another.

| Axis | Decided by | What it covers | Where it lands |
|---|---|---|---|
| **Theme** | deck designer, once per themed deck | `PALETTE` + `ACCENTS` values, `DEFAULT_ACCENT`, optional `ROUND_ACCENTS` rotation, fonts, `AccentBar` emblem, rules / costume / picture-instruction copy, default rounds + tiebreakers | `src/slides.jsx`, `src/App.jsx`, `src/rounds.js`, `index.html` — this is the axis `/new-pub-trivia-deck` automates |
| **Group / series** | the trivia group, once per series | Edition name (`title.edition` — "Taproom Trivia"), series tagline (`title.tagline` — "Summer Series"), the shared question-writing sheet (`SHEET_TEMPLATE_ID` in `src/ControlApp.jsx` — each group makes its own; `''` hides the button), CSV template header line in `buildCsvTemplate()` | `src/meta.js`, `src/ControlApp.jsx`, `src/rounds.js` |
| **Venue** | the venue relationship, once per residency | Eyebrow "Presented at …", `nextEvent.venue`, logo PNG + `alt`, title-slide `FooterBar left=`, prize copy (D2), costume-contest keep/replace, the `· <Venue>` suffix in `<title>` | `src/meta.js`, `src/slides.jsx`, `index.html`, `public/` |
| **Per-night** | the host, live at the event | Every `DEFAULT_META` text field, `show.*` slide toggles, timer + question-number display options, picture-round photos + fit/aspect, and the questions themselves (deck-bundle JSON / CSV / Sheets import) | control window only — **never a code edit**; per-night state lives in the browser + exported deck bundles, not the repo |
| **Deploy** | whoever operates the repo, once per fork | Hosting target and everything that follows from it (table below) | `vite.config.js`, CI config, `scripts/deploy.sh` |

### Deploy decision cluster

Two proven configurations — the scaffold's (GitLab Pages) and fertile-ground-trivia's (Cloudflare Pages). `base` is the single knob the runtime cares about: `LOGO_SRC` and the picture fallback paths all derive from `import.meta.env.BASE_URL`.

| Knob | GitLab Pages (scaffold) | Cloudflare Pages (fertile-ground) |
|---|---|---|
| `vite.config.js` `base` | `'/<slug>-trivia/'` (subpath) | `'/'` (domain root) |
| CI | `.gitlab-ci.yml` (generic, no edits needed) | none — Cloudflare's GitHub git integration builds on push |
| Node version pin | `node:20-alpine` in the CI YAML | `.node-version` file = `20` |
| `scripts/deploy.sh` URL line | `https://michaellambgelo.gitlab.io/<slug>-trivia/` | `https://<project>.pages.dev` |
| Repo host / visibility | GitLab, public | GitHub, private |
| PR preview deploys | no | yes |

The deployed URL in `scripts/deploy.sh` is hardcoded — it's part of the rebrand checklist, not something the router derives.

---

## F. Developer checklist — the code-level rebrand

### F1. Identifier namespace (8 sites + lockfile)

Mechanical rename of the `pub-trivia-scaffold` slug so sibling decks can run side-by-side in one browser without crossing streams:

| Site | File |
|---|---|
| `"name"` | `package.json` (+ 2 occurrences in `package-lock.json`) |
| `CHANNEL_NAME` | `src/broadcast.js` |
| `STORAGE_KEY` (`.rounds`) + `TIEBREAKER_STORAGE_KEY` (`.tiebreakers`) | `src/rounds.js` |
| `STORAGE_KEY` (`.pictures`) | `src/pictures.js` |
| `STORAGE_KEY` (`.meta`) | `src/meta.js` |
| `QUESTIONS_EXPORT_TYPE` (`<slug>-trivia/questions`) | `src/rounds.js` |
| Import-error string (`'Not a … questions export'`) | `src/rounds.js` |

**Export-type compatibility cost.** Renaming `QUESTIONS_EXPORT_TYPE` means deck-bundle JSON exported from any other deck in the family **will not import** without hand-editing its `type` field — there is no accepted-types list. Decide deliberately: namespacing buys isolation and costs portability.

### F2. Deliberately NOT renamed

- The `<deck-stage>` custom element (`src/deck-stage.js`) — page-scoped, no cross-deck collision possible. Leave it.
- `ACCENTS` keys (`accent-blue` / `green` / `red` / `gold`) — internal preset identifiers, never user-visible. Tune the values.

### F3. Sanity baseline

- `npm run lint` — 0 errors, exactly 2 known warnings (empty catches in `deck-stage.js`).
- `npm run build` — clean.
- No comment line in `buildCsvTemplate()` (`src/rounds.js`) may contain a comma or quote — a quoted cell defeats Google Sheets' automatic separator detection and collapses the template into one column.

---

## Handoff summary

**Minimum to rebrand (🔴):** logo PNG (A1) · three font families (B) · palette hexes, 7 core + accents (C) · title-slide + prize copy (D1, D2).

**Recommended (🟡):** favicon (A2) · costume-contest decision (D3).

**Optional / per-event (⚪):** emblem (A3) · picture photos (A4) · next-event / end / handout copy (D4–D6) · questions & tiebreakers (D7). All ⚪ copy can be typed into the live control window — no developer needed.

Plus the two per-fork developer decisions: **identifier namespace** (F1, with the export-type tradeoff) and the **deploy cluster** (section E).
