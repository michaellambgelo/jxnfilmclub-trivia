import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadRounds, saveRounds, resetRounds, DEFAULT_ROUNDS,
  loadTiebreakers, saveTiebreakers, resetTiebreakers, DEFAULT_TIEBREAKERS,
  buildQuestionsExport, parseImport, buildCsvTemplate,
  recapSplitsFor, normalizeQuestion, displayRoundNumber,
  renumberRounds, makeBlankRound, deriveKicker, isAutoKicker,
} from './rounds.js';
import { loadMeta, saveMeta, resetMeta, sanitizeMeta, DEFAULT_META } from './meta.js';
import {
  loadPastes, savePastes, clearPastes, mergeItems, normalizePastes, ingestImage,
  PICTURE_ASPECTS, resolveAspect,
} from './pictures.js';
import {
  copyHandoutToClipboard, downloadHandoutPng, downloadAnswersHandoutPng,
} from './handout.js';
import { broadcast, useBroadcast } from './broadcast.js';

// ============================================================
// STYLES — terminal-y panel, distinct from the show deck.
// ============================================================
const COLORS = {
  bg: '#0B0E1A',
  panel: '#11162A',
  panelAlt: '#161C36',
  text: '#F2E9D8',
  textDim: '#8A91A8',
  border: '#252B45',
  accent: '#5BC8FF',
  accentDim: 'rgba(91, 200, 255, 0.18)',
  warn: '#FFC857',
  danger: '#FF5A5A',
};

const baseStyle = {
  margin: 0, minHeight: '100vh', background: COLORS.bg, color: COLORS.text,
  fontFamily: "'Newsreader', Georgia, serif", fontSize: 14, lineHeight: 1.4,
};

