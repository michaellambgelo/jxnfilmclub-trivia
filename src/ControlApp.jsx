import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadRounds, saveRounds, resetRounds, DEFAULT_ROUNDS,
  loadTiebreakers, saveTiebreakers, resetTiebreakers, DEFAULT_TIEBREAKERS,
  buildQuestionsExport, parseImport, buildCsvTemplate,
  recapSplitsFor, normalizeQuestion, displayRoundNumber,
  renumberRounds, makeBlankRound, deriveKicker, isAutoKicker,
} from './rounds.js';
import {
  loadMeta, saveMeta, resetMeta, sanitizeMeta, DEFAULT_META,
  PICTURE_MODES, PICTURE_MODE_LABELS, SHOW_SECONDS_MIN, SHOW_SECONDS_MAX, SHOW_PASSES_MAX,
} from './meta.js';
import {
  loadPastes, savePastes, clearPastes, mergeItems, normalizePastes, ingestImage,
  PICTURE_ASPECTS, resolveAspect, emptyPaste, hasPicture, slotHasContent, pastesHaveContent,
  answerTextFor, referencedPictureIds, walkthroughSlots, pictureAnswerLines, isFaceMashSlot,
  migratePastes, applyMigration, inlineBundlePictures,
} from './pictures.js';
import {
  addImage, putImage, dataUrlToBlob, newImageId, holdMedia, gcImages, useImageUrl,
  isImageStoreAvailable, exportImages, importImages, ImageStoreUnavailableError,
} from './imageStore.js';
import {
  decodeToCanvas, compose as composeFaceMash, isReady as faceMashReady,
  LANDMARK_PROMPTS, DEFAULT_CONTROLS as FACE_MASH_CONTROLS,
} from './faceMash.js';
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
// Empty string = not configured yet; the button hides rather than 404 — which
// is why this deck showed no Sheets button until the ID below was filled in.
//
// This points at the shared "trivia-questions-template" sheet, the same one
// Fertile Ground hosts copy. It is blank (no questions) and already shared
// "Anyone with the link → Viewer". Note its header still reads "TAPROOM TRIVIA
// — QUESTION TEMPLATE" and its round titles are ENTERTAINMENT / SPORTS /
// GEOGRAPHY / SCIENCE; swap in a film-club-specific sheet when one exists.
const SHEET_TEMPLATE_ID = '1egPdfvAxmPswOgZznyuYhNzRMXReV95k-D2JpAAtQ7g';
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

