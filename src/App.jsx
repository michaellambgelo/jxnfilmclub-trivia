import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACCENTS, TitleSlide, RulesSlide, PrizeSlide, CostumeContestSlide,
  RoundOpener, PictureRoundInstructions, IntermissionSlide, QuestionSlide,
  RoundRecap, PictureRoundRecap, TiebreakerIntroSlide, EndSlide, NextEventSlide,
} from './slides.jsx';
import { loadRounds, loadTiebreakers, recapSplitsFor, normalizeQuestion, displayRoundNumber } from './rounds.js';
import { loadPastes, mergeItems } from './pictures.js';
import { loadMeta, DEFAULT_META, sanitizeMeta } from './meta.js';
import { broadcast, useBroadcast } from './broadcast.js';

// ============================================================
// PER-ROUND ACCENT ROTATION
// ============================================================
// Theme hook: themed forks fill in `ROUND_ACCENTS` to give each question
// round its own accent color (Pokemon types, LOTR houses, MCU phases, etc.).
// Map round number `n` (matches `DEFAULT_ROUNDS[i].n`, starts at 2) to an
// ACCENTS key. Round 1 (picture round) + title/rules/prize/costume/end use
// the global DEFAULT_ACCENT. Intermissions preview the NEXT round's accent.
// Empty map (scaffold default) → no rotation; the global accent is used
// everywhere. Caution: hosts can add/remove rounds at runtime, which
// renumbers `n` — accentFor degrades to the global accent on any miss.
const ROUND_ACCENTS = {
  // 2: "accent-red",
  // 3: "accent-blue",
  // 4: "accent-green",
  // 5: "accent-gold",
};
// Global accent — themed forks set this to their signature ACCENTS key.
const DEFAULT_ACCENT = "accent-red";
function accentFor(n, global) {
  return ACCENTS[ROUND_ACCENTS[n]] || global;
}