// Track viewport width so layouts can stack at narrow widths (split-tab use,
// embedded views). One breakpoint at 1100px is enough — below it, two-column
// grids become single column. Inline-style architecture means no media
// queries; this hook + a `narrow` boolean is the conventional replacement.
const NARROW_BREAKPOINT = 1100;
function useNarrowLayout() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < NARROW_BREAKPOINT
  );
  useEffect(() => {
    const handler = () => setNarrow(window.innerWidth < NARROW_BREAKPOINT);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return narrow;
}

// The shared question-writing template, as a Google Sheet. This is the FILE ID
// from the sheet's normal edit URL:
//
//   https://docs.google.com/spreadsheets/d/<FILE_ID>/edit
//
// NOT the `2PACX-…` token from a File → Share → Publish-to-web URL: that's a
// publish handle, and /copy does not accept it.
//
// The /copy suffix forces Google's "Make a copy" dialog instead of opening the
// original, so each writer ends up owning a private copy. That's what keeps the
// questions private: the template holds no questions, and nobody but its owner
// can see a copy. Share the template itself "Anyone with the link → Viewer".
//
// Seed it with the CSV Template button's download, via
// File → Import → Upload → Replace spreadsheet, and set Separator type to
// **Comma** — "Detect automatically" mis-splits the instruction rows, and
// pasting the CSV in doesn't split it into columns at all.
//
// The sheet must be shared "Anyone with the link → Viewer". Publish-to-web is
// NOT the same thing and does not work here: /copy reads the document's
// sharing setting, so a published-but-restricted sheet sends writers to a
// sign-in wall.
//
// Empty string = not configured yet; the button hides rather than 404.
// The scaffold ships unconfigured — each group makes its own template sheet
// (see "Writing questions in a spreadsheet" in README.md) and puts the ID here.
const SHEET_TEMPLATE_ID = '';
const SHEET_TEMPLATE_URL = SHEET_TEMPLATE_ID
  ? `https://docs.google.com/spreadsheets/d/${SHEET_TEMPLATE_ID}/copy`
  : '';

// A CSV import replaces the whole question set silently otherwise — the draft
// swaps out with no visible acknowledgement. Spell out what landed so the host
// can tell a successful import from a no-op.
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
function describeImport({ rounds, tiebreakers }) {
  const questions = rounds.reduce((sum, r) => sum + r.questions.length, 0);
  const parts = [plural(rounds.length, 'round'), plural(questions, 'question')];
  if (tiebreakers) parts.push(plural(tiebreakers.length, 'tiebreaker'));
  return `Imported ${parts.join(' · ')}.`;
}

// ============================================================
// CONTROL APP
// ============================================================
export default function ControlApp() {
  const [rounds, setRounds] = useState(() => loadRounds());
  const [tiebreakers, setTiebreakers] = useState(() => loadTiebreakers());
  const [meta, setMeta] = useState(() => loadMeta());
  const [pastes, setPastes] = useState(() => loadPastes());
  const [tab, setTab] = useState('present');
  const [currentSlide, setCurrentSlide] = useState({ index: 0, total: 0, label: '' });
  const [timer, setTimer] = useState({ seconds: 0, paused: false, enabled: false });

  // Push edits to the display window.
  const commitRounds = useCallback((next) => {
    setRounds(next);
    saveRounds(next);
    broadcast('rounds:update', next);
  }, []);

  const commitTiebreakers = useCallback((next) => {
    setTiebreakers(next);
    saveTiebreakers(next);
    broadcast('tiebreakers:update', next);
  }, []);

  const commitMeta = useCallback((next) => {
    setMeta(next);
    saveMeta(next);
    broadcast('meta:update', next);
  }, []);

  // Broadcast BEFORE persisting: if the localStorage write fails (quota),
  // the display still gets the images for this session. Returns the save
  // result so panels can warn that the buffer won't survive a reload.
  const commitPastes = useCallback((next) => {
    setPastes(next);
    broadcast('pictures:update', next);
    return savePastes(next);
  }, []);

  // Listen for slide / timer state coming back from the display window.
  useBroadcast(useCallback((msg) => {
    if (msg.type === 'slidechange') setCurrentSlide(msg.payload);
    else if (msg.type === 'timer:state') setTimer(msg.payload);
  }, []));

  // On mount, ask display for current state in case it was already running.
  useEffect(() => {
    broadcast('sync:request', null);
  }, []);

  // The Picture Round interface only applies when that round is in the deck.
  // If it's switched off while the Picture Round tab is open, fall back.
  const pictureRoundEnabled = meta.show.pictureRound;
  useEffect(() => {
    if (!pictureRoundEnabled && tab === 'pictures') setTab('present');
  }, [pictureRoundEnabled, tab]);

  return (
    <div style={baseStyle}>
      <Header tab={tab} setTab={setTab} currentSlide={currentSlide} pictureRoundEnabled={pictureRoundEnabled} />
      {tab === 'present' && (
        <PresenterPanel
          currentSlide={currentSlide}
          timer={timer}
          rounds={rounds}
          tiebreakers={tiebreakers}
          meta={meta}
        />
      )}
      {tab === 'edit' && (
        <EditorPanel
          rounds={rounds}
          tiebreakers={tiebreakers}
          meta={meta}
          pastes={pastes}
          commitRounds={commitRounds}
          commitTiebreakers={commitTiebreakers}
          commitMeta={commitMeta}
          commitPastes={commitPastes}
        />
      )}
      {tab === 'pictures' && pictureRoundEnabled && (
        <PicturesPanel
          pastes={pastes}
          commitPastes={commitPastes}
          meta={meta}
          rounds={rounds}
        />
      )}
    </div>
  );
}

// ============================================================
// HEADER
// ============================================================
function Header({ tab, setTab, currentSlide, pictureRoundEnabled = true }) {
  const tabs = [
    { id: 'present', label: 'Presenter' },
    { id: 'edit', label: 'Edit Questions' },
    { id: 'pictures', label: 'Picture Round', disabled: !pictureRoundEnabled },
  ];
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 24, padding: '14px 24px',
      borderBottom: `1px solid ${COLORS.border}`, background: COLORS.panel,
      position: 'sticky', top: 0, zIndex: 10,
      flexWrap: 'wrap', rowGap: 8,
    }}>
      <div style={{ fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
        fontSize: 12, color: COLORS.accent, whiteSpace: 'nowrap' }}>
        ★ Trivia Control
      </div>
      <nav style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {tabs.map((t) => (
          <button key={t.id}
            onClick={() => { if (!t.disabled) setTab(t.id); }}
            disabled={t.disabled}
            title={t.disabled ? 'Picture round is off — enable it under "Slides to Include"' : undefined}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid transparent',
              background: tab === t.id ? COLORS.accentDim : 'transparent',
              color: tab === t.id ? COLORS.accent : COLORS.textDim,
              fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
              cursor: t.disabled ? 'not-allowed' : 'pointer',
              opacity: t.disabled ? 0.4 : 1,
              whiteSpace: 'nowrap',
            }}>
            {t.label}
          </button>
        ))}
        {/* Quick link: pop the display (no #/control hash) into a new tab —
            the window you drag to the TV. Same pathname keeps the Pages
            subpath base intact in dev and prod. */}
        <a
          href={`${window.location.pathname}${window.location.search}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open the display in a new tab"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 6,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.accent, textDecoration: 'none',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
            whiteSpace: 'nowrap',
          }}>
          Display
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </nav>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center',
        fontSize: 12, color: COLORS.textDim, flexWrap: 'wrap', minWidth: 0 }}>
        <span style={{ whiteSpace: 'nowrap' }}>
          Slide{' '}
          <strong style={{ color: COLORS.text }}>
            {currentSlide.total > 0 ? currentSlide.index + 1 : '—'}
          </strong>
          {' / '}
          {currentSlide.total || '—'}
        </span>
        {currentSlide.label && (
          <span style={{ color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            · {currentSlide.label}
          </span>
        )}
      </div>
    </header>
  );
}

// ============================================================
// PRESENTER PANEL — nav + timer + slide list
// ============================================================
function PresenterPanel({ currentSlide, timer, rounds, tiebreakers, meta }) {
  const slideList = useMemo(() => buildSlideOutline(rounds, tiebreakers, meta), [rounds, tiebreakers, meta]);
  const narrow = useNarrowLayout();

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) 360px',
      gap: 16, padding: 16,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <NavCard currentSlide={currentSlide} slideList={slideList} narrow={narrow} />
        <TimerCard timer={timer} />
      </div>
      <SlideList slideList={slideList} currentIndex={currentSlide.index} narrow={narrow} />
    </div>
  );
}

function NavCard({ currentSlide, slideList, narrow }) {
  const goPrev = () => broadcast('nav:prev', null);
  const goNext = () => broadcast('nav:next', null);
  const goReset = () => broadcast('nav:goto', 0);
  const current = slideList[currentSlide.index];
  const next = slideList[currentSlide.index + 1];
  // Side-by-side Now / Up Next when there's room; stack vertically below
  // ~520px (very-narrow). The parent breakpoint covers the typical case.
  const veryNarrow = narrow && typeof window !== 'undefined' && window.innerWidth < 520;

  return (
    <Card title="Navigation">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button onClick={goPrev}>← Previous</Button>
        <Button onClick={goNext} primary>Next →</Button>
        <Button onClick={goReset} secondary>Reset to Title</Button>
      </div>
      <div style={{
        marginTop: 18, display: 'grid',
        gridTemplateColumns: veryNarrow ? '1fr' : '1fr 1fr',
        gap: 14,
      }}>
        <PreviewBlock label="Now" slide={current} accent />
        <PreviewBlock label="Up Next" slide={next} />
      </div>
    </Card>
  );
}

function PreviewBlock({ label, slide, accent = false }) {
  return (
    <div style={{
      padding: 12, borderRadius: 8,
      border: `1px solid ${accent ? COLORS.accent : COLORS.border}`,
      background: accent ? COLORS.accentDim : COLORS.panel,
    }}>
      <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
        color: accent ? COLORS.accent : COLORS.textDim, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: COLORS.text, fontWeight: 500 }}>
        {slide ? slide.label : '—'}
      </div>
      {slide?.detail && (
        <div style={{ marginTop: 6, fontSize: 12, color: COLORS.textDim,
          maxHeight: 80, overflow: 'hidden' }}>
          {slide.detail}
        </div>
      )}
    </div>
  );
}

function TimerCard({ timer }) {
  return (
    <Card title="Timer">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <div style={{
          fontFamily: "'Oswald', 'Helvetica Neue', Arial, sans-serif", fontSize: 64, fontWeight: 700,
          color: timer.enabled ? (timer.seconds <= 10 ? COLORS.danger : COLORS.accent) : COLORS.textDim,
          lineHeight: 1,
        }}>
          {timer.enabled ? `${timer.seconds}s` : 'OFF'}
        </div>
        <div style={{ fontSize: 12, color: COLORS.textDim }}>
          {timer.enabled ? (timer.paused ? 'Paused' : 'Running') : 'Runs on question slides — toggle in the Display card'}
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button onClick={() => broadcast('timer:toggle', null)} disabled={!timer.enabled}>
          {timer.paused ? 'Resume' : 'Pause'}
        </Button>
        <Button onClick={() => broadcast('timer:reset', null)} disabled={!timer.enabled}>
          Reset
        </Button>
        <Button onClick={() => broadcast('timer:adjust', -10)} disabled={!timer.enabled} secondary>
          −10s
        </Button>
        <Button onClick={() => broadcast('timer:adjust', 10)} disabled={!timer.enabled} secondary>
          +10s
        </Button>
      </div>
    </Card>
  );
}

function SlideList({ slideList, currentIndex, narrow }) {
  // When stacked under the other Presenter cards, cap the slide list at a
  // shorter height so it doesn't dominate the viewport (still scrolls).
  const maxHeight = narrow ? 480 : 'calc(100vh - 180px)';
  return (
    <Card title={`Slide List (${slideList.length})`} compact>
      <div style={{ maxHeight, overflowY: 'auto', margin: '-12px -16px',
        padding: '4px 0' }}>
        {slideList.map((s, i) => {
          const isCurrent = i === currentIndex;
          return (
            <button key={s.key} onClick={() => broadcast('nav:goto', i)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 16px', border: 0, background: isCurrent ? COLORS.accentDim : 'transparent',
                color: isCurrent ? COLORS.accent : COLORS.text,
                fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
                borderLeft: `3px solid ${isCurrent ? COLORS.accent : 'transparent'}`,
              }}>
              <span style={{ color: COLORS.textDim, marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ============================================================
// EDITOR PANEL — long form, edit metadata + questions
// ============================================================
function EditorPanel({ rounds, tiebreakers, meta, pastes, commitRounds, commitTiebreakers, commitMeta, commitPastes }) {
  const [draft, setDraft] = useState(rounds);
  const [draftTiebreakers, setDraftTiebreakers] = useState(tiebreakers);
  const [draftMeta, setDraftMeta] = useState(meta);
  const [dirty, setDirty] = useState(false);
  const [csvImport, setCsvImport] = useState(null);
  const [importNote, setImportNote] = useState('');
  const fileInputRef = useRef(null);

  // If the persisted data changes externally (e.g. another window saved), pull
  // it in — but only when not editing, to avoid clobbering in-flight edits.
  useEffect(() => {
    if (!dirty) setDraft(rounds);
  }, [rounds, dirty]);
  useEffect(() => {
    if (!dirty) setDraftTiebreakers(tiebreakers);
  }, [tiebreakers, dirty]);
  useEffect(() => {
    if (!dirty) setDraftMeta(meta);
  }, [meta, dirty]);

  const cloneQ = (q) => (typeof q === 'string' ? q : { ...q });

  const update = (path, value) => {
    setDirty(true);
    setDraft((d) => {
      const next = d.map((r) => ({ ...r, questions: r.questions.map(cloneQ) }));
      const [ri, field, qi] = path;
      if (field === 'questions') next[ri].questions[qi] = value;
      else next[ri][field] = value;
      return next;
    });
  };

  // Per-question field update that handles the dual string/object shape.
  // If the only non-empty field is `prompt`, the question stays as a plain
  // string (legacy-light). Any media or answer turns it into an object.
  const updateQuestion = (ri, qi, field, value) => {
    setDirty(true);
    setDraft((d) => {
      const next = d.map((r) => ({ ...r, questions: r.questions.map(cloneQ) }));
      const current = normalizeQuestion(next[ri].questions[qi]);
      const merged = { ...current, [field]: value };
      // Strip empty string fields so the object form stays clean.
      Object.keys(merged).forEach((k) => {
        if (merged[k] === '' || merged[k] === undefined) delete merged[k];
      });
      const hasMedia = !!(merged.answer || merged.audioUrl || merged.imageUrl || merged.videoUrl || merged.displayHint);
      next[ri].questions[qi] = hasMedia ? merged : (merged.prompt || '');
      return next;
    });
  };

  const updateTiebreaker = (i, value) => {
    setDirty(true);
    setDraftTiebreakers((tb) => tb.map((t, idx) => (idx === i ? value : t)));
  };

  // Structural edits — add/remove questions and whole rounds. Kickers that
  // look auto-generated ("10 Questions") track the count; custom kickers
  // are left alone. Round numbers stay sequential from 2 via renumberRounds.
  const maybeRederiveKicker = (round) =>
    isAutoKicker(round.kicker) ? { ...round, kicker: deriveKicker(round.questions.length) } : round;

  const addQuestion = (ri) => {
    setDirty(true);
    setDraft((d) => d.map((r, i) => (
      i === ri ? maybeRederiveKicker({ ...r, questions: [...r.questions.map(cloneQ), ''] }) : r
    )));
  };

  const removeQuestion = (ri, qi) => {
    setDirty(true);
    setDraft((d) => d.map((r, i) => (
      i === ri
        ? maybeRederiveKicker({ ...r, questions: r.questions.filter((_, j) => j !== qi).map(cloneQ) })
        : r
    )));
  };

  const addRound = () => {
    setDirty(true);
    setDraft((d) => renumberRounds([...d, makeBlankRound()]));
  };

  // Round cards mirror what the room sees: with the picture round hidden,
  // display numbers shift down by 1, so show "Round 1 (R2)" — the display
  // number first, internal n in parens (ROUND_ACCENTS and CSV mapping key
  // off internal n). With the picture round shown the two match; plain "Round 2".
  const roundCardTitle = (r) => {
    if (draftMeta.show.pictureRound) return `Round ${r.n}`;
    return `Round ${displayRoundNumber(r.n, false)} (R${r.n})`;
  };

  const removeRound = (ri) => {
    const r = draft[ri];
    if (!confirm(`Remove ${roundCardTitle(r)} — ${r.title || '(untitled)'} — and its ${r.questions.length} question${r.questions.length === 1 ? '' : 's'}?`)) return;
    setDirty(true);
    setDraft((d) => renumberRounds(d.filter((_, i) => i !== ri)));
  };

  const updateMeta = (section, field, value) => {
    setDirty(true);
    setDraftMeta((m) => ({ ...m, [section]: { ...m[section], [field]: value } }));
  };

  const save = () => {
    commitRounds(draft);
    commitTiebreakers(draftTiebreakers);
    commitMeta(draftMeta);
    setDirty(false);
    setImportNote('');
  };
  const revert = () => {
    setDraft(rounds);
    setDraftTiebreakers(tiebreakers);
    setDraftMeta(meta);
    setDirty(false);
    setImportNote('');
  };
  const reset = () => {
    if (!confirm('Reset all questions, tiebreakers, and slide settings to the default General Trivia content? This will discard your edits.')) return;
    resetRounds();
    resetTiebreakers();
    resetMeta();
    const freshRounds = loadRounds();
    const freshTiebreakers = loadTiebreakers();
    const freshMeta = loadMeta();
    setDraft(freshRounds);
    setDraftTiebreakers(freshTiebreakers);
    setDraftMeta(freshMeta);
    setDirty(false);
    commitRounds(freshRounds);
    commitTiebreakers(freshTiebreakers);
    commitMeta(freshMeta);
  };

  const downloadFile = (filename, contents, mime) => {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Full deck bundle: questions + tiebreakers + picture round (data URLs
  // included) + game meta. One file moves the whole event between machines;
  // import it on the venue machine to restore everything. An empty paste
  // buffer exports NO pictures section at all (rather than ten null cells);
  // when at least one image exists the full 10-slot array ships, since the
  // null entries are positional — they keep images in the right cells.
  const onExport = () => {
    const hasPictures = pastes.some((p) => p.dataUrl);
    const payload = buildQuestionsExport(draft, draftTiebreakers, {
      ...(hasPictures ? { pictures: pastes } : {}),
      meta: draftMeta,
    });
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(`trivia-deck-${date}.json`, JSON.stringify(payload, null, 2), 'application/json');
  };

  const onDownloadTemplate = () => {
    downloadFile('trivia-questions-template.csv', buildCsvTemplate(), 'text/csv');
  };

  const onImportClick = () => fileInputRef.current?.click();

  // The one place an import lands, whatever the source. Today that's only the
  // file picker; a pasted payload or a URL param would call straight into this
  // rather than reimplementing the per-kind branching and drifting from it.
  const applyImport = (text, filename) => {
    try {
      const result = parseImport(text, filename);
      if (result.kind === 'json') {
        setDraft(result.rounds);
        // Absent tiebreakers mean "keep the deck's current ones". Writing
        // undefined here would strand the draft: buildQuestionsExport does
        // [...tiebreakers] on the next export, and the editor .maps over it.
        if (result.tiebreakers) setDraftTiebreakers(result.tiebreakers);
        if (result.meta) setDraftMeta(sanitizeMeta(result.meta));
        setDirty(true);
        // Pictures have no draft stage — the Picture Round panel always
        // commits live — so a bundle's pictures land immediately while the
        // question/meta edits above wait for Save & Push.
        if (result.pictures) {
          const restored = normalizePastes(result.pictures);
          const saved = commitPastes(restored);
          const count = restored.filter((p) => p.dataUrl).length;
          setImportNote(
            `Deck imported — ${count} picture${count === 1 ? '' : 's'} restored${saved ? '' : ' (storage full: pictures won’t survive a reload)'}. Review, then Save & Push.`
          );
        } else {
          setImportNote('Questions imported. Review, then Save & Push.');
        }
      } else if (result.kind === 'csv-full') {
        setDraft(result.rounds);
        if (result.tiebreakers) setDraftTiebreakers(result.tiebreakers);
        setDirty(true);
        setImportNote(`${describeImport(result)} Review, then Save & Push.`);
      } else {
        setCsvImport({ categories: result.categories, buckets: result.buckets });
      }
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };

  const onImportFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyImport(reader.result, file.name);
    reader.onerror = () => alert('Could not read file.');
    reader.readAsText(file);
  };

  const applyCsvMapping = (mapping) => {
    const { buckets } = csvImport;
    const nextRounds = draft.map((r) => {
      const cat = mapping[`r${r.n}`];
      if (!cat || !buckets[cat]) return r;
      return maybeRederiveKicker({ ...r, questions: [...buckets[cat]] });
    });
    let nextTb = draftTiebreakers;
    if (mapping.tb && buckets[mapping.tb]) {
      const src = buckets[mapping.tb];
      nextTb = draftTiebreakers.map((t, i) => (src[i] !== undefined ? src[i] : t));
    }
    setDraft(nextRounds);
    setDraftTiebreakers(nextTb);
    setDirty(true);
    setCsvImport(null);
  };

  // Cmd/Ctrl+S → Save & Push (only when there are unsaved edits).
  const trySaveRef = useRef(() => {});
  trySaveRef.current = () => { if (dirty) save(); };
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key !== 's' && e.key !== 'S') return;
      e.preventDefault();
      trySaveRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', position: 'sticky', top: 60, zIndex: 5,
        background: COLORS.bg, padding: '8px 0',
        flexWrap: 'wrap', rowGap: 8,
      }}>
        <Button onClick={save} primary disabled={!dirty}>Save & Push to Display</Button>
        <Button onClick={revert} disabled={!dirty}>Revert</Button>
        <Button onClick={reset} secondary>Reset to Defaults</Button>
        <span style={{ width: 1, height: 24, background: COLORS.border, margin: '0 4px' }} />
        <Button onClick={onExport}>Export Deck</Button>
        <Button onClick={onImportClick}>Import…</Button>
        <Button onClick={onDownloadTemplate} secondary>CSV Template</Button>
        {SHEET_TEMPLATE_URL && (
          <Button href={SHEET_TEMPLATE_URL} secondary>Google Sheets Template ↗</Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json,text/csv,.csv"
          onChange={onImportFile}
          style={{ display: 'none' }}
        />
        {dirty && <span style={{ color: COLORS.warn, fontSize: 12 }}>Unsaved changes</span>}
        {importNote && <span style={{ color: COLORS.accent, fontSize: 12 }}>{importNote}</span>}
      </div>

      <Card title="Slides to Include">
        <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 8 }}>
          Toggle off any optional slides this game won&apos;t use. Hidden slides are skipped in the deck and the slide outline.
        </div>
        <Toggle
          label="Prize slide"
          value={draftMeta.show.prize}
          onChange={(v) => updateMeta('show', 'prize', v)}
        />
        <Toggle
          label="Costume contest"
          value={draftMeta.show.costumeContest}
          onChange={(v) => updateMeta('show', 'costumeContest', v)}
        />
        <Toggle
          label="Picture round (R1 opener + instructions + intermission + recap)"
          value={draftMeta.show.pictureRound}
          onChange={(v) => updateMeta('show', 'pictureRound', v)}
        />
        <Toggle
          label="Tiebreakers (intro + 3 sudden-death questions)"
          value={draftMeta.show.tiebreakers}
          onChange={(v) => updateMeta('show', 'tiebreakers', v)}
        />
        <Toggle
          label="Next event announcement (after the end slide)"
          value={draftMeta.show.nextEvent}
          onChange={(v) => updateMeta('show', 'nextEvent', v)}
        />
      </Card>

      <Card title="Display">
        <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 8 }}>
          Presentation tweaks applied across the deck. Like everything else here, they push to the display on Save.
        </div>
        <Toggle
          label="Show question numbers"
          value={draftMeta.display.showQNumbers}
          onChange={(v) => updateMeta('display', 'showQNumbers', v)}
        />
        <Toggle
          label="Show timer"
          value={draftMeta.display.showTimer}
          onChange={(v) => updateMeta('display', 'showTimer', v)}
        />
        {draftMeta.display.showTimer && (
          <Slider
            label="Timer seconds"
            value={draftMeta.display.timerSeconds}
            min={15}
            max={90}
            step={5}
            unit="s"
            onChange={(v) => updateMeta('display', 'timerSeconds', v)}
          />
        )}
      </Card>

      <Card title="Picture Round">
        {!draftMeta.show.pictureRound && (
          <div style={{ fontSize: 12, color: COLORS.warn, marginBottom: 10 }}>
            Picture round is off (toggle it on under “Slides to Include”). These settings are disabled.
          </div>
        )}
        <div style={{
          opacity: draftMeta.show.pictureRound ? 1 : 0.4,
          pointerEvents: draftMeta.show.pictureRound ? 'auto' : 'none',
        }}>
          <Field
            label="Picture Round Instruction"
            value={draftMeta.pictureRound.instruction}
            onChange={(v) => updateMeta('pictureRound', 'instruction', v)}
            multiline
          />
          <Toggle
            label="Show whole image (letterbox)"
            value={draftMeta.pictureRound.fit === 'contain'}
            onChange={(v) => updateMeta('pictureRound', 'fit', v ? 'contain' : 'cover')}
          />
          <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>
            On = the entire image is shown (e.g. a flag round); cropping/panning is disabled.
            Off = images fill each cell and can be cropped + panned.
          </div>
          <label style={{
            display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12,
            alignItems: 'center', marginTop: 12,
          }}>
            <span style={{ fontSize: 13 }}>Cell shape</span>
            <select
              value={draftMeta.pictureRound.aspect}
              onChange={(e) => updateMeta('pictureRound', 'aspect', e.target.value)}
              disabled={!draftMeta.show.pictureRound}
              style={{
                padding: '6px 8px', background: COLORS.bg, color: COLORS.text,
                border: `1px solid ${COLORS.border}`, borderRadius: 6,
                fontFamily: 'inherit', fontSize: 13,
              }}
            >
              {Object.entries(PICTURE_ASPECTS).map(([key, a]) => (
                <option key={key} value={key}>{a.label}</option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <Card title="Title Slide">
        <Field label="Eyebrow" value={draftMeta.title.eyebrow} onChange={(v) => updateMeta('title', 'eyebrow', v)} />
        <Field label="Hero" value={draftMeta.title.hero} onChange={(v) => updateMeta('title', 'hero', v)} />
        <Field label="Edition" value={draftMeta.title.edition} onChange={(v) => updateMeta('title', 'edition', v)} />
        <Field label="Tagline" value={draftMeta.title.tagline} onChange={(v) => updateMeta('title', 'tagline', v)} />
        <Field label="Hosts" value={draftMeta.title.hosts} onChange={(v) => updateMeta('title', 'hosts', v)} />
        <Field label="Footer" value={draftMeta.title.footerDate} onChange={(v) => updateMeta('title', 'footerDate', v)} />
      </Card>

      <Card title="End Slide">
        <Field label="Line 1" value={draftMeta.end.hero1} onChange={(v) => updateMeta('end', 'hero1', v)} />
        <Field label="Line 2" value={draftMeta.end.hero2} onChange={(v) => updateMeta('end', 'hero2', v)} />
        <Field label="Subtitle" value={draftMeta.end.subtitle} onChange={(v) => updateMeta('end', 'subtitle', v)} />
      </Card>

      <Card title="Next Event Slide">
        <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 8 }}>
          Announces the next trivia night. Shown after the end slide, before the tiebreakers.
        </div>
        <Field label="Eyebrow" value={draftMeta.nextEvent.eyebrow} onChange={(v) => updateMeta('nextEvent', 'eyebrow', v)} />
        <Field label="Hero" value={draftMeta.nextEvent.hero} onChange={(v) => updateMeta('nextEvent', 'hero', v)} />
        <Field label="Date" value={draftMeta.nextEvent.date} onChange={(v) => updateMeta('nextEvent', 'date', v)} />
        <Field label="Venue" value={draftMeta.nextEvent.venue} onChange={(v) => updateMeta('nextEvent', 'venue', v)} />
        <Field label="Detail" value={draftMeta.nextEvent.detail} onChange={(v) => updateMeta('nextEvent', 'detail', v)} multiline />
      </Card>

      {draft.map((r, ri) => (
        <Card key={r.n} title={roundCardTitle(r)}>
          <Field label="Title" value={r.title} onChange={(v) => update([ri, 'title'], v)} />
          <Field label="Subtitle" value={r.subtitle} onChange={(v) => update([ri, 'subtitle'], v)} multiline />
          <Field label="Kicker" value={r.kicker} onChange={(v) => update([ri, 'kicker'], v)} />
          <div style={{ marginTop: 14, fontSize: 11, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: COLORS.textDim }}>
            Questions
          </div>
          {r.questions.map((q, qi) => (
            <QuestionEditor
              key={qi}
              index={qi}
              question={q}
              onChange={(field, value) => updateQuestion(ri, qi, field, value)}
              onRemove={() => removeQuestion(ri, qi)}
              removable={r.questions.length > 1}
            />
          ))}
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Button onClick={() => addQuestion(ri)} secondary>+ Add question</Button>
            <Button onClick={() => removeRound(ri)} secondary disabled={draft.length === 1}>
              Remove round
            </Button>
          </div>
        </Card>
      ))}
      <div>
        <Button onClick={addRound} secondary>+ Add round</Button>
      </div>
      <Card title="Tiebreakers — Final Wager">
        <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 8 }}>
          Used after the final round if teams are tied. Tied teams wager from their score, then write an answer — Final Jeopardy style. Up to three questions.
        </div>
        {draftTiebreakers.map((t, i) => (
          <Field
            key={i}
            label={`TB${i + 1}`}
            value={t}
            onChange={(v) => updateTiebreaker(i, v)}
            multiline
            compact
          />
        ))}
      </Card>
      {csvImport && (
        <CsvImportModal
          csvImport={csvImport}
          rounds={draft}
          roundLabel={roundCardTitle}
          onApply={applyCsvMapping}
          onCancel={() => setCsvImport(null)}
        />
      )}
    </div>
  );
}

function CsvImportModal({ csvImport, rounds, roundLabel = (r) => `Round ${r.n}`, onApply, onCancel }) {
  const { categories, buckets } = csvImport;
  const [mapping, setMapping] = useState(() => {
    const init = { tb: '' };
    rounds.forEach((r, idx) => {
      init[`r${r.n}`] = categories[idx] || '';
    });
    return init;
  });
  const setSlot = (key, value) => setMapping((m) => ({ ...m, [key]: value }));
  const totalAssigned = Object.values(mapping).filter(Boolean).length;

  const slots = [
    ...rounds.map((r) => ({ key: `r${r.n}`, label: `${roundLabel(r)} — ${r.title || '(untitled)'}` })),
    { key: 'tb', label: `Tiebreakers (uses first 3 questions)` },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
      padding: 24,
    }}>
      <div style={{
        background: COLORS.panel, color: COLORS.text, border: `1px solid ${COLORS.border}`,
        borderRadius: 10, width: 'min(640px, 100%)', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`,
          fontSize: 13, fontWeight: 600, letterSpacing: '0.04em',
        }}>
          CSV Import — Pick a Round for Each Category
        </div>
        <div style={{ padding: '14px 18px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: COLORS.textDim }}>
            Found {categories.length} {categories.length === 1 ? 'category' : 'categories'}: {' '}
            {categories.map((c) => `${c} (${buckets[c].length})`).join(', ')}.
            Rounds you don&apos;t map stay as they are.
          </div>
          {slots.map((s) => (
            <label key={s.key} style={{
              display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12, alignItems: 'center',
            }}>
              <span style={{ fontSize: 13 }}>{s.label}</span>
              <select
                value={mapping[s.key]}
                onChange={(e) => setSlot(s.key, e.target.value)}
                style={{
                  padding: '6px 8px', background: COLORS.bg, color: COLORS.text,
                  border: `1px solid ${COLORS.border}`, borderRadius: 6,
                  fontFamily: 'inherit', fontSize: 13,
                }}
              >
                <option value="">(keep current)</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c} ({buckets[c].length})</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div style={{
          padding: '12px 18px', borderTop: `1px solid ${COLORS.border}`,
          display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: COLORS.textDim, marginRight: 'auto' }}>
            {totalAssigned === 0 ? 'No slots mapped yet.' : `${totalAssigned} ${totalAssigned === 1 ? 'slot' : 'slots'} will be replaced.`}
          </span>
          <Button onClick={onCancel} secondary>Cancel</Button>
          <Button onClick={() => onApply(mapping)} primary disabled={totalAssigned === 0}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PICTURES PANEL — paste images, preview, export to clipboard / disk
// ============================================================
function PicturesPanel({ pastes, commitPastes, meta, rounds = [] }) {
  const [focusedCell, setFocusedCell] = useState(null);
  const [status, setStatus] = useState('');
  const items = useMemo(() => mergeItems(pastes), [pastes]);
  // Cell fit/aspect come from the saved meta (like the instruction), so the
  // editor preview + exported handout match the display's last-saved settings.
  const fit = meta.pictureRound?.fit ?? 'cover';
  const aspect = meta.pictureRound?.aspect ?? '316 / 220';
  const handoutOpts = { fit, aspect };

  const setStatusFlash = useCallback((msg) => {
    setStatus(msg);
    setTimeout(() => setStatus((s) => (s === msg ? '' : s)), 2400);
  }, []);

  // Commit + surface a persistence failure. The display still shows the
  // image this session (commitPastes broadcasts before saving); the warning
  // is about the buffer not surviving a reload.
  const commitChecked = useCallback((next, okMsg) => {
    const saved = commitPastes(next);
    setStatusFlash(saved ? okMsg : `${okMsg} — but storage is full, so it won’t survive a reload. Clear unused cells.`);
  }, [commitPastes, setStatusFlash]);

  // ingestImage downscales + re-encodes so ten photos fit the localStorage
  // quota; crop position resets so old framing doesn't carry over.
  const loadIntoCell = useCallback(async (i, blob, verb) => {
    try {
      const dataUrl = await ingestImage(blob);
      const next = pastes.map((p, idx) =>
        idx === i ? { ...p, dataUrl, position: { x: 50, y: 50 } } : p
      );
      commitChecked(next, `${verb} cell ${String(i + 1).padStart(2, '0')}`);
    } catch (e) {
      setStatusFlash(`Image failed to load: ${e.message}`);
    }
  }, [pastes, commitChecked, setStatusFlash]);

  const handlePaste = useCallback((i, e) => {
    const clipItems = e.clipboardData?.items || [];
    for (const item of clipItems) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        loadIntoCell(i, item.getAsFile(), 'Pasted into');
        return;
      }
    }
  }, [loadIntoCell]);

  const handleDrop = useCallback((i, e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    loadIntoCell(i, file, 'Loaded image into');
  }, [loadIntoCell]);

  const setCellPosition = useCallback((i, position) => {
    const next = pastes.map((p, idx) =>
      idx === i ? { ...p, position } : p
    );
    commitPastes(next);
  }, [pastes, commitPastes]);

  const clearCell = (i) => {
    const next = pastes.map((p, idx) =>
      idx === i ? { dataUrl: null, caption: null, position: { x: 50, y: 50 } } : p
    );
    commitPastes(next);
  };

  const clearAll = () => {
    if (!confirm('Clear all pasted pictures? This will reset every cell.')) return;
    clearPastes();
    commitPastes(loadPastes());
    setStatusFlash('All pastes cleared');
  };

  const onCopy = async () => {
    try {
      await copyHandoutToClipboard(items, meta.pictureRound.instruction, handoutOpts);
      setStatusFlash('Handout copied to clipboard');
    } catch (e) {
      setStatusFlash(`Copy failed: ${e.message}`);
    }
  };

  const onDownload = async () => {
    try {
      await downloadHandoutPng(items, meta.pictureRound.instruction, 'picture-round-handout.png', handoutOpts);
      setStatusFlash('Handout PNG downloaded');
    } catch (e) {
      setStatusFlash(`Download failed: ${e.message}`);
    }
  };

  const onDownloadAnswers = async () => {
    try {
      // One sheet covers every round: line count follows the longest round.
      await downloadAnswersHandoutPng(Math.max(10, ...rounds.map((r) => r.questions.length)));
      setStatusFlash('Answers handout downloaded — photocopy one per team per round');
    } catch (e) {
      setStatusFlash(`Download failed: ${e.message}`);
    }
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="Picture Round — paste images, then export">
        <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 14 }}>
          Click a cell to focus it, then ⌘V (Mac) / Ctrl+V to paste an image. Or drag-drop a file.
          Once an image is in a cell, <strong>drag the image</strong> to crop / re-frame it; the ↺ button resets the crop.
          Images are stored in this browser; <strong>Export Deck</strong> (Edit Questions tab) bundles them
          with the questions into one file you can import on another machine.
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12,
          aspectRatio: `${1920 - 160} / ${1080 - 300}`,
        }}>
          {pastes.map((p, i) => (
            <PictureCell
              key={i}
              i={i}
              dataUrl={p.dataUrl}
              fallbackSrc={items[i].src}
              isPasted={items[i].isPasted}
              position={items[i].position}
              focused={focusedCell === i}
              fit={fit}
              aspect={aspect}
              onFocus={() => setFocusedCell(i)}
              onPaste={(e) => handlePaste(i, e)}
              onDrop={(e) => handleDrop(i, e)}
              onClear={() => clearCell(i)}
              onPositionChange={(pos) => setCellPosition(i, pos)}
            />
          ))}
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button onClick={onCopy} primary>Copy Handout to Clipboard</Button>
          <Button onClick={onDownload}>Download Handout PNG</Button>
          <Button onClick={onDownloadAnswers}>Download Answers Handout</Button>
          <Button onClick={clearAll} secondary>Clear All</Button>
          {status && (
            <span style={{ marginLeft: 8, fontSize: 12, color: COLORS.accent }}>
              {status}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}

function PictureCell({
  i, dataUrl, fallbackSrc, isPasted, position, focused, fit = 'cover', aspect = '316 / 220',
  onFocus, onPaste, onDrop, onClear, onPositionChange,
}) {
  const ref = useRef(null);
  const [diskFailed, setDiskFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Live crop position while dragging — local-only so the (expensive)
  // persist + broadcast happens once on pointer-up, not per mouse move.
  const [livePos, setLivePos] = useState(null);
  const showSrc = dataUrl || (!diskFailed ? fallbackSrc : null);
  // Cropping only makes sense in "cover"; "contain" letterboxes the whole
  // image, so panning + the reset button are disabled there.
  const canPan = fit === 'cover';
  const shownPos = livePos ?? { x: position?.x ?? 50, y: position?.y ?? 50 };
  const isPositioned = shownPos.x !== 50 || shownPos.y !== 50;

  // Drag-to-pan: when an image is loaded, holding pointer down and dragging
  // shifts the visible crop. We translate pixel deltas into objectPosition
  // percentage deltas, inverted (drag right = show more of the right edge).
  const onPointerDown = (e) => {
    if (!showSrc) return;          // empty cell: leave click→focus behavior alone
    if (!canPan) return;           // contain mode: nothing to crop
    if (e.button !== 0) return;    // left click only
    e.preventDefault();
    const rect = ref.current.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const startPos = { x: position?.x ?? 50, y: position?.y ?? 50 };
    let moved = false;
    let last = null;
    const onMove = (e2) => {
      const dx = e2.clientX - startX;
      const dy = e2.clientY - startY;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;  // ignore tiny jitters
      moved = true;
      setDragging(true);
      const nx = clamp(startPos.x - (dx / rect.width) * 100, 0, 100);
      const ny = clamp(startPos.y - (dy / rect.height) * 100, 0, 100);
      last = { x: nx, y: ny };
      setLivePos(last);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDragging(false);
      setLivePos(null);
      if (moved && last) onPositionChange(last);   // single commit per drag
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      onFocus={onFocus}
      onClick={() => ref.current?.focus()}
      onPaste={onPaste}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onPointerDown={onPointerDown}
      style={{
        position: 'relative', aspectRatio: resolveAspect(aspect).css, borderRadius: 6,
        border: `2px solid ${focused ? COLORS.accent : COLORS.border}`,
        background: COLORS.bg, overflow: 'hidden',
        cursor: showSrc && canPan ? (dragging ? 'grabbing' : 'grab') : 'pointer',
        outline: 'none', userSelect: 'none', touchAction: 'none',
      }}
    >
      {showSrc ? (
        <img
          src={showSrc}
          alt={`Picture ${i + 1}`}
          draggable={false}
          onError={() => { if (!isPasted) setDiskFailed(true); }}
          style={{
            width: '100%', height: '100%', objectFit: fit, display: 'block',
            objectPosition: canPan ? `${shownPos.x}% ${shownPos.y}%` : 'center',
            pointerEvents: 'none',  // pointer events go to the cell so drag works
          }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: COLORS.textDim, fontSize: 11,
          letterSpacing: '0.2em', textTransform: 'uppercase',
        }}>
          {focused ? 'Paste image' : 'Empty'}
        </div>
      )}
      <div style={{
        position: 'absolute', top: 6, left: 6,
        width: 28, height: 28, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 12, fontWeight: 700,
        background: COLORS.accent, color: COLORS.bg, borderRadius: 4,
        fontFamily: "'Oswald', 'Helvetica Neue', Arial, sans-serif", pointerEvents: 'none',
      }}>
        {String(i + 1).padStart(2, '0')}
      </div>
      {showSrc && canPan && isPositioned && (
        <button
          type="button"
          title="Reset crop"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onPositionChange({ x: 50, y: 50 });
          }}
          style={{
            position: 'absolute', top: 6, right: 34, width: 22, height: 22,
            border: 0, borderRadius: 4, background: COLORS.panelAlt, color: COLORS.text,
            fontSize: 12, lineHeight: '20px', cursor: 'pointer',
          }}
        >↺</button>
      )}
      {dataUrl && (
        <button
          type="button"
          title="Clear cell"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          style={{
            position: 'absolute', top: 6, right: 6, width: 22, height: 22,
            border: 0, borderRadius: 4, background: COLORS.danger, color: '#fff',
            fontSize: 14, lineHeight: '20px', cursor: 'pointer',
          }}
        >×</button>
      )}
      {isPasted && (
        <div style={{
          position: 'absolute', bottom: 4, right: 6, fontSize: 9,
          letterSpacing: '0.18em', textTransform: 'uppercase', color: COLORS.warn,
          textShadow: '0 1px 2px rgba(0,0,0,0.6)', pointerEvents: 'none',
        }}>
          Pasted
        </div>
      )}
    </div>
  );
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ============================================================
// QUESTION EDITOR — prompt + answer always visible; media fields collapse
// behind a toggle so the round panel stays scannable. Hidden fields keep any
// values they had (no destructive collapse).
// ============================================================
function QuestionEditor({ index, question, onChange, onRemove, removable = false }) {
  const data = normalizeQuestion(question);
  const hasMedia = !!(data.audioUrl || data.imageUrl || data.videoUrl || data.displayHint);
  const [expanded, setExpanded] = useState(hasMedia);
  return (
    <div style={{
      marginTop: 8, padding: onRemove ? '8px 28px 8px 0' : '8px 0',
      borderTop: `1px solid ${COLORS.border}`,
      position: 'relative',
    }}>
      {onRemove && (
        <button
          onClick={onRemove}
          disabled={!removable}
          title={removable ? 'Remove this question' : 'A round needs at least one question'}
          style={{
            position: 'absolute', top: 10, right: 0, border: 0,
            background: 'transparent', color: removable ? COLORS.danger : COLORS.border,
            fontFamily: 'inherit', fontSize: 16, lineHeight: 1,
            cursor: removable ? 'pointer' : 'not-allowed', padding: '2px 6px',
          }}
        >
          ×
        </button>
      )}
      <Field
        label={`Q${index + 1}`}
        value={data.prompt || ''}
        onChange={(v) => onChange('prompt', v)}
        multiline
        compact
      />
      <Field
        label="Answer"
        value={data.answer || ''}
        onChange={(v) => onChange('answer', v)}
        compact
      />
      <div style={{ marginTop: 4, marginLeft: 92 }}>
        <button
          onClick={() => setExpanded((x) => !x)}
          style={{
            border: 0, background: 'transparent', color: COLORS.textDim,
            fontFamily: 'inherit', fontSize: 11, letterSpacing: '0.12em',
            textTransform: 'uppercase', cursor: 'pointer', padding: '2px 0',
          }}
        >
          {expanded ? '▾ Hide media' : `▸ Media${hasMedia ? ' (set)' : ''}`}
        </button>
      </div>
      {expanded && (
        <>
          <Field label="Hint" value={data.displayHint || ''} onChange={(v) => onChange('displayHint', v)} compact />
          <Field label="Audio" value={data.audioUrl || ''} onChange={(v) => onChange('audioUrl', v)} compact />
          <Field label="Image" value={data.imageUrl || ''} onChange={(v) => onChange('imageUrl', v)} compact />
          <Field label="Video" value={data.videoUrl || ''} onChange={(v) => onChange('videoUrl', v)} compact />
        </>
      )}
    </div>
  );
}
// ============================================================
// PRIMITIVES
// ============================================================
function Card({ title, children, compact = false }) {
  return (
    <section style={{
      background: COLORS.panel, border: `1px solid ${COLORS.border}`,
      borderRadius: 10, padding: compact ? '12px 16px' : 16,
    }}>
      {title && (
        <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: COLORS.textDim, marginBottom: 12 }}>
          {title}
        </div>
      )}
      {children}
    </section>
  );
}