// Save `contents` (string or Blob) as a download via a throwaway anchor.
// Shared by the Questions exports and the Utilities tools.
function downloadFile(filename, contents, mime) {
  const blob = contents instanceof Blob ? contents : new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// GC runs this long after the last persisted paste commit (caption typing,
// crop drags, and a Face Mash's slot write coalesce into one sweep).
const GC_DELAY_MS = 1500;

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

  // Draft state lives here rather than in the panels so unsaved edits survive
  // tab switches, the header can badge dirty tabs, and a bundle import in the
  // Questions tab can stage its meta for the Show Setup tab. Two independent
  // surfaces: Questions (rounds + tiebreakers) and Show Setup (meta) — each
  // with its own dirty flag and Save/Revert/Reset. Pictures stay live-commit.
  const [draftRounds, setDraftRounds] = useState(rounds);
  const [draftTiebreakers, setDraftTiebreakers] = useState(tiebreakers);
  const [draftMeta, setDraftMeta] = useState(meta);
  const [questionsDirty, setQuestionsDirty] = useState(false);
  const [metaDirty, setMetaDirty] = useState(false);
  const [importNote, setImportNote] = useState('');

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

  // ---- Picture buffer + image store -------------------------------------
  // Pictures have no draft stage: every edit commits live (persist +
  // broadcast). `pastesRef` always holds the latest committed buffer so
  // async writers (paste ingest, imports, the Face Mash Maker, migration)
  // build on current state via updatePastes(fn), never on a stale closure.
  const pastesRef = useRef(pastes);
  // null = still probing, true/false = IndexedDB usable in this browser.
  const [imagesAvailable, setImagesAvailable] = useState(null);
  const [pictureNote, setPictureNote] = useState('');
  const imagesAvailableRef = useRef(null);
  imagesAvailableRef.current = imagesAvailable;
  const gcTimerRef = useRef(null);

  useEffect(() => {
    let live = true;
    isImageStoreAvailable().then((ok) => { if (live) setImagesAvailable(ok); });
    return () => { live = false; };
  }, []);

  // Garbage-collect image records no slot references, a beat after the
  // last commit. Only after a SUCCESSFUL save — if localStorage refused the
  // write, the persisted buffer still points at the old ids and a reload
  // would need them. gcImages also keeps every id held by an in-flight
  // writer (holdMedia).
  const scheduleGc = useCallback(() => {
    clearTimeout(gcTimerRef.current);
    gcTimerRef.current = setTimeout(() => {
      if (imagesAvailableRef.current !== true) return;
      gcImages(referencedPictureIds(pastesRef.current)).catch(() => {});
    }, GC_DELAY_MS);
  }, []);

  // Broadcast BEFORE persisting: if the localStorage write fails (quota),
  // the display still gets the pictures for this session. Returns the save
  // result so panels can warn that the buffer won't survive a reload.
  const commitPastes = useCallback((next) => {
    const normalized = normalizePastes(next);
    pastesRef.current = normalized;
    setPastes(normalized);
    broadcast('pictures:update', normalized);
    const saved = savePastes(normalized);
    if (saved) scheduleGc();
    return saved;
  }, [scheduleGc]);

  // Functional commit against the latest buffer — the one write path every
  // picture editor uses (Picture Round tab, import, Utilities, migration).
  const updatePastes = useCallback(
    (fn) => commitPastes(fn(pastesRef.current)),
    [commitPastes],
  );

  // ---- Legacy data-URL migration (control window only) ---------------------
  // Buffers saved before the image store, and v1/v2 bundle imports, carry
  // pictures inline as data URLs. Move each into IndexedDB as-is (no
  // re-encode) and swap in its id — per slot, only after that write
  // succeeds. The display never migrates (it's a reader; two writers would
  // race and orphan ids). A slot whose write fails keeps its data URL and
  // isn't retried this session.
  const migratingRef = useRef(false);
  const migrationSkipRef = useRef(new Set());
  const [migrationTick, setMigrationTick] = useState(0);
  useEffect(() => {
    if (imagesAvailable !== true || migratingRef.current) return;
    const skip = migrationSkipRef.current;
    if (!pastes.some((p) => p.dataUrl && !skip.has(p.dataUrl))) return;
    migratingRef.current = true;
    const original = pastesRef.current;
    const releases = [];
    (async () => {
      const res = await migratePastes(original, async (dataUrl) => {
        if (skip.has(dataUrl)) throw new Error('skipped');
        const id = newImageId();
        releases.push(holdMedia([id]));
        await putImage(dataUrlToBlob(dataUrl), { id, kind: 'picture' });
        return id;
      });
      res.failed.forEach((i) => { if (original[i]?.dataUrl) skip.add(original[i].dataUrl); });
      if (res.migrated.length) {
        commitPastes(applyMigration(pastesRef.current, original, res.ids));
      }
      if (res.unavailable) setImagesAvailable(false);
      if (res.failed.length) {
        setPictureNote(`${plural(res.failed.length, 'picture')} couldn’t move into image storage and still live in this browser’s localStorage (they still show).`);
      }
    })().catch(() => {}).finally(() => {
      releases.forEach((release) => release());
      migratingRef.current = false;
      setMigrationTick((t) => t + 1);
    });
  }, [pastes, imagesAvailable, migrationTick, commitPastes]);

  // Deck-bundle pictures. v3: `images` restore into the store under their
  // original ids, then the slots commit. v1/v2: slots carry data URLs, so
  // they commit as-is and the migration effect above moves them. With no
  // IndexedDB a v3 bundle's pictures are inlined back as data URLs (answer
  // images can't be, and are dropped). Resolves a note for the import line.
  const importPictures = useCallback(async (pictures, images) => {
    let restored = normalizePastes(pictures);
    const imageIds = Object.keys(images || {});
    const release = holdMedia(imageIds);
    const notes = [];
    try {
      if (imageIds.length) {
        let inline = imagesAvailableRef.current === false;
        if (!inline) {
          try {
            const { failed } = await importImages(images);
            if (failed) notes.push(`${plural(failed, 'image')} unreadable, skipped`);
          } catch (err) {
            inline = true;
            if (err instanceof ImageStoreUnavailableError) setImagesAvailable(false);
            notes.push(`image storage failed (${err.message})`);
          }
        }
        if (inline) {
          restored = inlineBundlePictures(restored, images);
          notes.push('answer images dropped — no image storage in this browser');
        }
      }
      const saved = commitPastes(restored);
      const count = restored.filter(hasPicture).length;
      return `${plural(count, 'picture')} restored${notes.length ? ` (${notes.join('; ')})` : ''}${saved ? '' : ' (storage full: pictures won’t survive a reload)'}`;
    } finally {
      release();
    }
  }, [commitPastes]);

  // The bundle's picture sections: the buffer as stored plus every image it
  // references, inlined as data URLs. An empty buffer exports neither.
  const exportPictures = useCallback(async () => {
    const cur = pastesRef.current;
    if (!pastesHaveContent(cur)) return { extras: {}, note: '' };
    const ids = referencedPictureIds(cur);
    let images = {};
    let note = '';
    if (ids.length) {
      try {
        const res = await exportImages(ids);
        images = res.images;
        if (res.missing.length) note = `${plural(res.missing.length, 'referenced image')} not found in this browser — exported without ${res.missing.length === 1 ? 'it' : 'them'}.`;
      } catch (err) {
        note = `Images not included — ${err.message}`;
      }
    }
    return { extras: { pictures: cur, images }, note };
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

  // If the persisted data changes externally (e.g. another window saved), pull
  // it in — but only when that surface isn't mid-edit, to avoid clobbering.
  useEffect(() => {
    if (!questionsDirty) setDraftRounds(rounds);
  }, [rounds, questionsDirty]);
  useEffect(() => {
    if (!questionsDirty) setDraftTiebreakers(tiebreakers);
  }, [tiebreakers, questionsDirty]);
  useEffect(() => {
    if (!metaDirty) setDraftMeta(meta);
  }, [meta, metaDirty]);

  const saveQuestions = () => {
    commitRounds(draftRounds);
    commitTiebreakers(draftTiebreakers);
    setQuestionsDirty(false);
    setImportNote('');
  };
  const revertQuestions = () => {
    setDraftRounds(rounds);
    setDraftTiebreakers(tiebreakers);
    setQuestionsDirty(false);
    setImportNote('');
  };
  const resetQuestions = () => {
    if (!confirm('Reset all questions and tiebreakers to the default General Trivia content? This will discard your edits. Slide settings and copy (Show Setup tab) are untouched.')) return;
    resetRounds();
    resetTiebreakers();
    const freshRounds = loadRounds();
    const freshTiebreakers = loadTiebreakers();
    setDraftRounds(freshRounds);
    setDraftTiebreakers(freshTiebreakers);
    setQuestionsDirty(false);
    setImportNote('');
    commitRounds(freshRounds);
    commitTiebreakers(freshTiebreakers);
  };

  const saveSetup = () => {
    commitMeta(draftMeta);
    setMetaDirty(false);
  };
  const revertSetup = () => {
    setDraftMeta(meta);
    setMetaDirty(false);
  };
  const resetSetup = () => {
    if (!confirm('Reset all slide copy, toggles, and display settings to defaults? This will discard your edits. Questions and tiebreakers are untouched.')) return;
    resetMeta();
    const freshMeta = loadMeta();
    setDraftMeta(freshMeta);
    setMetaDirty(false);
    commitMeta(freshMeta);
  };

  // Cmd/Ctrl+S → Save & Push for whichever editing surface is active. On the
  // editing tabs the browser save dialog is always suppressed (muscle-memory
  // saves with nothing dirty shouldn't pop it); other tabs leave the key alone.
  const trySaveRef = useRef(() => {});
  trySaveRef.current = (e) => {
    if (tab === 'questions') {
      e.preventDefault();
      if (questionsDirty) saveQuestions();
    } else if (tab === 'setup') {
      e.preventDefault();
      if (metaDirty) saveSetup();
    }
  };
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key !== 's' && e.key !== 'S') return;
      trySaveRef.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The Picture Round interface only applies when that round is in the deck.
  // If it's switched off while the Picture Round tab is open, fall back.
  const pictureRoundEnabled = meta.show.pictureRound;
  useEffect(() => {
    if (!pictureRoundEnabled && tab === 'pictures') setTab('present');
  }, [pictureRoundEnabled, tab]);

  return (
    <div style={baseStyle}>
      <Header
        tab={tab}
        setTab={setTab}
        currentSlide={currentSlide}
        pictureRoundEnabled={pictureRoundEnabled}
        questionsDirty={questionsDirty}
        metaDirty={metaDirty}
      />
      {tab === 'present' && (
        <PresenterPanel
          currentSlide={currentSlide}
          timer={timer}
          rounds={rounds}
          tiebreakers={tiebreakers}
          meta={meta}
          pastes={pastes}
        />
      )}
      {tab === 'questions' && (
        <QuestionsPanel
          draft={draftRounds}
          setDraft={setDraftRounds}
          draftTiebreakers={draftTiebreakers}
          setDraftTiebreakers={setDraftTiebreakers}
          setDirty={setQuestionsDirty}
          dirty={questionsDirty}
          save={saveQuestions}
          revert={revertQuestions}
          reset={resetQuestions}
          importNote={importNote}
          setImportNote={setImportNote}
          importPictures={importPictures}
          exportPictures={exportPictures}
          draftMeta={draftMeta}
          setDraftMeta={setDraftMeta}
          setMetaDirty={setMetaDirty}
        />
      )}
      {tab === 'setup' && (
        <ShowSetupPanel
          draftMeta={draftMeta}
          setDraftMeta={setDraftMeta}
          setDirty={setMetaDirty}
          dirty={metaDirty}
          save={saveSetup}
          revert={revertSetup}
          reset={resetSetup}
        />
      )}
      {tab === 'pictures' && pictureRoundEnabled && (
        <PicturesPanel
          pastes={pastes}
          updatePastes={updatePastes}
          meta={meta}
          rounds={rounds}
          imagesAvailable={imagesAvailable}
          pictureNote={pictureNote}
        />
      )}
      {/* Utilities stays mounted (hidden when not active) so a half-built
          face mash survives tab switches. */}
      <div style={{ display: tab === 'utilities' ? 'block' : 'none' }}>
        <UtilitiesPanel
          visible={tab === 'utilities'}
          pastes={pastes}
          livePastesRef={pastesRef}
          updatePastes={updatePastes}
          imagesAvailable={imagesAvailable}
          goToPictures={() => setTab(pictureRoundEnabled ? 'pictures' : 'setup')}
        />
      </div>
    </div>
  );
}

// ============================================================
// HEADER
// ============================================================
function Header({ tab, setTab, currentSlide, pictureRoundEnabled = true, questionsDirty = false, metaDirty = false }) {
  const tabs = [
    { id: 'present', label: 'Presenter' },
    { id: 'questions', label: 'Questions', dirty: questionsDirty },
    { id: 'setup', label: 'Show Setup', dirty: metaDirty },
    { id: 'pictures', label: 'Picture Round', disabled: !pictureRoundEnabled },
    { id: 'utilities', label: 'Utilities' },
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
            title={t.disabled ? 'Picture round is off — enable it under "Slides to Include" in the Show Setup tab' : undefined}
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
            {t.dirty && (
              <span
                title="Unsaved changes"
                style={{ marginLeft: 6, color: COLORS.warn, fontSize: 10, verticalAlign: 'middle' }}
              >●</span>
            )}
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
function PresenterPanel({ currentSlide, timer, rounds, tiebreakers, meta, pastes }) {
  const slideList = useMemo(() => buildSlideOutline(rounds, tiebreakers, meta, pastes), [rounds, tiebreakers, meta, pastes]);
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
  // The Picture Show slide reports its own richer state through the same
  // `timer:state` message (mode 'pictureShow') — swap in its control card.
  if (timer.mode === 'pictureShow') return <PictureShowCard show={timer} />;
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

const SHOW_PHASE_TEXT = {
  empty: 'No pictures loaded — paste images in the Picture Round tab',
  ready: 'Ready — waiting for Start',
  showing: 'Showing',
  gap: 'Between passes (“Second look”)',
  done: 'Pencils down — click Next when ready',
};

// Presenter control for the on-screen Picture Show. Start goes out as
// `pictureshow:start`; once running the same button toggles pause via
// `timer:toggle`. Back/Skip are `pictureshow:step` { delta: ∓1 }; ±10 s and
// Restart reuse `timer:adjust` / `timer:reset`. The deck itself never moves.
function PictureShowCard({ show }) {
  const pad = (n) => String(n ?? 0).padStart(2, '0');
  const running = show.phase === 'showing' || show.phase === 'gap';
  const canStart = show.phase === 'ready';
  const big = show.phase === 'showing' || show.phase === 'gap'
    ? `${show.seconds}s`
    : show.phase === 'done' ? 'DONE' : show.phase === 'empty' ? '—' : 'READY';
  const bigColor = running
    ? (show.paused ? COLORS.warn : (show.seconds <= 5 ? COLORS.danger : COLORS.accent))
    : COLORS.textDim;
  return (
    <Card title="Picture Show">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
        <div style={{
          fontFamily: "'Oswald', 'Helvetica Neue', Arial, sans-serif", fontSize: 64, fontWeight: 700,
          color: bigColor, lineHeight: 1,
        }}>
          {big}
        </div>
        <div style={{ fontSize: 13, color: COLORS.text }}>
          {show.total > 0 && show.phase !== 'empty' && show.phase !== 'ready' && (
            <div style={{ fontVariantNumeric: 'tabular-nums' }}>
              Image {pad(show.image)} · {show.position} of {show.total} · Pass {show.pass} of {show.passes}
            </div>
          )}
          <div style={{ fontSize: 12, color: show.paused ? COLORS.warn : COLORS.textDim, marginTop: 2 }}>
            {show.phase === 'ready' && show.total > 0 ? `${show.total} images · ` : ''}
            {show.paused ? 'Paused' : SHOW_PHASE_TEXT[show.phase] || show.phase}
            {' · '}{show.showSeconds}s per image
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          primary={canStart}
          onClick={() => broadcast(canStart ? 'pictureshow:start' : 'timer:toggle', null)}
          disabled={!canStart && !running}
        >
          {canStart || show.phase === 'empty' ? 'Start' : (show.paused ? 'Resume' : 'Pause')}
        </Button>
        <Button
          onClick={() => broadcast('pictureshow:step', { delta: -1 })}
          disabled={show.phase === 'ready' || show.phase === 'empty'}
        >
          ← Back
        </Button>
        <Button
          onClick={() => broadcast('pictureshow:step', { delta: 1 })}
          disabled={!running}
        >
          Skip →
        </Button>
        <Button onClick={() => broadcast('timer:adjust', -10)} disabled={!running} secondary>−10s</Button>
        <Button onClick={() => broadcast('timer:adjust', 10)} disabled={!running} secondary>+10s</Button>
        <Button
          onClick={() => broadcast('timer:reset', null)}
          disabled={show.phase === 'ready' || show.phase === 'empty'}
          secondary
        >
          Restart
        </Button>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: COLORS.textDim }}>
        The deck stays on this slide — Back/Skip move between images, not slides. Click Next when you&apos;re done.
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
// QUESTIONS PANEL — rounds + tiebreakers + import/export. Drafts and the
// save/revert/reset actions live in ControlApp (shared surface state);
// this panel renders them and owns the import plumbing.
// ============================================================
function QuestionsPanel({
  draft, setDraft, draftTiebreakers, setDraftTiebreakers, setDirty, dirty,
  save, revert, reset, importNote, setImportNote,
  importPictures, exportPictures, draftMeta, setDraftMeta, setMetaDirty,
}) {
  const [csvImport, setCsvImport] = useState(null);
  const fileInputRef = useRef(null);

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

  // Two export flavors sharing the same v2 bundle format (meta is optional,
  // detected by presence on import):
  //
  // - Questions deck: rounds + tiebreakers + pictures. The weekly swap —
  //   importing one never touches show settings, so venue copy, rules, and
  //   display prefs survive a new question set.
  // - Show bundle: adds `meta`. One file moves the whole event between
  //   machines; import it on the venue machine to restore everything.
  //
  // An empty paste buffer exports NO pictures section at all (rather than ten
  // null cells); when any slot has content the full 10-slot array ships,
  // since the empty entries are positional — they keep pictures in the right
  // cells — along with an `images` section holding every referenced picture
  // and answer image as a data URL (exportPictures in ControlApp).
  const [exporting, setExporting] = useState(false);
  const exportDate = () => new Date().toISOString().slice(0, 10);
  const onExportQuestions = async () => {
    setExporting(true);
    try {
      const { extras, note } = await exportPictures();
      const payload = buildQuestionsExport(draft, draftTiebreakers, extras);
      downloadFile(`trivia-questions-${exportDate()}.json`, JSON.stringify(payload, null, 2), 'application/json');
      if (note) setImportNote(note);
    } finally {
      setExporting(false);
    }
  };
  const onExportBundle = async () => {
    setExporting(true);
    try {
      const { extras, note } = await exportPictures();
      const payload = buildQuestionsExport(draft, draftTiebreakers, { ...extras, meta: draftMeta });
      downloadFile(`trivia-show-${exportDate()}.json`, JSON.stringify(payload, null, 2), 'application/json');
      if (note) setImportNote(note);
    } finally {
      setExporting(false);
    }
  };

  const onDownloadTemplate = () => {
    downloadFile('trivia-questions-template.csv', buildCsvTemplate(), 'text/csv');
  };

  const onImportClick = () => fileInputRef.current?.click();

  // The one place an import lands, whatever the source. Today that's only the
  // file picker; a pasted payload or a URL param would call straight into this
  // rather than reimplementing the per-kind branching and drifting from it.
  const applyImport = async (text, filename) => {
    try {
      const result = parseImport(text, filename);
      if (result.kind === 'json') {
        setDraft(result.rounds);
        // Absent tiebreakers mean "keep the deck's current ones". Writing
        // undefined here would strand the draft: buildQuestionsExport does
        // [...tiebreakers] on the next export, and the editor .maps over it.
        if (result.tiebreakers) setDraftTiebreakers(result.tiebreakers);
        setDirty(true);
        // A bundle's meta stages into the Show Setup surface (its own draft +
        // dirty dot) rather than committing — same review-then-save flow as
        // the questions, just saved from its own tab. Questions-only files
        // leave show settings completely untouched.
        if (result.meta) {
          setDraftMeta(sanitizeMeta(result.meta));
          setMetaDirty(true);
        }
        // Pictures have no draft stage — the Picture Round panel always
        // commits live — so a bundle's pictures (and their images) land
        // immediately while the question/meta edits above wait for Save &
        // Push. v1/v2 data-URL pictures migrate into image storage after.
        const notes = [];
        if (result.pictures) {
          setImportNote('Restoring pictures…');
          notes.push(await importPictures(result.pictures, result.images));
        }
        notes.push('review, then Save & Push');
        if (result.meta) notes.push('show settings staged in Show Setup — save there to push');
        setImportNote(`Deck imported — ${notes.join('; ')}.`);
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

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', position: 'sticky', top: 60, zIndex: 5,
        background: COLORS.bg, padding: '8px 0',
        flexWrap: 'wrap', rowGap: 8,
      }}>
        <Button onClick={save} primary disabled={!dirty}>Save & Push to Display</Button>
        <Button onClick={revert} disabled={!dirty}>Revert</Button>
        <Button onClick={reset} secondary>Reset Questions</Button>
        <span style={{ width: 1, height: 24, background: COLORS.border, margin: '0 4px' }} />
        <Button onClick={onExportQuestions} disabled={exporting}>Export Questions</Button>
        <Button onClick={onExportBundle} disabled={exporting}>Export Show Bundle</Button>
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

// ============================================================
// SHOW SETUP PANEL — everything that isn't questions: slide toggles, display
// settings, and all slide copy. This is the stable week-to-week surface; the
// Questions tab turns over every event. Edits its own draft (meta only) with
// its own Save/Revert/Reset, independent of the Questions surface.
// ============================================================
const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI'];

// Fixed-count editor for the { t, d } item lists (house rules, costume rules,
// wager rules, picture-round steps). No add/remove on purpose: RuleGrid and
// the instruction step cards are designed 4-up layouts, and sanitizeItems in
// meta.js pins the length anyway.
function RuleItemsEditor({ items, onUpdate, numeralFor = (i) => ROMAN_NUMERALS[i] ?? String(i + 1) }) {
  return (
    <>
      {items.map((it, i) => (
        <div key={i} style={{
          marginTop: i === 0 ? 4 : 12, paddingTop: i === 0 ? 0 : 10,
          borderTop: i === 0 ? 'none' : `1px solid ${COLORS.border}`,
        }}>
          <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: COLORS.textDim }}>
            {numeralFor(i)}
          </div>
          <Field label="Title" value={it.t} onChange={(v) => onUpdate(i, 't', v)} compact />
          <Field label="Detail" value={it.d} onChange={(v) => onUpdate(i, 'd', v)} multiline compact />
        </div>
      ))}
    </>
  );
}

function ShowSetupPanel({ draftMeta, setDraftMeta, setDirty, dirty, save, revert, reset }) {
  const updateMeta = (section, field, value) => {
    setDirty(true);
    setDraftMeta((m) => ({ ...m, [section]: { ...m[section], [field]: value } }));
  };
  // Item-list version of updateMeta for the { t, d } rule/step arrays.
  const updateMetaItem = (section, key, index, field, value) => {
    setDirty(true);
    setDraftMeta((m) => ({
      ...m,
      [section]: {
        ...m[section],
        [key]: m[section][key].map((it, i) => (i === index ? { ...it, [field]: value } : it)),
      },
    }));
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', position: 'sticky', top: 60, zIndex: 5,
        background: COLORS.bg, padding: '8px 0',
        flexWrap: 'wrap', rowGap: 8,
      }}>
        <Button onClick={save} primary disabled={!dirty}>Save & Push to Display</Button>
        <Button onClick={revert} disabled={!dirty}>Revert</Button>
        <Button onClick={reset} secondary>Reset Show Setup</Button>
        {dirty && <span style={{ color: COLORS.warn, fontSize: 12 }}>Unsaved changes</span>}
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
          label="Picture round (R1 opener + instructions + intermission + answer walkthrough)"
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

      <Card title="Title Slide">
        <Field label="Eyebrow" value={draftMeta.title.eyebrow} onChange={(v) => updateMeta('title', 'eyebrow', v)} />
        <Field label="Hero" value={draftMeta.title.hero} onChange={(v) => updateMeta('title', 'hero', v)} />
        <Field label="Edition" value={draftMeta.title.edition} onChange={(v) => updateMeta('title', 'edition', v)} />
        <Field label="Tagline" value={draftMeta.title.tagline} onChange={(v) => updateMeta('title', 'tagline', v)} />
        <Field label="Hosts" value={draftMeta.title.hosts} onChange={(v) => updateMeta('title', 'hosts', v)} />
        <Field label="Footer" value={draftMeta.title.footerDate} onChange={(v) => updateMeta('title', 'footerDate', v)} />
      </Card>

      <Card title="House Rules">
        <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 8 }}>
          Shown on the rules slide, right after the title. Four rules — the slide is a 2×2 grid; numerals are automatic.
        </div>
        <RuleItemsEditor
          items={draftMeta.rules.items}
          onUpdate={(i, f, v) => updateMetaItem('rules', 'items', i, f, v)}
        />
      </Card>

      <Card title="Prize Slide">
        <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 8 }}>
          Only shown when the prize slide is toggled on above.
        </div>
        <Field label="Eyebrow" value={draftMeta.prize.eyebrow} onChange={(v) => updateMeta('prize', 'eyebrow', v)} />
        <Field label="Heading" value={draftMeta.prize.heading} onChange={(v) => updateMeta('prize', 'heading', v)} />
        <Field label="Banner" value={draftMeta.prize.banner} onChange={(v) => updateMeta('prize', 'banner', v)} />
        <Field label="Amount" value={draftMeta.prize.amount} onChange={(v) => updateMeta('prize', 'amount', v)} />
        <Field label="Award" value={draftMeta.prize.award} onChange={(v) => updateMeta('prize', 'award', v)} />
        <Field label="Tagline" value={draftMeta.prize.tagline} onChange={(v) => updateMeta('prize', 'tagline', v)} multiline />
      </Card>

      <Card title="Costume Contest">
        <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 8 }}>
          Rules shown on the costume contest slide (when toggled on above).
        </div>
        <RuleItemsEditor
          items={draftMeta.costume.items}
          onUpdate={(i, f, v) => updateMetaItem('costume', 'items', i, f, v)}
        />
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
          <div style={{ marginTop: 16, fontSize: 11, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: COLORS.textDim }}>
            How it&apos;s played
          </div>
          <label style={{
            display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12,
            alignItems: 'center', marginTop: 10,
          }}>
            <span style={{ fontSize: 13 }}>Mode</span>
            <select
              value={draftMeta.pictureRound.mode}
              onChange={(e) => updateMeta('pictureRound', 'mode', e.target.value)}
              disabled={!draftMeta.show.pictureRound}
              style={{
                padding: '6px 8px', background: COLORS.bg, color: COLORS.text,
                border: `1px solid ${COLORS.border}`, borderRadius: 6,
                fontFamily: 'inherit', fontSize: 13,
              }}
            >
              {PICTURE_MODES.map((m) => (
                <option key={m} value={m}>{PICTURE_MODE_LABELS[m]}</option>
              ))}
            </select>
          </label>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>
            Paper = handout only (no extra slide). On screen / Both add a timed Picture Show slide after the
            instructions: the stills play one at a time, and you run it from the Presenter tab.
          </div>
          {draftMeta.pictureRound.mode !== 'paper' && (
            <>
              <Slider
                label="Seconds per image"
                value={draftMeta.pictureRound.showSeconds}
                min={SHOW_SECONDS_MIN}
                max={SHOW_SECONDS_MAX}
                step={5}
                unit="s"
                onChange={(v) => updateMeta('pictureRound', 'showSeconds', v)}
              />
              <Slider
                label="Passes (times the whole set plays)"
                value={draftMeta.pictureRound.showPasses}
                min={1}
                max={SHOW_PASSES_MAX}
                step={1}
                onChange={(v) => updateMeta('pictureRound', 'showPasses', v)}
              />
              <Toggle
                label="Sound (tick on each image, bell at “Pencils down”)"
                value={draftMeta.pictureRound.showSound}
                onChange={(v) => updateMeta('pictureRound', 'showSound', v)}
              />
            </>
          )}
          <div style={{ marginTop: 16, fontSize: 11, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: COLORS.textDim }}>
            Opener Slide{draftMeta.pictureRound.mode === 'screen' ? ' (on-screen copy)' : ''}
          </div>
          <Field label="Title" value={draftMeta.pictureRound.openerTitle} onChange={(v) => updateMeta('pictureRound', 'openerTitle', v)} />
          {draftMeta.pictureRound.mode === 'screen' ? (
            <>
              <Field label="Subtitle" value={draftMeta.pictureRound.screenOpenerSubtitle} onChange={(v) => updateMeta('pictureRound', 'screenOpenerSubtitle', v)} multiline />
              <Field label="Kicker" value={draftMeta.pictureRound.screenOpenerKicker} onChange={(v) => updateMeta('pictureRound', 'screenOpenerKicker', v)} />
            </>
          ) : (
            <>
              <Field label="Subtitle" value={draftMeta.pictureRound.openerSubtitle} onChange={(v) => updateMeta('pictureRound', 'openerSubtitle', v)} multiline />
              <Field label="Kicker" value={draftMeta.pictureRound.openerKicker} onChange={(v) => updateMeta('pictureRound', 'openerKicker', v)} />
            </>
          )}
          {draftMeta.pictureRound.mode === 'both' && (
            <Field label="Screen note" value={draftMeta.pictureRound.bothNote} onChange={(v) => updateMeta('pictureRound', 'bothNote', v)} multiline />
          )}
          <div style={{ marginTop: 16, fontSize: 11, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: COLORS.textDim }}>
            Instruction Steps{draftMeta.pictureRound.mode === 'screen' ? ' (on-screen copy)' : ''}
          </div>
          <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 6 }}>
            The four step cards on the instructions slide{draftMeta.pictureRound.mode === 'screen'
              ? ' — the on-screen set; paper/both modes keep their own copy'
              : ''}. Tokens: <code>{'{nextRound}'}</code> → the first trivia round&apos;s number,{' '}
            <code>{'{seconds}'}</code> → seconds per image, <code>{'{passes}'}</code> → “once” / “twice” / “three times”.
          </div>
          {draftMeta.pictureRound.mode === 'screen' ? (
            <RuleItemsEditor
              items={draftMeta.pictureRound.screenSteps}
              onUpdate={(i, f, v) => updateMetaItem('pictureRound', 'screenSteps', i, f, v)}
              numeralFor={(i) => String(i + 1).padStart(2, '0')}
            />
          ) : (
            <RuleItemsEditor
              items={draftMeta.pictureRound.steps}
              onUpdate={(i, f, v) => updateMetaItem('pictureRound', 'steps', i, f, v)}
              numeralFor={(i) => String(i + 1).padStart(2, '0')}
            />
          )}
        </div>
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

      <Card title="End Slide">
        <Field label="Line 1" value={draftMeta.end.hero1} onChange={(v) => updateMeta('end', 'hero1', v)} />
        <Field label="Line 2" value={draftMeta.end.hero2} onChange={(v) => updateMeta('end', 'hero2', v)} />
        <Field label="Subtitle" value={draftMeta.end.subtitle} onChange={(v) => updateMeta('end', 'subtitle', v)} />
      </Card>

      <Card title="Tiebreaker Wager Rules">
        <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 8 }}>
          Shown on the Final Wager intro slide (when tiebreakers are toggled on above).
        </div>
        <RuleItemsEditor
          items={draftMeta.wager.items}
          onUpdate={(i, f, v) => updateMetaItem('wager', 'items', i, f, v)}
        />
      </Card>
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
function PicturesPanel({ pastes, updatePastes, meta, rounds = [], imagesAvailable, pictureNote = '' }) {
  const [focusedCell, setFocusedCell] = useState(null);
  const [status, setStatus] = useState('');
  const items = useMemo(() => mergeItems(pastes), [pastes]);
  const narrow = useNarrowLayout();
  // Cell fit/aspect come from the saved meta (like the instruction), so the
  // editor preview + exported handout match the display's last-saved settings.
  const fit = meta.pictureRound?.fit ?? 'cover';
  const aspect = meta.pictureRound?.aspect ?? '316 / 220';
  const handoutOpts = { fit, aspect };
  const storeOk = imagesAvailable !== false;

  const setStatusFlash = useCallback((msg) => {
    setStatus(msg);
    setTimeout(() => setStatus((s) => (s === msg ? '' : s)), 2400);
  }, []);

  // Commit + surface a persistence failure. The display still shows the
  // change this session (commitPastes broadcasts before saving); the warning
  // is about the buffer not surviving a reload.
  const commitChecked = useCallback((fn, okMsg) => {
    const saved = updatePastes(fn);
    setStatusFlash(saved ? okMsg : `${okMsg} — but storage is full, so it won’t survive a reload. Clear unused cells.`);
  }, [updatePastes, setStatusFlash]);

  const setSlot = useCallback((i, fields) => (cur) =>
    cur.map((p, idx) => (idx === i ? { ...p, ...fields } : p)), []);

  // Slot picture: downscaled + re-encoded into the image store (the slot
  // keeps only the id). Without IndexedDB, falls back to the old behaviour —
  // a downscaled data URL in the localStorage buffer. Crop position resets
  // so old framing doesn't carry over.
  const loadIntoCell = useCallback(async (i, blob, verb) => {
    const label = `${verb} cell ${String(i + 1).padStart(2, '0')}`;
    if (storeOk) {
      const id = newImageId();
      const release = holdMedia([id]);
      try {
        await addImage(blob, { kind: 'picture', id });
        commitChecked(setSlot(i, { imageId: id, dataUrl: null, position: { x: 50, y: 50 } }), label);
        return;
      } catch (e) {
        if (!(e instanceof ImageStoreUnavailableError)) {
          setStatusFlash(`Image failed to load: ${e.message}`);
          return;
        }
        // Store went away mid-session: degrade to a data URL below.
      } finally {
        release();
      }
    }
    try {
      const dataUrl = await ingestImage(blob);
      commitChecked(setSlot(i, { imageId: null, dataUrl, position: { x: 50, y: 50 } }), label);
    } catch (e) {
      setStatusFlash(`Image failed to load: ${e.message}`);
    }
  }, [storeOk, commitChecked, setSlot, setStatusFlash]);

  // Answer image A/B — image store only (no data-URL fallback for answers).
  const loadAnswerImage = useCallback(async (i, which, blob) => {
    if (!blob || !/^image\//.test(blob.type || '')) return;
    if (!storeOk) { setStatusFlash('Answer images need image storage, which this browser has turned off.'); return; }
    const id = newImageId();
    const release = holdMedia([id]);
    try {
      await addImage(blob, { kind: 'answer', id });
      commitChecked(setSlot(i, { [`answerImage${which}Id`]: id }),
        `Answer image ${which} set for picture ${String(i + 1).padStart(2, '0')}`);
    } catch (e) {
      setStatusFlash(`Answer image failed: ${e.message}`);
    } finally {
      release();
    }
  }, [storeOk, commitChecked, setSlot, setStatusFlash]);

  const imageFromClipboard = (e) => {
    for (const item of e.clipboardData?.items || []) {
      if (item.type.startsWith('image/')) return item.getAsFile();
    }
    return null;
  };

  const handlePaste = useCallback((i, e) => {
    const file = imageFromClipboard(e);
    if (!file) return;
    e.preventDefault();
    loadIntoCell(i, file, 'Pasted into');
  }, [loadIntoCell]);

  const handleDrop = useCallback((i, e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    loadIntoCell(i, file, 'Loaded image into');
  }, [loadIntoCell]);

  const setCellPosition = useCallback((i, position) => {
    updatePastes(setSlot(i, { position }));
  }, [updatePastes, setSlot]);

  // Text fields (answer caption, labels) commit on blur / Enter.
  const setAnswerText = useCallback((i, field, value) => {
    updatePastes(setSlot(i, { [field]: value.trim() ? value : null }));
  }, [updatePastes, setSlot]);

  // × on a cell clears the whole slot — picture, answer text, answer images.
  const clearCell = (i) => {
    const p = pastes[i];
    const hasAnswers = p.caption || p.answerImageAId || p.answerImageBId || p.answerLabelA || p.answerLabelB;
    if (hasAnswers && !confirm(`Clear picture ${String(i + 1).padStart(2, '0')} and its answer (text + answer images)?`)) return;
    updatePastes(setSlot(i, emptyPaste()));
  };

  const clearAll = () => {
    if (!confirm('Clear all pictures and answers? This will reset every cell.')) return;
    clearPastes();
    updatePastes(() => loadPastes());
    setStatusFlash('All pictures cleared');
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
      // One sheet covers every trivia round: line count follows the longest round.
      await downloadAnswersHandoutPng(Math.max(10, ...rounds.map((r) => r.questions.length)));
      setStatusFlash('Answers handout downloaded — photocopy one per team per round');
    } catch (e) {
      setStatusFlash(`Download failed: ${e.message}`);
    }
  };

  // Picture-round answer sheet (the on-screen Picture Show's sheet): one line
  // per slot, two for a face-mash slot (03A / 03B).
  const mashCount = pastes.filter(isFaceMashSlot).length;
  const onDownloadPictureAnswers = async () => {
    try {
      await downloadAnswersHandoutPng(pictureAnswerLines(pastes), 'picture-answers-sheet.png', { title: 'PICTURE ROUND' });
      setStatusFlash('Picture answer sheet downloaded');
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
          Under each cell, the <strong>Answer</strong> section holds what the answer walkthrough reveals after the
          intermission: the answer text plus up to two answer images with labels (a face mash uses both — build
          one in <strong>Utilities</strong>). Images are stored in this browser; <strong>Export Show Bundle</strong>{' '}
          (Questions tab) bundles them with the questions into one file you can import on another machine.
        </div>
        {imagesAvailable === false && (
          <div style={{ fontSize: 12, color: COLORS.warn, marginBottom: 12 }}>
            Image storage (IndexedDB) is unavailable in this browser — private browsing or blocked site data are the usual
            causes. Pictures are kept in localStorage as before (about ten fit), and answer images are turned off.
          </div>
        )}
        {pictureNote && (
          <div style={{ fontSize: 12, color: COLORS.warn, marginBottom: 12 }}>{pictureNote}</div>
        )}
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${narrow ? 2 : 5}, minmax(0, 1fr))`, gap: 12,
        }}>
          {pastes.map((p, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <PictureCell
                i={i}
                item={items[i]}
                focused={focusedCell === i}
                fit={fit}
                aspect={aspect}
                onFocus={() => setFocusedCell(i)}
                onPaste={(e) => handlePaste(i, e)}
                onDrop={(e) => handleDrop(i, e)}
                onClear={() => clearCell(i)}
                canClear={slotHasContent(p)}
                onPositionChange={(pos) => setCellPosition(i, pos)}
              />
              <AnswerEditor
                paste={p}
                storeOk={storeOk}
                onText={(field, v) => setAnswerText(i, field, v)}
                onImage={(which, blob) => loadAnswerImage(i, which, blob)}
                onClearImage={(which) => updatePastes(setSlot(i, { [`answerImage${which}Id`]: null }))}
                imageFromClipboard={imageFromClipboard}
              />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button onClick={onCopy} primary>Copy Handout to Clipboard</Button>
          <Button onClick={onDownload}>Download Handout PNG</Button>
          <Button onClick={onDownloadPictureAnswers}>
            Download Picture Answer Sheet{mashCount ? ` (${mashCount} face mash${mashCount === 1 ? '' : 'es'})` : ''}
          </Button>
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

// A text input that keeps local edits and commits once — on blur or Enter —
// so typing doesn't persist + broadcast the whole buffer per keystroke.
function CommitInput({ value, onCommit, placeholder, small = false }) {
  const [local, setLocal] = useState(value || '');
  const focusedRef = useRef(false);
  useEffect(() => { if (!focusedRef.current) setLocal(value || ''); }, [value]);
  const commit = () => { if ((local || '') !== (value || '')) onCommit(local); };
  return (
    <input
      value={local}
      placeholder={placeholder}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => { focusedRef.current = false; commit(); }}
      onChange={(e) => setLocal(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      style={{
        width: '100%', minWidth: 0, boxSizing: 'border-box', padding: small ? '4px 6px' : '6px 8px',
        background: COLORS.bg, color: COLORS.text,
        border: `1px solid ${COLORS.border}`, borderRadius: 5,
        fontFamily: 'inherit', fontSize: small ? 11 : 12,
      }}
    />
  );
}

// The per-cell "Answer" section: answer text (the slot caption) plus answer
// images A and B with optional labels. With both labels set and no typed
// text, the reveal shows "A · B" — the placeholder previews that.
function AnswerEditor({ paste, storeOk, onText, onImage, onClearImage, imageFromClipboard }) {
  const derived = answerTextFor({ ...paste, caption: null });
  return (
    <div style={{
      padding: 8, borderRadius: 6, border: `1px solid ${COLORS.border}`, background: COLORS.panelAlt,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: COLORS.textDim }}>
        Answer{isFaceMashSlot(paste) ? ' · face mash (2 lines)' : ''}
      </div>
      <CommitInput
        value={paste.caption}
        placeholder={derived ? `${derived} (from labels)` : 'Answer text'}
        onCommit={(v) => onText('caption', v)}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {['A', 'B'].map((which) => (
          <div key={which} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <AnswerImageSlot
              which={which}
              id={paste[`answerImage${which}Id`]}
              disabled={!storeOk}
              onFile={(blob) => onImage(which, blob)}
              onClear={() => onClearImage(which)}
              imageFromClipboard={imageFromClipboard}
            />
            <CommitInput
              small
              value={paste[`answerLabel${which}`]}
              placeholder={`Label ${which}`}
              onCommit={(v) => onText(`answerLabel${which}`, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// One answer-image well: focus + paste, drop, or click to pick a file.
// Shows the stored image (or a placeholder when it's missing).
function AnswerImageSlot({ which, id, disabled, onFile, onClear, imageFromClipboard }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const { url, status } = useImageUrl(id || null);
  const pick = () => { if (!disabled) inputRef.current?.click(); };
  return (
    <div
      tabIndex={disabled ? -1 : 0}
      role="button"
      title={disabled ? 'Answer images need image storage (unavailable in this browser)' : `Answer image ${which} — click to choose, or focus and paste, or drop a file`}
      onClick={pick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
      onPaste={(e) => {
        if (disabled) return;
        const file = imageFromClipboard(e);
        if (file) { e.preventDefault(); onFile(file); }
      }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFile(e.dataTransfer?.files?.[0]);
      }}
      style={{
        position: 'relative', aspectRatio: '1 / 1', borderRadius: 5, overflow: 'hidden',
        border: `1px ${id ? 'solid' : 'dashed'} ${over ? COLORS.accent : COLORS.border}`,
        background: COLORS.bg, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1, outline: 'none',
      }}
    >
      {id && status === 'ready' && url ? (
        <img src={url} alt={`Answer ${which}`} draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: id && status !== 'loading' ? COLORS.warn : COLORS.textDim, padding: 4,
        }}>
          {id ? (status === 'loading' ? '…' : 'Missing') : `+ Image ${which}`}
        </div>
      )}
      <div style={{
        position: 'absolute', top: 3, left: 3, padding: '0 5px', borderRadius: 3,
        background: COLORS.panelAlt, color: COLORS.text, fontSize: 10, fontWeight: 700, pointerEvents: 'none',
      }}>{which}</div>
      {id && (
        <button
          type="button"
          title={`Clear answer image ${which}`}
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          style={{
            position: 'absolute', top: 3, right: 3, width: 18, height: 18,
            border: 0, borderRadius: 3, background: COLORS.danger, color: '#fff',
            fontSize: 12, lineHeight: '16px', cursor: 'pointer', padding: 0,
          }}
        >×</button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

function PictureCell({
  i, item, focused, fit = 'cover', aspect = '316 / 220', canClear = false,
  onFocus, onPaste, onDrop, onClear, onPositionChange,
}) {
  const ref = useRef(null);
  const [diskFailed, setDiskFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Live crop position while dragging — local-only so the persist +
  // broadcast happens once on pointer-up, not per mouse move.
  const [livePos, setLivePos] = useState(null);
  const position = item.position;
  // Stored picture → object URL from the image store; legacy/degraded →
  // inline data URL; empty slot → the disk fallback (if it loads).
  const { url: storedUrl, status: storedStatus } = useImageUrl(item.imageId || null);
  const isPasted = item.isPasted;
  const storedMissing = !!item.imageId && (storedStatus === 'missing' || storedStatus === 'unavailable');
  const showSrc = item.imageId
    ? (storedStatus === 'ready' ? storedUrl : null)
    : (item.dataUrl || (!diskFailed ? item.fallbackSrc : null));
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
          justifyContent: 'center', color: storedMissing ? COLORS.warn : COLORS.textDim, fontSize: 11,
          letterSpacing: '0.2em', textTransform: 'uppercase', textAlign: 'center', padding: 8,
        }}>
          {storedMissing ? 'Image missing — paste again' : item.imageId ? '…' : focused ? 'Paste image' : 'Empty'}
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
      {canClear && (
        <button
          type="button"
          title="Clear cell (picture + answer)"
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
          {item.dataUrl ? 'Pasted · local' : 'Pasted'}
        </div>
      )}
    </div>
  );
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ============================================================
// UTILITIES PANEL — host-side content tools. A picker over a TOOLS registry
// (structured like barstool-trivia-scaffold's): only the Face Mash Maker is
// built here. Future tools register with `ready: false` until they exist, so
// the picker shape doesn't change when they land. ControlApp keeps this
// panel mounted (hidden) so a half-built mash survives tab switches.
// ============================================================
const TOOLS = [
  { id: 'faceMash', label: 'Face Mash Maker', blurb: 'Blend two faces into one picture-round image, with both originals as the answer.', ready: true },
];

function UtilitiesPanel({ visible, pastes, livePastesRef, updatePastes, imagesAvailable, goToPictures }) {
  const [tool, setTool] = useState('faceMash');
  const narrow = useNarrowLayout();
  return (
    <div style={{
      padding: 16, display: 'grid', gap: 16, alignItems: 'start',
      gridTemplateColumns: narrow ? '1fr' : '220px minmax(0, 1fr)',
    }}>
      <nav style={{ display: 'flex', flexDirection: narrow ? 'row' : 'column', gap: 6, flexWrap: 'wrap' }}>
        {TOOLS.map((t) => {
          const active = t.id === tool;
          return (
            <button
              key={t.id}
              onClick={() => t.ready && setTool(t.id)}
              disabled={!t.ready}
              title={t.ready ? t.blurb : `${t.blurb} (coming soon)`}
              style={{
                textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                background: active ? COLORS.accentDim : COLORS.panel,
                color: t.ready ? (active ? COLORS.accent : COLORS.text) : COLORS.textDim,
                fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                cursor: t.ready ? 'pointer' : 'not-allowed', opacity: t.ready ? 1 : 0.6,
                flex: narrow ? '1 1 160px' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{t.label}</span>
                {!t.ready && (
                  <span style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Soon</span>
                )}
              </div>
              {!narrow && (
                <div style={{ marginTop: 4, fontSize: 11, color: COLORS.textDim, fontWeight: 400 }}>{t.blurb}</div>
              )}
            </button>
          );
        })}
      </nav>
      <div style={{ display: tool === 'faceMash' ? 'block' : 'none', minWidth: 0 }}>
        <FaceMashMaker
          visible={visible && tool === 'faceMash'}
          pastes={pastes}
          livePastesRef={livePastesRef}
          updatePastes={updatePastes}
          imagesAvailable={imagesAvailable}
          goToPictures={goToPictures}
        />
      </div>
    </div>
  );
}


// Landmark colours on the source photos: eyes in the control accent, mouth
// in pink so the third point reads as different at a glance.
const MOUTH_COLOR = '#FF6FA3';
const EMPTY_PHOTO = { img: null, pts: [], error: '' };
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The Face Mash Maker (ported from barstool-trivia-scaffold). "Outside head"
// is photo A (keeps hair, jaw, background) and becomes answer image A /
// label A on the picture slot; "Inside face" is photo B (eyes, nose, mouth)
// → answer image B / label B. The answer walkthrough's reveal shows
// A | mash | B, so the mapping is visible to players too.
function FaceMashMaker({ visible, pastes, livePastesRef, updatePastes, imagesAvailable, goToPictures }) {
  const narrow = useNarrowLayout();
  const [photos, setPhotos] = useState({ outside: EMPTY_PHOTO, inside: EMPTY_PHOTO });
  const [actors, setActors] = useState({ outside: '', inside: '' });
  const [ctl, setCtl] = useState(FACE_MASH_CONTROLS);
  const [outline, setOutline] = useState(false);
  const [composeError, setComposeError] = useState('');
  const [slot, setSlot] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ text: '', tone: 'info' });
  const outRef = useRef(null);

  const ready = faceMashReady(photos.outside, photos.inside);

  // Recompose at most once per frame — dragging a landmark re-renders on
  // every pointermove, and compose walks every pixel of the face box.
  useEffect(() => {
    if (!ready || !visible) return undefined;
    const raf = requestAnimationFrame(() => {
      if (!outRef.current) return;
      // compose() reports bad landmarks as a string; anything it still
      // throws (canvas errors) must surface too — nothing catches inside rAF.
      try {
        setComposeError(composeFaceMash(outRef.current, photos.outside, photos.inside, ctl, outline) || '');
      } catch (err) {
        setComposeError(`Could not compose the mash — ${err.message || 'canvas error'}.`);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [ready, visible, photos, ctl, outline]);

  const setPhoto = (key, updater) =>
    setPhotos((p) => ({ ...p, [key]: typeof updater === 'function' ? updater(p[key]) : updater }));

  const loadFile = async (key, file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setPhoto(key, (ph) => ({ ...ph, error: 'That file isn’t an image. Use a JPG, PNG, or WebP.' }));
      return;
    }
    try {
      const img = await decodeToCanvas(file);
      setPhoto(key, { img, pts: [], error: '' });
    } catch {
      setPhoto(key, (ph) => ({ ...ph, error: 'This image couldn’t be opened. Try saving it as a JPG or PNG first.' }));
    }
  };

  const swap = () => {
    setPhotos((p) => ({ outside: p.inside, inside: p.outside }));
    setActors((a) => ({ outside: a.inside, inside: a.outside }));
  };

  // Fresh full-resolution render without the outline, for export/storage.
  const renderFinal = () => {
    const c = document.createElement('canvas');
    const err = composeFaceMash(c, photos.outside, photos.inside, ctl, false);
    if (err) throw new Error(err);
    return c;
  };

  const onDownload = async () => {
    try {
      const c = renderFinal();
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Could not encode the PNG.');
      const names = [actors.outside, actors.inside].map(slugify).filter(Boolean);
      downloadFile(`face-mash${names.length ? `-${names.join('-')}` : ''}.png`, blob, 'image/png');
      setNote({ text: 'PNG downloaded.', tone: 'info' });
    } catch (err) {
      setNote({ text: err.message, tone: 'error' });
    }
  };

  // ---- Add to picture round -----------------------------------------------
  // Pictures have no draft stage in this deck: the write goes through the
  // same updatePastes path the Picture Round tab uses (persist + broadcast),
  // so the slot is live on the display as soon as it lands.
  const canAdd = ready && !composeError && !busy && imagesAvailable !== false;

  const onAdd = async () => {
    if (!canAdd) return;
    const n = String(slot + 1).padStart(2, '0');
    const existing = (livePastesRef.current || [])[slot];
    if (slotHasContent(existing) && !confirm(`Picture ${n} already has content. Replace its picture, answer images, and answer text with this face mash?`)) return;
    setBusy(true);
    setNote({ text: 'Saving images…', tone: 'info' });
    // Three sequential stores; hold all three ids until the slot write lands,
    // or a paste commit in between would GC the first image.
    const imageId = newImageId();
    const answerImageAId = newImageId();
    const answerImageBId = newImageId();
    const release = holdMedia([imageId, answerImageAId, answerImageBId]);
    try {
      const mashCanvas = renderFinal();
      await addImage(mashCanvas, { kind: 'mash', id: imageId });
      await addImage(photos.outside.img, { kind: 'source', id: answerImageAId });
      await addImage(photos.inside.img, { kind: 'source', id: answerImageBId });
      // The caption is cleared: the slot's old answer text described a
      // different picture. With both labels set, the reveal derives
      // "A · B" from them; a caption typed later takes over.
      const saved = updatePastes((cur) => cur.map((p, i) => (i !== slot ? p : {
        ...p,
        imageId, dataUrl: null, position: { x: 50, y: 50 }, caption: null,
        answerImageAId, answerLabelA: actors.outside.trim() || null,
        answerImageBId, answerLabelB: actors.inside.trim() || null,
      })));
      setNote({
        text: `Added as Picture ${n} — live on the display${saved ? '' : ' (but storage is full, so it won’t survive a reload)'}.`,
        tone: saved ? 'info' : 'error',
      });
    } catch (err) {
      setNote({ text: `Not added — ${err.message || 'could not store images.'}`, tone: 'error' });
    } finally {
      release();
      setBusy(false);
    }
  };

  const selectStyle = {
    width: '100%', padding: '7px 8px', background: COLORS.bg, color: COLORS.text,
    border: `1px solid ${COLORS.border}`, borderRadius: 6, fontFamily: 'inherit', fontSize: 13,
  };
  const ctlRows = [
    { id: 'width', label: 'Face area width', min: 60, max: 160, unit: '%' },
    { id: 'height', label: 'Face area height', min: 60, max: 160, unit: '%',
      hint: "Taller pulls in more of the inside person's eyebrows, which makes them easier to guess." },
    { id: 'feather', label: 'Edge softness', min: 5, max: 70, unit: '%' },
    { id: 'color', label: 'Skin tone match', min: 0, max: 100, unit: '%' },
    { id: 'bright', label: 'Brightness', min: -40, max: 40, unit: '' },
    { id: 'opacity', label: 'Face opacity', min: 0, max: 100, unit: '%',
      hint: 'Drop to about 50% to check that the eyes line up.' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: COLORS.textDim, maxWidth: '80ch' }}>
        Drop in two photos, mark both eyes and the mouth on each, and the face gets lined up, feathered, and color-matched onto the other head. Front-facing photos with similar lighting give the cleanest result.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 16 }}>
        <MashSourcePanel
          title="Outside head · Photo A"
          role="The base photo. Keeps the hair, ears, jaw, and background."
          photo={photos.outside}
          visible={visible}
          onFile={(f) => loadFile('outside', f)}
          onPoints={(fn) => setPhoto('outside', (ph) => ({ ...ph, pts: fn(ph.pts) }))}
        />
        <MashSourcePanel
          title="Inside face · Photo B"
          role="Supplies the eyes, nose, and mouth."
          photo={photos.inside}
          visible={visible}
          onFile={(f) => loadFile('inside', f)}
          onPoints={(fn) => setPhoto('inside', (ph) => ({ ...ph, pts: fn(ph.pts) }))}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) 340px', gap: 16, alignItems: 'start' }}>
        <Card title="Result">
          <div style={{
            background: COLORS.bg, borderRadius: 8, minHeight: 300, padding: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <canvas
              ref={outRef}
              style={{
                display: ready && !composeError ? 'block' : 'none',
                maxWidth: '100%', maxHeight: '64vh', width: 'auto', height: 'auto', borderRadius: 4,
              }}
            />
            {(!ready || composeError) && (
              <div style={{ color: composeError ? COLORS.warn : COLORS.textDim, textAlign: 'center', maxWidth: '36ch', fontSize: 13 }}>
                {composeError
                  || (!photos.outside.img || !photos.inside.img
                    ? 'Add both photos to get started.'
                    : 'Your mash appears here once both photos have their three points.')}
              </div>
            )}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Adjust">
            {ctlRows.map((row) => (
              <div key={row.id}>
                <Slider
                  label={row.label}
                  value={ctl[row.id]}
                  min={row.min}
                  max={row.max}
                  unit={row.unit}
                  onChange={(v) => setCtl((c) => ({ ...c, [row.id]: v }))}
                />
                {row.hint && <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>{row.hint}</div>}
              </div>
            ))}
            <Toggle label="Show blend area" value={outline} onChange={setOutline} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <Button onClick={onDownload} disabled={!ready || !!composeError}>Download PNG</Button>
              <Button onClick={swap} secondary disabled={!photos.outside.img && !photos.inside.img}>Swap photos</Button>
              <Button onClick={() => setCtl(FACE_MASH_CONTROLS)} secondary>Reset sliders</Button>
            </div>
          </Card>

          <Card title="Add to picture round">
            <Field label="Actor A" value={actors.outside}
              onChange={(v) => setActors((a) => ({ ...a, outside: v }))} compact />
            <Field label="Actor B" value={actors.inside}
              onChange={(v) => setActors((a) => ({ ...a, inside: v }))} compact />
            <label style={{ display: 'block', marginTop: 12, fontSize: 12, color: COLORS.textDim }}>
              Picture slot
              <select
                value={slot}
                onChange={(e) => setSlot(Number(e.target.value))}
                style={{ ...selectStyle, marginTop: 4 }}
              >
                {pastes.map((p, i) => {
                  const n = String(i + 1).padStart(2, '0');
                  const status = p.answerLabelA || p.answerLabelB
                    ? `${p.answerLabelA || '?'} × ${p.answerLabelB || '?'}`
                    : hasPicture(p) ? 'filled' : slotHasContent(p) ? 'answer only' : 'empty';
                  return <option key={i} value={i}>Picture {n} · {status}</option>;
                })}
              </select>
            </label>
            <div style={{ marginTop: 8, fontSize: 11, color: COLORS.textDim }}>
              The mash becomes the slot&apos;s picture; photo A and photo B become its two answer images, labelled with the actor names (the answer reads &ldquo;A · B&rdquo;).
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <Button onClick={onAdd} primary disabled={!canAdd}>{busy ? 'Adding…' : 'Add to picture round'}</Button>
              <Button onClick={goToPictures} secondary>Open Picture Round</Button>
            </div>
            {imagesAvailable === false && (
              <div style={{ marginTop: 8, fontSize: 11, color: COLORS.warn }}>
                Image storage is unavailable in this browser — Download PNG still works, but mashes can&apos;t be added to the picture round here.
              </div>
            )}
            {note.text && (
              <div style={{ marginTop: 8, fontSize: 12, color: note.tone === 'error' ? COLORS.danger : COLORS.accent }}>
                {note.text}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// One source photo: drop/pick, then click three landmarks (left eye, right
// eye, mouth) and drag any of them to fine-tune. Drawn imperatively onto a
// canvas sized to the stage width; a ResizeObserver repaints when the stage
// changes size — including when the hidden Utilities tab is shown again.
function MashSourcePanel({ title, role, photo, visible, onFile, onPoints }) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const inputRef = useRef(null);
  const scaleRef = useRef(1);
  const dragRef = useRef(null);
  const [over, setOver] = useState(false);
  const { img, pts } = photo;

  const drawRef = useRef(() => {});
  drawRef.current = () => {
    const cv = canvasRef.current, stage = stageRef.current;
    if (!img || !cv || !stage) return;
    const availW = stage.clientWidth;
    if (!availW) return; // hidden tab — the ResizeObserver repaints on show
    const scale = Math.min(availW / img.width, 360 / img.height);
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    scaleRef.current = scale;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.drawImage(img, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (pts.length >= 2) {
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(pts[0].x * scale, pts[0].y * scale); ctx.lineTo(pts[1].x * scale, pts[1].y * scale); ctx.stroke();
      ctx.setLineDash([]);
    }
    pts.forEach((pt, i) => {
      const x = pt.x * scale, y = pt.y * scale, col = i === 2 ? MOUTH_COLOR : COLORS.accent;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 14, y - 14, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS.bg; ctx.font = '700 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x + 14, y - 13.5);
    });
  };

  useEffect(() => { drawRef.current(); }, [img, pts, visible]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => drawRef.current());
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  const toImg = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scaleRef.current, y: (e.clientY - r.top) / scaleRef.current };
  };
  const clampPt = (pt) => ({ x: Math.max(0, Math.min(img.width, pt.x)), y: Math.max(0, Math.min(img.height, pt.y)) });

  const onPointerDown = (e) => {
    const q = toImg(e);
    let hit = -1, best = 20 / scaleRef.current;
    pts.forEach((pt, i) => { const d = Math.hypot(pt.x - q.x, pt.y - q.y); if (d < best) { best = d; hit = i; } });
    if (hit < 0 && pts.length < 3) {
      hit = pts.length;
      const added = clampPt(q);
      onPoints((p) => (p.length < 3 ? [...p, added] : p));
    }
    if (hit >= 0) {
      dragRef.current = hit;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e) => {
    const idx = dragRef.current;
    if (idx === null) return;
    const moved = clampPt(toImg(e));
    onPoints((p) => p.map((pt, i) => (i === idx ? moved : pt)));
  };
  const endDrag = () => { dragRef.current = null; };

  const n = pts.length;
  const pick = () => inputRef.current?.click();

  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{title}</div>
      <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>{role}</div>
      <div
        ref={stageRef}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onFile(Array.from(e.dataTransfer?.files || []).find((f) => /^image\//.test(f.type)) || e.dataTransfer?.files?.[0]);
        }}
        style={{
          marginTop: 10, minHeight: 240, borderRadius: 8, overflow: 'hidden',
          background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          outline: over ? `2px solid ${COLORS.accent}` : 'none', outlineOffset: -2,
        }}
      >
        {img ? (
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={pick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
            style={{
              width: '100%', minHeight: 240, cursor: 'pointer', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
              color: COLORS.textDim, fontSize: 13,
            }}
          >
            <strong style={{ color: COLORS.text, fontSize: 14 }}>Drop a photo here</strong>
            <span>or <u style={{ color: COLORS.accent }}>choose a file</u></span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 28, marginTop: 8, fontSize: 13 }}>
        {photo.error ? (
          <span style={{ color: COLORS.danger }}>{photo.error}</span>
        ) : img && (
          <>
            <span style={{
              flex: 'none', width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
              fontSize: 11, fontWeight: 700,
              color: n === 3 ? COLORS.text : COLORS.bg,
              background: n === 3 ? 'transparent' : (n === 2 ? MOUTH_COLOR : COLORS.accent),
              border: n === 3 ? `1.5px solid ${COLORS.border}` : 'none',
            }}>
              {n === 3 ? '✓' : n + 1}
            </span>
            <span>{n < 3 ? LANDMARK_PROMPTS[n] : 'All set. Drag any dot to fine-tune.'}</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <Button onClick={() => onPoints(() => [])} secondary disabled={!img || n === 0}>Redo points</Button>
        <Button onClick={pick} secondary>{img ? 'Replace photo' : 'Choose photo'}</Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          onFile(file);
        }}
      />
    </Card>
  );
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
function buildSlideOutline(rounds, tiebreakers = [], meta = DEFAULT_META, pastes = []) {
  const titleEdition = meta.title?.edition || DEFAULT_META.title.edition;
  const endLines = `${meta.end?.hero1 || ''} ${meta.end?.hero2 || ''}`.trim();
  const pictureRoundShown = meta.show?.pictureRound ?? true;
  const list = [
    { key: 'title', label: `Title — ${titleEdition}` },
    { key: 'rules', label: 'House Rules' },
  ];
  if (meta.show?.prize ?? true) {
    // Label derives from the editable prize copy so it can't drift from the
    // slide the way the old hardcoded "$100 Gift Card" label did.
    const prize = meta.prize || DEFAULT_META.prize;
    list.push({ key: 'prize', label: `${prize.heading} — ${prize.amount} ${prize.award}`.trim() });
  }
  if (meta.show?.costumeContest ?? true) {
    list.push({ key: 'costume', label: 'Costume Contest' });
  }
  if (pictureRoundShown) {
    list.push(
      { key: 'r1-open', label: `Round 1 Opener — ${meta.pictureRound?.openerTitle || DEFAULT_META.pictureRound.openerTitle}` },
      { key: 'r1-instr', label: 'Round 1 Instructions' },
    );
    // Mirrors App.jsx: the timed on-screen show only exists in screen/both mode.
    const pr = meta.pictureRound || DEFAULT_META.pictureRound;
    if (PICTURE_MODES.includes(pr.mode) && pr.mode !== 'paper') {
      const passes = pr.showPasses ?? DEFAULT_META.pictureRound.showPasses;
      list.push({
        key: 'r1-show',
        label: `Picture Show — ${pr.showSeconds ?? DEFAULT_META.pictureRound.showSeconds}s × ${passes} ${passes === 1 ? 'pass' : 'passes'}`,
      });
    }
    list.push({ key: 'int-r1', label: 'Intermission · Round 1 (collect sheets)' });
    // Mirrors App.jsx's answer walkthrough: two slides per slot that has a
    // picture (walkthroughSlots), the picture alone then the reveal. The
    // answer text is host-facing detail here; it never reaches step 1. Labels
    // say "Still" to match what the display shows.
    const slots = normalizePastes(pastes);
    walkthroughSlots(slots).forEach((slot) => {
      const n = String(slot + 1).padStart(2, '0');
      const answer = answerTextFor(slots[slot]);
      list.push(
        { key: `r1-ans-${slot + 1}-pic`, label: `Still ${n}` },
        { key: `r1-ans-${slot + 1}-reveal`, label: `Still ${n} · Answer`, detail: answer || '(no answer text)' },
      );
    });
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
  // Mirrors App.jsx: Join sits between End and Next Event.
  if (meta.show?.joinClub ?? true) {
    list.push({ key: 'join-club', label: `Join the Club — ${meta.joinClub?.url || 'QR code'}` });
  }
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