// ============================================================
// APP
// ============================================================
function App() {
  const [rounds, setRounds] = useState(() => loadRounds());
  const [pastes, setPastes] = useState(() => loadPastes());
  const [tiebreakers, setTiebreakers] = useState(() => loadTiebreakers());
  const [meta, setMeta] = useState(() => loadMeta());
  const pictureItems = mergeItems(pastes);
  // Display tweaks now live in meta (meta.display); slides still take a `tweaks` prop.
  const tweaks = meta.display || DEFAULT_META.display;
  const accent = ACCENTS[DEFAULT_ACCENT];
  const stageRef = useRef(null);

  // Receive content + nav commands from the /control window.
  useBroadcast(useCallback((msg) => {
    const stage = stageRef.current;
    if (msg.type === 'rounds:update') setRounds(msg.payload);
    else if (msg.type === 'pictures:update') setPastes(msg.payload);
    else if (msg.type === 'tiebreakers:update') setTiebreakers(msg.payload);
    else if (msg.type === 'meta:update') {
      // Sanitize broadcast payloads exactly like loadMeta() sanitizes stored
      // ones. A control window opened before a deploy sends a meta shape
      // missing newer keys; unguarded, that blanks the whole deck mid-show.
      setMeta(sanitizeMeta(msg.payload));
    }
    else if (msg.type === 'nav:next') stage?.next();
    else if (msg.type === 'nav:prev') stage?.prev();
    else if (msg.type === 'nav:goto') stage?.goTo(msg.payload);
    else if (msg.type === 'sync:request' && stage) {
      const slide = stage.querySelector('section[data-deck-active]');
      broadcast('slidechange', describeSlide(stage, slide));
      // QuestionSlide responds with its own timer:state if it's the active slide.
    }
  }, []));

  // Forward slide changes to the /control window.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const handler = (e) => {
      broadcast('slidechange', describeSlide(stage, e.detail.slide, e.detail));
      // Clear timer state when leaving any non-question slide so control's
      // timer card shows OFF instead of stale numbers. Question slides
      // (regular rounds + tiebreakers) keep the timer; everything else clears.
      const label = e.detail.slide?.getAttribute('data-label') || '';
      if (!/^(R\d+ Q\d+|TIEBREAKER \d+)/.test(label)) {
        broadcast('timer:state', { enabled: false, seconds: 0, paused: false });
      }
    };
    stage.addEventListener('slidechange', handler);
    return () => stage.removeEventListener('slidechange', handler);
  }, []);

  const slides = [];

  // 1. Title
  slides.push(<TitleSlide key="title" tweaks={tweaks} accent={accent} title={meta.title} />);

  // 2. Rules
  slides.push(<RulesSlide key="rules" tweaks={tweaks} accent={accent} rules={meta.rules.items} />);

  // 3. Prize (toggleable)
  if (meta.show.prize) {
    slides.push(<PrizeSlide key="prize" tweaks={tweaks} accent={accent} prize={meta.prize} />);
  }

  // 4. Costume Contest (toggleable)
  if (meta.show.costumeContest) {
    slides.push(<CostumeContestSlide key="costume" tweaks={tweaks} accent={accent} costume={meta.costume.items} />);
  }

  // 5-8. Picture Round (toggleable as a unit: opener + instructions + intermission + recap)
  if (meta.show.pictureRound) {
    slides.push(
      <RoundOpener
        key="r1-open"
        label="05 Round 1 Opener"
        number={1}
        title={meta.pictureRound.openerTitle}
        subtitle={meta.pictureRound.openerSubtitle}
        kicker={meta.pictureRound.openerKicker}
        tweaks={tweaks} accent={accent}
      />
    );
    slides.push(
      <PictureRoundInstructions
        key="r1-instr"
        tweaks={tweaks}
        accent={accent}
        pictureRound={meta.pictureRound}
        nextRound={rounds[0] ? displayRoundNumber(rounds[0].n, true) : 2}
      />
    );
    slides.push(
      <IntermissionSlide key="int-r1" label="Intermission · Round 01"
        nextRound={rounds[0] ? displayRoundNumber(rounds[0].n, true) : undefined}
        nextTitle={rounds[0]?.title}
        nextLabel={rounds[0] ? undefined : "Final Tally · Winners Revealed"}
        tweaks={tweaks} accent={rounds[0] ? accentFor(rounds[0].n, accent) : accent}
      />
    );
    slides.push(
      <PictureRoundRecap
        key="r1-recap"
        items={pictureItems}
        tweaks={tweaks}
        accent={accent}
        pictureRound={meta.pictureRound}
      />
    );
  }

  // Rounds 2-5 — each round picks up its own accent from ROUND_ACCENTS
  // (empty map = degrade to the global accent).
  rounds.forEach((r, idx) => {
    const roundAccent = accentFor(r.n, accent);
    const displayN = displayRoundNumber(r.n, meta.show.pictureRound);
    slides.push(
      <RoundOpener
        key={`r${r.n}-open`}
        label={`Round ${String(displayN).padStart(2, '0')} Opener`}
        number={displayN}
        title={r.title}
        subtitle={r.subtitle}
        kicker={r.kicker}
        tweaks={tweaks} accent={roundAccent}
      />
    );

    r.questions.forEach((q, qi) => {
      const data = normalizeQuestion(q);
      slides.push(
        <QuestionSlide
          key={`r${r.n}-q${qi + 1}`}
          round={displayN}
          q={qi + 1}
          total={r.questions.length}
          prompt={data.prompt}
          answer={data.answer}
          audioUrl={data.audioUrl}
          imageUrl={data.imageUrl}
          videoUrl={data.videoUrl}
          displayHint={data.displayHint}
          roundTitle={r.title}
          tweaks={tweaks}
          accent={roundAccent}
        />
      );
    });

    // Intermission BEFORE recap so teams hand in sheets before answers are
    // revealed. R2-R4 tease the next round; R5 has no next round, so it teases
    // the final tally instead. Intermission previews the NEXT round's accent.
    const next = rounds[idx + 1];
    const intermissionAccent = next ? accentFor(next.n, accent) : roundAccent;
    const nextDisplayN = next ? displayRoundNumber(next.n, meta.show.pictureRound) : undefined;
    slides.push(
      <IntermissionSlide
        key={`int-r${r.n}`}
        label={`Intermission · Round ${String(displayN).padStart(2, '0')}`}
        nextRound={nextDisplayN}
        nextTitle={next?.title}
        nextLabel={next ? undefined : "Final Tally · Winners Revealed"}
        tweaks={tweaks}
        accent={intermissionAccent}
      />
    );

    // Recap slides per round. Most rounds split 5+5; round 5's prompts run
    // long enough that 5-per-slide gets cramped, so it splits 3+3+4.
    const recapSplits = recapSplitsFor(r);
    recapSplits.forEach(([start, end], i) => {
      slides.push(
        <RoundRecap
          key={`r${r.n}-recap-${String.fromCharCode(97 + i)}`}
          round={displayN}
          roundTitle={r.title}
          questions={r.questions.slice(start, end).map((q) => normalizeQuestion(q).prompt)}
          startIndex={start}
          part={String.fromCharCode(65 + i)}
          tweaks={tweaks}
          accent={roundAccent}
        />
      );
    });
  });

  // End — normal sequential close. Tiebreakers live past this slide, only
  // reached by hitting Next when there's an actual tie at the end of play.
  slides.push(<EndSlide key="end" tweaks={tweaks} accent={accent} end={meta.end} />);

  // Next-event announcement — the natural end-of-night path flows
  // Thanks → Next Event; tiebreakers stay parked past it as the
  // only-if-tied overflow.
  if (meta.show.nextEvent) {
    slides.push(<NextEventSlide key="next-event" tweaks={tweaks} accent={accent} nextEvent={meta.nextEvent} />);
  }

  // Tiebreakers — Final Wager (Final Jeopardy style) after the End slide.
  // Skip past these unless teams are tied; advance into them only when needed.
  if (meta.show.tiebreakers) {
    slides.push(<TiebreakerIntroSlide key="tb-intro" tweaks={tweaks} accent={accent} wager={meta.wager.items} />);
    tiebreakers.forEach((q, i) => {
      const data = normalizeQuestion(q);
      slides.push(
        <QuestionSlide
          key={`tb-q${i + 1}`}
          kind="tiebreaker"
          round={rounds[rounds.length - 1]?.n ?? 5}
          q={i + 1}
          total={tiebreakers.length}
          prompt={data.prompt}
          answer={data.answer}
          audioUrl={data.audioUrl}
          imageUrl={data.imageUrl}
          videoUrl={data.videoUrl}
          displayHint={data.displayHint}
          roundTitle="Final Wager"
          tweaks={tweaks}
          accent={accent}
        />
      );
    });
  }

  return (
    <>
      <deck-stage ref={stageRef} width="1920" height="1080">
        {slides}
      </deck-stage>
    </>
  );
}

function describeSlide(stage, slide, detail) {
  const total = detail?.total ?? stage.length;
  const index = detail?.index ?? stage.index;
  const label = slide?.getAttribute('data-label') || `Slide ${index + 1}`;
  return { index, total, label };
}

export default App;