// `href` renders an <a> styled as a button (for links out to Google Sheets);
// everything else renders a real <button>. Same look either way.
function Button({ children, onClick, href, primary = false, secondary = false, disabled = false }) {
  const bg = disabled ? COLORS.panelAlt : (primary ? COLORS.accent : (secondary ? 'transparent' : COLORS.panelAlt));
  const color = disabled ? COLORS.textDim : (primary ? COLORS.bg : COLORS.text);
  const border = secondary ? `1px solid ${COLORS.border}` : '1px solid transparent';
  const style = {
    padding: '8px 14px', borderRadius: 6, border, background: bg, color,
    fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        style={{ ...style, display: 'inline-block', textDecoration: 'none', lineHeight: '16px' }}
      >
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 12, marginTop: 10,
      cursor: 'pointer', userSelect: 'none',
    }}>
      <span style={{
        position: 'relative', width: 36, height: 20, flex: '0 0 auto',
        background: value ? COLORS.accent : COLORS.border, borderRadius: 999,
        transition: 'background 120ms ease',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: value ? 18 : 2,
          width: 16, height: 16, borderRadius: '50%', background: COLORS.bg,
          transition: 'left 120ms ease',
        }} />
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
        />
      </span>
      <span style={{ fontSize: 13, color: COLORS.text }}>{label}</span>
    </label>
  );
}

function Slider({ label, value, min = 0, max = 100, step = 1, unit = '', onChange }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontSize: 12, color: COLORS.textDim, marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color: COLORS.text, fontVariantNumeric: 'tabular-nums' }}>{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: COLORS.accent, cursor: 'pointer' }}
      />
    </div>
  );
}

function Field({ label, value, onChange, multiline = false, compact = false }) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <label style={{
      display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12, alignItems: 'start',
      marginTop: compact ? 6 : 10,
    }}>
      <span style={{ paddingTop: 8, fontSize: 12, color: COLORS.textDim,
        fontVariantNumeric: 'tabular-nums' }}>
        {label}
      </span>
      <Tag
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={multiline ? 2 : undefined}
        style={{
          width: '100%', padding: '8px 10px',
          background: COLORS.bg, color: COLORS.text,
          border: `1px solid ${COLORS.border}`, borderRadius: 6,
          fontFamily: 'inherit', fontSize: 13, lineHeight: 1.4, resize: multiline ? 'vertical' : 'none',
        }}
      />
    </label>
  );
}

// ============================================================
// SLIDE OUTLINE — mirrors the composition in App.jsx so the control window
// can show a meaningful slide list and previews without rendering the slides.
// Keep this in sync with App.jsx's slide composition.
// ============================================================
function buildSlideOutline(rounds, tiebreakers = [], meta = DEFAULT_META) {
  const titleEdition = meta.title?.edition || DEFAULT_META.title.edition;
  const endLines = `${meta.end?.hero1 || ''} ${meta.end?.hero2 || ''}`.trim();
  const pictureRoundShown = meta.show?.pictureRound ?? true;
  const list = [
    { key: 'title', label: `Title — ${titleEdition}` },
    { key: 'rules', label: 'House Rules' },
  ];
  if (meta.show?.prize ?? true) {
    list.push({ key: 'prize', label: 'Grand Prize — Curator for a Night' });
  }
  if (meta.show?.costumeContest ?? true) {
    list.push({ key: 'costume', label: 'Costume Contest' });
  }
  if (pictureRoundShown) {
    list.push(
      { key: 'r1-open', label: 'Round 1 Opener — Picture Round' },
      { key: 'r1-instr', label: 'Round 1 Instructions' },
      { key: 'int-r1', label: 'Intermission · Round 1 (collect sheets)' },
      { key: 'r1-recap', label: 'Picture Round Recap (5×2 grid)' },
    );
  }
  rounds.forEach((r) => {
    const displayN = displayRoundNumber(r.n, pictureRoundShown);
    list.push({ key: `r${r.n}-open`, label: `Round ${displayN} Opener — ${r.title}` });
    r.questions.forEach((q, qi) => {
      const data = normalizeQuestion(q);
      list.push({
        key: `r${r.n}-q${qi + 1}`,
        label: `Round ${displayN} · Question ${qi + 1} / ${r.questions.length}`,
        detail: data.prompt,
      });
    });
    list.push({
      key: `int-r${r.n}`,
      label: `Intermission · Round ${displayN} (collect sheets)`,
    });
    recapSplitsFor(r).forEach(([start, end], i) => {
      const part = String.fromCharCode(65 + i);
      const range = `Q${String(start + 1).padStart(2, '0')}–${String(end).padStart(2, '0')}`;
      list.push({
        key: `r${r.n}-recap-${String.fromCharCode(97 + i)}`,
        label: `Round ${displayN} Recap ${part} — ${range}`,
      });
    });
  });
  list.push({ key: 'end', label: `End — ${endLines || 'Thanks for Playing'}` });
  if (meta.show?.nextEvent ?? true) {
    list.push({ key: 'next-event', label: `Next Event — ${meta.nextEvent?.date || 'TBA'}` });
  }
  if (meta.show?.tiebreakers ?? true) {
    list.push({ key: 'tb-intro', label: 'Tiebreakers — Final Wager (only if tied)' });
    tiebreakers.forEach((prompt, i) => {
      list.push({
        key: `tb-q${i + 1}`,
        label: `Tiebreaker · Question ${i + 1} / ${tiebreakers.length}`,
        detail: prompt,
      });
    });
  }
  return list;
}

// Make defaults importable for fallback rendering during initial load.
export { DEFAULT_ROUNDS, DEFAULT_TIEBREAKERS };
