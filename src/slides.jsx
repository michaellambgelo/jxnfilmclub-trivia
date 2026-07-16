import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { broadcast, useBroadcast } from './broadcast.js';
import { resolveAspect, pictureGridLayout } from './pictures.js';

// ============================================================
// DESIGN SYSTEM — Theme-neutral scaffold; clone via /new-pub-trivia-deck and override PALETTE
// Pulp-poster look: flat solid surfaces, hard offset shadows (no glows),
// an inset border frame on every slide, and red-background feature slides
// (Prize, Round Openers, Intermissions).
// ============================================================
const TYPE_SCALE = {
  display: 132,   // hero lines (Alfa Slab One)
  title: 92,      // section / round titles
  subtitle: 48,   // rule titles, secondary headers
  body: 30,       // body copy
  meta: 30,       // labels, eyebrows
  small: 26,      // captions, footers
};

const SPACING = {
  paddingTop: 100,
  paddingBottom: 96,
  paddingX: 120,
  titleGap: 48,
  itemGap: 28,
};

const ACCENTS = {
  "accent-blue":  { hex: "#5B8DD9", glow: "rgba(91, 141, 217, 0.32)", name: "BLUE" },
  "accent-green": { hex: "#4E9A6A", glow: "rgba(78, 154, 106, 0.32)", name: "GREEN" },
  "accent-red":   { hex: "#C8201E", glow: "rgba(200, 32, 30, 0.35)", name: "RED" },
  "accent-gold":  { hex: "#E2A828", glow: "rgba(226, 168, 40, 0.32)", name: "GOLD" },
};

// ⚠️ PALETTE naming convention: `ink` is "the slide background color" and
// `paper` is "the primary text color" — they are NOT semantic indicators
// of light vs dark. The scaffold has shipped light-bg/dark-text and
// dark-bg/light-text (current: navy bg / cream text) using the same key
// names. Themed forks invert the VALUES but keep the KEYS.
// `inkDeep` is the near-black outline + hard-shadow token (pulp-poster
// borders and offset shadows); `rust` is the structural red (rule bars,
// red-background slides, chips); `rustDeep` is the darker red used for the
// question-number offset shadow; `gold` is the highlight (the scaffold's
// DEFAULT_ACCENT points at the matching ACCENTS entry).
// Inline alpha-hex (e.g. `${PALETTE.paper}47` for ~28% alpha) is used
// throughout for translucent frames, hairlines, and dimmed text. Prefer
// alpha-hex on a PALETTE token over literal `rgba(...)` so palette swaps
// in themed forks track automatically.
const PALETTE = {
  ink: "#1A2A4A",            // slide background (navy)
  inkDeep: "#1A1410",        // outline + hard-shadow near-black
  paper: "#F2E8CF",          // primary text color (cream)
  paperDim: "#F2E8CF99",     // secondary/muted text (cream @ 60%)
  rust: "#C8201E",           // structural red
  rustDeep: "#9A1716",       // question-number shadow red
  gold: "#E2A828",           // highlight gold
};

// ============================================================
// SHARED STYLE OBJECTS
// ============================================================
const displayFont = "'Oswald', 'Bebas Neue', Impact, sans-serif";
const heroFont = "'Alfa Slab One', 'Oswald', Georgia, serif";
const bodyFont = "'Work Sans', system-ui, sans-serif";

// Hard offset shadow — the pulp-poster signature. Use for text-shadow and
// (via the same string) box-shadow.
const hardShadow = (px, color = PALETTE.inkDeep) => `${px}px ${px}px 0 ${color}`;

const slideBase = {
  width: "100%",
  height: "100%",
  position: "relative",
  overflow: "hidden",
  fontFamily: bodyFont,
  color: PALETTE.paper,
  background: PALETTE.ink,
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
};

// Slide surface with the red-background variant used by Prize, Round
// Openers, and Intermissions. `variant` also drives Frame/FooterBar alphas.
const slideSurface = (variant = "navy") => ({
  ...slideBase,
  background: variant === "red" ? PALETTE.rust : PALETTE.ink,
});

// ============================================================
// REUSABLE BITS
// ============================================================
function Frame({ variant = "navy" }) {
  // Inset border frame drawn on every slide. Red slides get a stronger
  // alpha so the frame stays visible against the saturated background.
  return (
    <div style={{
      position: "absolute", inset: 34,
      border: `2px solid ${PALETTE.paper}${variant === "red" ? "52" : "29"}`,
      pointerEvents: "none",
    }} />
  );
}

function FooterBar({ left, right, variant = "navy", accentHex }) {
  const isRed = variant === "red";
  return (
    <div style={{
      position: "absolute", left: SPACING.paddingX, right: SPACING.paddingX, bottom: 46,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      fontFamily: displayFont, fontWeight: 600, letterSpacing: "0.28em",
      fontSize: TYPE_SCALE.small, textTransform: "uppercase",
      color: `${PALETTE.paper}${isRed ? "D9" : "99"}`,
    }}>
      <span>{left}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{
          width: 12, height: 12, borderRadius: 999,
          background: isRed ? PALETTE.ink : (accentHex || PALETTE.gold),
        }} />
        {right}
      </span>
    </div>
  );
}

function Eyebrow({ children, accentHex }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 16,
      fontFamily: displayFont, fontWeight: 600, fontSize: TYPE_SCALE.meta,
      letterSpacing: "0.24em", textTransform: "uppercase", color: accentHex,
    }}>
      <span style={{ display: "inline-block", width: 52, height: 4, background: accentHex }} />
      {children}
    </div>
  );
}

// Red rule bar under section titles. RuleGrid adds a thin echo line below.
function RuleBar({ echo = false }) {
  return (
    <div style={{ position: "relative", width: 200, height: 6, background: PALETTE.rust, marginTop: 20 }}>
      {echo && (
        <span style={{ position: "absolute", left: 0, right: 0, top: 11, height: 2, background: PALETTE.rust }} />
      )}
    </div>
  );
}

function AccentBar({ accentHex = PALETTE.rust, lineColor = `${PALETTE.paper}66`, lineWidth = 180 }) {
  // Diamond divider — two flat lines flanking a rotated square with the
  // pulp outline. Theme-neutral by default; themes that want a hilt, sword
  // silhouette, wand, or other ornament should swap this component or
  // extend it via props.
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <span style={{ width: lineWidth, height: 3, background: lineColor }} />
      <span style={{
        width: 18, height: 18, background: accentHex,
        transform: "rotate(45deg)", border: `2px solid ${PALETTE.inkDeep}`,
        flex: "0 0 auto",
      }} />
      <span style={{ width: lineWidth, height: 3, background: lineColor }} />
    </div>
  );
}

// Venue logo mark. Ships with the FGBC red logo in public/; themed forks
// replace the PNG (or delete it — onError hides the img cleanly, so the
// slide simply renders without a mark).
const LOGO_SRC = `${import.meta.env.BASE_URL}logo-fgbc-red.png`;

function Logo({ size = 150, style }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={LOGO_SRC}
      alt="Fertile Ground Beer Co"
      onError={() => setFailed(true)}
      style={{ height: size, width: "auto", ...style }}
    />
  );
}

// Shared 2×2 rule-grid layout used by RulesSlide, CostumeContestSlide, and
// TiebreakerIntroSlide. Copy stays in each slide (theme anchors); this owns
// the layout only.
function RuleGrid({ label, eyebrow, title, rules, footerLeft, footerRight, accent }) {
  return (
    <section data-label={label}>
      <div style={slideBase}>
        <Frame />
        <div style={{
          padding: `${SPACING.paddingTop}px ${SPACING.paddingX}px ${SPACING.paddingBottom}px`,
          height: "100%", display: "flex", flexDirection: "column",
        }}>
          <Eyebrow accentHex={accent.hex}>{eyebrow}</Eyebrow>
          <div style={{
            fontFamily: displayFont, fontWeight: 700, fontSize: TYPE_SCALE.title,
            letterSpacing: "0.03em", textTransform: "uppercase", marginTop: 20,
            color: PALETTE.paper,
          }}>
            {title}
          </div>
          <RuleBar echo />

          <div style={{
            marginTop: 60, flex: 1, display: "grid",
            gridTemplateColumns: "1fr 1fr", gap: "48px 84px",
          }}>
            {rules.map((r) => (
              <div key={r.n} style={{ display: "flex", gap: 30, alignItems: "flex-start" }}>
                <div style={{
                  fontFamily: displayFont, fontWeight: 700, fontSize: 82, lineHeight: 0.9,
                  color: accent.hex, minWidth: 100,
                  textShadow: hardShadow(5),
                }}>
                  {r.n}
                </div>
                <div>
                  <div style={{
                    fontFamily: displayFont, fontWeight: 600, fontSize: TYPE_SCALE.subtitle,
                    letterSpacing: "0.02em", textTransform: "uppercase",
                    color: PALETTE.paper, marginBottom: 12,
                  }}>
                    {r.t}
                  </div>
                  <div style={{
                    fontFamily: bodyFont, fontWeight: 400,
                    fontSize: TYPE_SCALE.body, lineHeight: 1.4, color: `${PALETTE.paper}AD`,
                    maxWidth: 560,
                  }}>
                    {r.d}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <FooterBar left={footerLeft} right={footerRight} accentHex={accent.hex} />
      </div>
    </section>
  );
}

// ============================================================
// SLIDE: TITLE
// ============================================================
function TitleSlide({ accent, title }) {
  const t = title || {};
  return (
    <section data-label="01 Title">
      <div style={slideBase}>
        <Frame />

        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
          padding: `96px ${SPACING.paddingX}px ${SPACING.paddingX}px`,
          textAlign: "center",
        }}>
          <Logo size={150} style={{ marginBottom: 44 }} />

          {t.eyebrow && (
            <div style={{
              fontFamily: displayFont, fontWeight: 600, fontSize: TYPE_SCALE.meta,
              letterSpacing: "0.26em", textTransform: "uppercase", color: accent.hex,
              whiteSpace: "nowrap",
            }}>
              {t.eyebrow}
            </div>
          )}

          {t.hero && (
            <div style={{
              fontFamily: displayFont, fontWeight: 600, color: PALETTE.paper,
              fontSize: 44, letterSpacing: "0.18em", textTransform: "uppercase",
              marginTop: 30,
            }}>
              {t.hero}
            </div>
          )}

          {t.edition && (
            <div style={{
              fontFamily: heroFont, fontSize: TYPE_SCALE.display, lineHeight: 0.94,
              letterSpacing: "-0.01em", textTransform: "uppercase", color: PALETTE.paper,
              margin: "34px 0 10px",
            }}>
              {t.edition}
            </div>
          )}
          {t.tagline && (
            <div style={{
              fontFamily: displayFont, fontWeight: 600, fontSize: 64, lineHeight: 1,
              letterSpacing: "0.34em", textTransform: "uppercase", color: accent.hex,
              whiteSpace: "nowrap",
            }}>
              {t.tagline}
            </div>
          )}

          <div style={{ margin: "56px 0 40px" }}>
            <AccentBar accentHex={PALETTE.rust} />
          </div>

          {t.hosts && (
            <div style={{
              display: "flex", alignItems: "center", gap: 20, whiteSpace: "nowrap",
              fontFamily: displayFont, fontWeight: 500, fontSize: 32, letterSpacing: "0.16em",
              textTransform: "uppercase", color: `${PALETTE.paper}99`,
            }}>
              <span>Hosted by</span>
              <span style={{ flex: "0 0 auto", width: 10, height: 10, background: accent.hex, borderRadius: 999 }} />
              <span style={{ color: PALETTE.paper, fontWeight: 600 }}>{t.hosts}</span>
            </div>
          )}
        </div>

        <FooterBar
          left="Fertile Ground"
          right={t.footerDate || ""}
          accentHex={accent.hex}
        />
      </div>
    </section>
  );
}

// ============================================================
// SLIDE: RULES
// ============================================================
function RulesSlide({ accent }) {
  const rules = [
    { n: "I",   t: "No phones",                 d: "Looking up answers will result in points being deducted at the hosts' discretion." },
    { n: "II",  t: "Spelling is best attempt",  d: "Misspellings are fine as long as the answer is unambiguous and correct." },
    { n: "III", t: "Hosts are final",           d: "The hosts have the last word on every ruling. No appeals." },
    { n: "IV",  t: "Have fun",                  d: "Lean in, get into it, and don't take any single question too seriously." },
  ];
  return (
    <RuleGrid
      label="02 Rules"
      eyebrow="Section I"
      title="House Rules"
      rules={rules}
      footerLeft="House Rules"
      footerRight="Read Before Play"
      accent={accent}
    />
  );
}

// ============================================================
// SLIDE: PRIZE
// ============================================================
function PrizeSlide() {
  return (
    <section data-label="03 Grand Prize">
      <div style={slideSurface("red")}>
        <Frame variant="red" />

        <div style={{
          padding: `${SPACING.paddingTop}px ${SPACING.paddingX}px ${SPACING.paddingTop}px`,
          height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
          alignItems: "center", textAlign: "center",
        }}>
          <div style={{
            fontFamily: displayFont, fontWeight: 600, fontSize: TYPE_SCALE.meta,
            letterSpacing: "0.26em", textTransform: "uppercase", color: PALETTE.paper,
          }}>
            Tonight's Bounty
          </div>

          <div style={{
            fontFamily: displayFont, fontWeight: 700, fontSize: 88,
            letterSpacing: "0.03em", textTransform: "uppercase",
            color: PALETTE.paper, marginTop: 22,
          }}>
            Grand Prize
          </div>

          <div style={{
            position: "relative", marginTop: 54,
            background: PALETTE.paper,
            border: `3px solid ${PALETTE.inkDeep}`,
            boxShadow: hardShadow(10),
            padding: "58px 96px",
          }}>
            <div style={{
              position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)",
              background: PALETTE.ink, color: PALETTE.paper,
              border: `2px solid ${PALETTE.inkDeep}`,
              padding: "8px 22px",
              fontFamily: displayFont, fontWeight: 700, fontSize: 24, letterSpacing: "0.2em",
              textTransform: "uppercase", whiteSpace: "nowrap",
            }}>
              ★ WINNER TAKES ALL ★
            </div>

            <div style={{
              fontFamily: heroFont, fontSize: 220, lineHeight: 1,
              color: PALETTE.ink,
            }}>
              $100
            </div>
            <div style={{
              fontFamily: displayFont, fontWeight: 700, fontSize: 44,
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: PALETTE.rust, marginTop: 12,
            }}>
              FERTILE GROUND GIFT CARD
            </div>
          </div>

          <div style={{
            marginTop: 46, fontFamily: bodyFont, fontStyle: "italic",
            fontSize: 34, color: `${PALETTE.paper}D9`, maxWidth: 900,
          }}>
            More than enough to cover your tab tonight.
          </div>
        </div>

        <FooterBar left="Grand Prize" right="One Winning Team" variant="red" />
      </div>
    </section>
  );
}

// ============================================================
// SLIDE: COSTUME CONTEST
// ============================================================
function CostumeContestSlide({ accent }) {
  const rules = [
    { n: "I",   t: "Open to All Guests",    d: "Any guest can enter — you don't need to be on a trivia team to win." },
    { n: "II",  t: "On-Theme Costumes",     d: "Costumes must fit tonight's theme. Original concepts welcome if the connection is clear." },
    { n: "III", t: "Hosts Decide",          d: "The hosts will pick Best Overall. No appeals." },
    { n: "IV",  t: "Individual Prize",      d: "One winner takes home a package beer as a side prize." },
  ];
  return (
    <RuleGrid
      label="04 Costume Contest"
      eyebrow="Bonus Challenge"
      title="Costume Contest"
      rules={rules}
      footerLeft="Costume Contest"
      footerRight="Enter anytime at the host's table."
      accent={accent}
    />
  );
}

// ============================================================
// SLIDE: ROUND OPENER (large numeral, red surface)
// ============================================================
function RoundOpener({ number, title, subtitle, kicker, label }) {
  return (
    <section data-label={label}>
      <div style={slideSurface("red")}>
        <Frame variant="red" />

        <div style={{
          padding: `${SPACING.paddingTop}px ${SPACING.paddingX}px ${SPACING.paddingTop}px`,
          height: "100%", display: "flex", alignItems: "center", gap: 72,
        }}>
          {/* Massive numeral */}
          <div style={{
            flex: "0 0 auto",
            fontFamily: displayFont, fontWeight: 700, fontSize: 560, lineHeight: 0.78,
            color: PALETTE.paper, letterSpacing: "-0.03em",
            textShadow: hardShadow(14),
          }}>
            {String(number).padStart(2, "0")}
          </div>

          {/* Right text block */}
          <div style={{ flex: 1, borderLeft: `5px solid ${PALETTE.paper}`, paddingLeft: 56 }}>
            <div style={{
              fontFamily: displayFont, fontWeight: 600, fontSize: 32,
              letterSpacing: "0.38em", textTransform: "uppercase",
              color: PALETTE.paper, marginBottom: 26,
            }}>
              ROUND
            </div>
            <div style={{
              fontFamily: displayFont, fontWeight: 700, fontSize: 96,
              color: PALETTE.paper, letterSpacing: "0.02em", lineHeight: 1.0,
              textTransform: "uppercase",
            }}>
              {title}
            </div>
            {subtitle && (
              <div style={{
                fontFamily: bodyFont, fontWeight: 400,
                fontSize: 40, color: `${PALETTE.paper}D9`, marginTop: 30,
                lineHeight: 1.35, maxWidth: 760,
              }}>
                {subtitle}
              </div>
            )}
            {kicker && (
              <div style={{
                marginTop: 48, display: "inline-block",
                background: PALETTE.ink, color: PALETTE.paper,
                border: `2px solid ${PALETTE.inkDeep}`,
                boxShadow: hardShadow(6),
                padding: "14px 28px",
                fontFamily: displayFont, fontWeight: 700, fontSize: 28,
                letterSpacing: "0.16em", textTransform: "uppercase",
              }}>
                {kicker}
              </div>
            )}
          </div>
        </div>

        <FooterBar left={`Round ${String(number).padStart(2, "0")}`} right={title} variant="red" />
      </div>
    </section>
  );
}

// ============================================================
// SLIDE: ROUND 1 PICTURE-ROUND INSTRUCTIONS
// ============================================================
function PictureRoundInstructions({ accent }) {
  const steps = [
    { n: "01", t: "Form your team",   d: "Gather your group and pick a team name. Pun-heavy or theme-on-theme is encouraged." },
    { n: "02", t: "Collect your sheet", d: "One Round 1 picture sheet per team. Grab one from Jack or Michael at the host stand." },
    { n: "03", t: "Identify the images", d: "Write your answer in the space provided next to each numbered image." },
    { n: "04", t: "Return your answers", d: "Hand the sheet back to the hosts before Round 2 begins." },
  ];
  return (
    <section data-label="05 Round 1 Instructions">
      <div style={slideBase}>
        <Frame />

        <div style={{
          padding: `${SPACING.paddingTop}px ${SPACING.paddingX}px ${SPACING.paddingBottom}px`,
          height: "100%", display: "flex", flexDirection: "column",
        }}>
          <Eyebrow accentHex={accent.hex}>Round 01 · Picture Round</Eyebrow>

          <div style={{
            fontFamily: displayFont, fontWeight: 700, fontSize: 84,
            letterSpacing: "0.03em", textTransform: "uppercase",
            color: PALETTE.paper, marginTop: 20, lineHeight: 1.0,
          }}>
            On Paper, Not on Screen
          </div>
          <div style={{
            fontFamily: bodyFont, fontSize: 34,
            color: `${PALETTE.paper}B3`, marginTop: 24, maxWidth: 1200, lineHeight: 1.35,
          }}>
            This round is played from a paper sheet handed out by the hosts. Identify each image and write your answer in the space provided.
          </div>

          <div style={{
            marginTop: 50, flex: 1, display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)", gap: 26,
          }}>
            {steps.map((s) => (
              <div key={s.n} style={{
                border: `2px solid ${PALETTE.paper}47`,
                background: `${PALETTE.paper}0A`,
                padding: "32px 28px", display: "flex", flexDirection: "column",
              }}>
                <div style={{
                  fontFamily: displayFont, fontWeight: 700, fontSize: 52,
                  color: accent.hex,
                }}>
                  {s.n}
                </div>
                <div style={{ height: 3, width: 56, background: PALETTE.rust, margin: "16px 0 22px" }} />
                <div style={{
                  fontFamily: displayFont, fontWeight: 600, fontSize: 34,
                  textTransform: "uppercase", color: PALETTE.paper, marginBottom: 14,
                }}>
                  {s.t}
                </div>
                <div style={{
                  fontFamily: bodyFont, fontSize: 28,
                  color: `${PALETTE.paper}A8`, lineHeight: 1.4,
                }}>
                  {s.d}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 34, padding: "24px 32px",
            background: PALETTE.rust, border: `2px solid ${PALETTE.inkDeep}`,
            display: "flex", alignItems: "center", gap: 26,
          }}>
            <div style={{
              fontFamily: displayFont, fontWeight: 700, fontSize: TYPE_SCALE.meta,
              letterSpacing: "0.32em", textTransform: "uppercase", color: PALETTE.paper,
            }}>
              REMINDER
            </div>
            <div style={{
              fontFamily: bodyFont, fontSize: TYPE_SCALE.body, color: PALETTE.paper,
            }}>
              No phones. Spelling is best attempt — just make sure we can tell who you mean.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// SLIDE: QUESTION
// ============================================================
function QuestionSlide({
  round, q, total, prompt, roundTitle, tweaks, accent, kind = "round",
  // Normalized question media slots. `answer` is intentionally NOT rendered on
  // display — it's spread in for prop-spreading convenience and used only by
  // the control window for host adjudication.
  // eslint-disable-next-line no-unused-vars
  answer, audioUrl, imageUrl, videoUrl, displayHint,
}) {
  const isTiebreaker = kind === "tiebreaker";
  const [seconds, setSeconds] = useState(tweaks.timerSeconds || 60);
  const [paused, setPaused] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const ref = useRef(null);

  // Track whether this slide is the active one in <deck-stage>.
  // deck-stage sets data-deck-active on the active <section> and dispatches a
  // bubbling, composed `slidechange` event we can listen for on document.
  useEffect(() => {
    const mySection = ref.current?.closest('section');
    if (!mySection) return;
    setIsActive(mySection.hasAttribute('data-deck-active'));
    const handler = (e) => setIsActive(e.detail.slide === mySection);
    document.addEventListener('slidechange', handler);
    return () => document.removeEventListener('slidechange', handler);
  }, []);

  // Reset state AND broadcast the fresh value in one effect on activation.
  // The broadcast must use `fresh` directly rather than reading `seconds` from
  // a separate effect — `seconds` may still hold a stale value from this
  // slide's previous mount until the next render lands, which would briefly
  // leak that stale value to the control window.
  useEffect(() => {
    if (!isActive) return;
    const fresh = tweaks.timerSeconds || 60;
    setSeconds(fresh);
    setPaused(false);
    broadcast('timer:state', { enabled: !!tweaks.showTimer, seconds: fresh, paused: false });
  }, [isActive, tweaks.timerSeconds, tweaks.showTimer]);

  // Tick down once per second while active, enabled, not paused, and > 0.
  useEffect(() => {
    if (!tweaks.showTimer || !isActive || paused || seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [tweaks.showTimer, isActive, paused, seconds]);

  // Respond to control-window commands (only the active slide acts).
  useBroadcast(useCallback((msg) => {
    if (!isActive) return;
    if (msg.type === 'timer:toggle') setPaused((p) => !p);
    else if (msg.type === 'timer:reset') {
      setSeconds(tweaks.timerSeconds || 60);
      setPaused(false);
    } else if (msg.type === 'timer:adjust') {
      setSeconds((s) => Math.max(0, s + msg.payload));
    } else if (msg.type === 'sync:request') {
      broadcast('timer:state', { enabled: !!tweaks.showTimer, seconds, paused });
    }
  }, [isActive, tweaks.timerSeconds, tweaks.showTimer, seconds, paused]));

  // Push tick / pause changes to the control window. isActive deliberately
  // omitted from deps — the activation broadcast lives in the reset effect
  // above (which sends the fresh value); duplicating it here would re-broadcast
  // stale `seconds` and reintroduce the flicker.
  useEffect(() => {
    if (!isActive) return;
    broadcast('timer:state', { enabled: !!tweaks.showTimer, seconds, paused });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, paused, tweaks.showTimer]);

  const dataLabel = isTiebreaker
    ? `TIEBREAKER ${String(q).padStart(2, "0")}`
    : `R${round} Q${String(q).padStart(2, "0")}`;

  return (
    <section data-label={dataLabel}>
      <div style={slideBase} ref={ref}>
        <Frame />

        <div style={{
          padding: `${SPACING.paddingTop}px ${SPACING.paddingX}px 92px`,
          height: "100%", display: "flex", flexDirection: "column",
        }}>
          {/* Header strip */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            paddingBottom: 26, borderBottom: `2px solid ${PALETTE.paper}38`,
          }}>
            {tweaks.showQNumbers ? (
              <div style={{
                fontFamily: displayFont, fontWeight: 600, fontSize: TYPE_SCALE.meta,
                letterSpacing: "0.28em", textTransform: "uppercase", color: accent.hex,
              }}>
                {isTiebreaker ? "TIEBREAKER" : `ROUND ${String(round).padStart(2, "0")}`}
                <span style={{ color: `${PALETTE.paper}99`, margin: "0 18px" }}>·</span>
                QUESTION {String(q).padStart(2, "0")}
                <span style={{ color: `${PALETTE.paper}99`, margin: "0 18px" }}>·</span>
                <span style={{ color: `${PALETTE.paper}99` }}>OF {String(total).padStart(2, "0")}</span>
              </div>
            ) : (
              <div style={{
                fontFamily: displayFont, fontWeight: 600, fontSize: TYPE_SCALE.meta,
                letterSpacing: "0.28em", textTransform: "uppercase", color: accent.hex,
              }}>
                {roundTitle}
              </div>
            )}
            {!tweaks.showTimer && (
              <div style={{
                fontFamily: displayFont, fontWeight: 600, fontSize: TYPE_SCALE.meta,
                letterSpacing: "0.28em", textTransform: "uppercase", color: `${PALETTE.paper}99`,
              }}>
                {roundTitle}
              </div>
            )}
          </div>

          {/* Big numeral + prompt */}
          <div style={{
            flex: 1, display: "flex", alignItems: "center", gap: 72, marginTop: 20,
          }}>
            <div style={{
              flex: "0 0 auto",
              fontFamily: displayFont, fontWeight: 700, fontSize: 420, lineHeight: 0.8,
              color: PALETTE.paper, letterSpacing: "-0.03em",
              textShadow: hardShadow(12, PALETTE.rustDeep),
            }}>
              {String(q).padStart(2, "0")}
            </div>

            <div style={{ flex: 1, paddingLeft: 56, borderLeft: `5px solid ${PALETTE.rust}` }}>
              <div style={{
                fontFamily: displayFont, fontWeight: 600, fontSize: TYPE_SCALE.meta,
                letterSpacing: "0.34em", textTransform: "uppercase",
                color: accent.hex, marginBottom: 26,
              }}>
                QUESTION
              </div>
              <div style={{
                fontFamily: bodyFont, fontWeight: 500,
                fontSize: 60, lineHeight: 1.2, color: PALETTE.paper,
                textWrap: "pretty",
              }}>
                {prompt}
              </div>
              {displayHint && (
                <div style={{
                  marginTop: 18, fontFamily: bodyFont,
                  fontStyle: "italic", fontSize: TYPE_SCALE.body,
                  color: `${PALETTE.paper}B3`, lineHeight: 1.3,
                }}>
                  {displayHint}
                </div>
              )}
              {imageUrl && (
                <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-start" }}>
                  <img
                    src={imageUrl}
                    alt="Question media"
                    style={{
                      maxWidth: "100%", maxHeight: 360, objectFit: "contain",
                      border: `2px solid ${PALETTE.inkDeep}`,
                      boxShadow: hardShadow(8),
                    }}
                  />
                </div>
              )}
              {audioUrl && (
                <audio
                  src={audioUrl}
                  controls
                  preload="auto"
                  style={{ marginTop: 24, width: "100%", maxWidth: 720 }}
                />
              )}
              {videoUrl && (
                <video
                  src={videoUrl}
                  controls
                  preload="auto"
                  style={{
                    marginTop: 24, maxWidth: "100%", maxHeight: 360,
                    border: `2px solid ${PALETTE.inkDeep}`,
                    boxShadow: hardShadow(8),
                  }}
                />
              )}
            </div>
          </div>

          {/* Timer overlay when on */}
          {tweaks.showTimer && (
            <div style={{
              position: "absolute", right: SPACING.paddingX, top: 120,
              fontFamily: displayFont, fontWeight: 700, fontSize: 80,
              color: accent.hex, letterSpacing: "0.02em",
              textShadow: hardShadow(5),
            }}>
              {seconds}s
            </div>
          )}
        </div>

        <FooterBar
          left={isTiebreaker ? "Final Wager" : `Round ${String(round).padStart(2, "0")}`}
          right={isTiebreaker
            ? `Tiebreaker ${String(q).padStart(2, "0")} / ${String(total).padStart(2, "0")}`
            : `Question ${String(q).padStart(2, "0")} / ${String(total).padStart(2, "0")}`}
          accentHex={accent.hex}
        />
      </div>
    </section>
  );
}

// Shrink a container's contents to fit its height. Only shrinks (scale caps at
// 1), so short recaps render unchanged. Mirrors pictureGridLayout's budget-aware
// sizing, but text wrapping makes shrink non-linear, so it iterates. Scale rides
// a CSS var so the measure loop can force synchronous reflow and converge in one
// pass. Re-fits on content change, container resize, and web-font load (metrics
// change once Oswald / Work Sans arrive).
function useShrinkToFit(deps) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const MIN = 0.6;
    const fit = () => {
      el.style.setProperty('--fit-scale', '1');
      const budget = el.clientHeight;
      if (!budget) return;
      let s = 1;
      for (let i = 0; i < 24 && el.scrollHeight > budget + 1 && s > MIN; i++) {
        s = Math.max(MIN, s * Math.min(0.99, budget / el.scrollHeight));
        el.style.setProperty('--fit-scale', String(s)); // reading scrollHeight next iter forces reflow
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    let alive = true;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) fit(); });
    return () => { alive = false; ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

// ============================================================
// SLIDE: ROUND RECAP — single column of 5 questions
// One round produces two of these slides (questions 1–5, then 6–10) so
// each prompt can wrap fully without being truncated. When prompts run long
// enough to overflow the vertical budget, useShrinkToFit scales the questions
// (via --fit-scale) so they fit instead of clipping.
// ============================================================
function RoundRecap({ round, roundTitle, questions, accent, startIndex = 0, part = "A" }) {
  const fitRef = useShrinkToFit([questions.join('\n')]);
  const start = startIndex + 1;
  const end = startIndex + questions.length;
  return (
    <section data-label={`R${round} Recap ${part}`}>
      <div style={slideBase}>
        <Frame />

        <div style={{
          padding: `96px ${SPACING.paddingX}px 92px`,
          height: "100%", display: "flex", flexDirection: "column",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <Eyebrow accentHex={accent.hex}>End of Round {String(round).padStart(2, "0")}</Eyebrow>
              <div style={{
                fontFamily: displayFont, fontWeight: 700, fontSize: 76,
                color: PALETTE.paper, letterSpacing: "0.02em", marginTop: 18,
                textTransform: "uppercase",
              }}>
                Recap · {roundTitle}
              </div>
            </div>
            <div style={{
              fontFamily: displayFont, fontWeight: 600, fontSize: TYPE_SCALE.meta,
              letterSpacing: "0.3em", textTransform: "uppercase", color: `${PALETTE.paper}99`,
            }}>
              QUESTIONS {String(start).padStart(2, "0")}–{String(end).padStart(2, "0")}
            </div>
          </div>

          <RuleBar />

          <div ref={fitRef} style={{
            "--fit-scale": 1,
            marginTop: 24, flex: 1, display: "flex", flexDirection: "column",
            justifyContent: "center", gap: "calc(14px * var(--fit-scale, 1))", overflow: "hidden",
          }}>
            {questions.map((q, i) => (
              <div key={i} style={{
                display: "flex", gap: 26, alignItems: "baseline",
                paddingBottom: "calc(12px * var(--fit-scale, 1))", borderBottom: `1px solid ${PALETTE.paper}29`,
                minWidth: 0,
              }}>
                <div style={{
                  fontFamily: displayFont, fontWeight: 700, fontSize: "calc(42px * var(--fit-scale, 1))",
                  color: accent.hex, letterSpacing: "0.02em", minWidth: 64,
                  flex: "0 0 auto",
                }}>
                  {String(startIndex + i + 1).padStart(2, "0")}
                </div>
                <div style={{
                  fontFamily: bodyFont, fontSize: "calc(34px * var(--fit-scale, 1))", lineHeight: 1.3,
                  color: PALETTE.paper, fontWeight: 400,
                  flex: 1, minWidth: 0, maxWidth: 1600,
                }}>
                  {q}
                </div>
              </div>
            ))}
          </div>

        </div>

        <FooterBar
          left={`Round ${String(round).padStart(2, "0")} · Recap ${part}`}
          right={roundTitle}
          accentHex={accent.hex}
        />
      </div>
    </section>
  );
}

// ============================================================
// SLIDE: INTERMISSION
// ============================================================
const INTERMISSION_WORDS = ["Submit.", "Stretch.", "Refill.", "Regroup."];

function IntermissionSlide({ nextRound, nextTitle, nextLabel, label }) {
  const upNextText = nextLabel || `Round ${String(nextRound).padStart(2, "0")} · ${nextTitle}`;
  // Walk the highlight top-to-bottom through the words, looping while the
  // slide is on screen. Honor reduced-motion by holding on the first word.
  const [activeWord, setActiveWord] = useState(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(
      () => setActiveWord((i) => (i + 1) % INTERMISSION_WORDS.length),
      1300,
    );
    return () => clearInterval(id);
  }, []);
  return (
    <section data-label={label}>
      <div style={slideSurface("red")}>
        <Frame variant="red" />

        <div style={{
          padding: `90px ${SPACING.paddingX}px 90px`,
          height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
          alignItems: "center", textAlign: "center",
        }}>
          <div style={{
            fontFamily: displayFont, fontWeight: 600, fontSize: TYPE_SCALE.meta,
            letterSpacing: "0.32em", textTransform: "uppercase",
            color: PALETTE.paper, marginBottom: 24,
          }}>
            Intermission
          </div>
          {INTERMISSION_WORDS.map((word, i) => {
            const active = i === activeWord;
            return (
              <div key={word} style={{
                fontFamily: heroFont, fontSize: TYPE_SCALE.display, lineHeight: 1.02,
                color: active ? PALETTE.paper : `${PALETTE.paper}66`,
                textShadow: active ? hardShadow(9) : "none",
                transition: "color 450ms ease, text-shadow 450ms ease",
              }}>
                {word}
              </div>
            );
          })}

          <div style={{ margin: "44px 0 28px" }}>
            <AccentBar accentHex={PALETTE.ink} lineColor={`${PALETTE.paper}80`} lineWidth={160} />
          </div>

          <div style={{
            fontFamily: displayFont, fontWeight: 600, fontSize: 44,
            letterSpacing: "0.12em", textTransform: "uppercase", color: PALETTE.paper,
          }}>
            Up next · {upNextText}
          </div>
        </div>
      </div>
    </section>
  );
}

function PictureRecapCell({ item, index, fit = "cover", aspect = "316 / 220" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [item.src]);
  const showImage = item.src && !failed;
  // The cell IS the photo box. The aspect matches the canvas handout cell so
  // the same objectPosition produces the same visible crop on both. `fit`
  // "cover" crops to fill; "contain" letterboxes the whole image (flag round),
  // where panning is meaningless so the image is simply centered. The answer
  // line that lives under each cell on the canvas is intentionally omitted on
  // screen — it's only useful where contestants are writing.
  return (
    <div style={{
      aspectRatio: resolveAspect(aspect).css,
      position: "relative",
      background: `${PALETTE.paper}0D`,
      border: `2px solid ${PALETTE.paper}47`,
      overflow: "hidden",
    }}>
      {showImage ? (
        <img
          src={item.src}
          alt={item.caption || `Picture ${index + 1}`}
          onError={() => setFailed(true)}
          style={{
            width: "100%", height: "100%", objectFit: fit, display: "block",
            objectPosition: fit === "contain"
              ? "center"
              : `${item.position?.x ?? 50}% ${item.position?.y ?? 50}%`,
          }}
        />
      ) : (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            fontFamily: displayFont, fontSize: 28, fontWeight: 600,
            color: `${PALETTE.paper}66`, letterSpacing: "0.3em", textTransform: "uppercase",
          }}>
            PHOTO
          </div>
        </div>
      )}
      <div style={{
        position: "absolute", top: 12, left: 12,
        width: 50, height: 50,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: displayFont, fontWeight: 700, fontSize: 26,
        color: PALETTE.paper, background: PALETTE.rust,
        border: `2px solid ${PALETTE.inkDeep}`,
      }}>
        {String(index + 1).padStart(2, "0")}
      </div>
      {item.caption && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "10px 14px",
          background: `linear-gradient(180deg, transparent, ${PALETTE.inkDeep}D9)`,
          fontFamily: bodyFont, fontSize: 28, fontWeight: 500,
          color: PALETTE.paper, letterSpacing: "0.02em",
        }}>
          {item.caption}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SLIDE: PICTURE ROUND RECAP
// 5×2 grid for discussing picture round answers + serves as the print
// design for the paper handout. Cells are placeholder boxes when item.src
// is null; render an <img> when src is present.
// ============================================================
function PictureRoundRecap({ items, accent, pictureRound }) {
  const fit = pictureRound?.fit ?? "cover";
  const aspect = pictureRound?.aspect ?? "316 / 220";
  // Cap the grid width so tall aspects (square) shrink + center instead of
  // overflowing the 2-row grid into the footer. `availH` is the vertical budget
  // between the header and the footer; cells have no answer area on screen so
  // cellExtra is 0. For the default landscape aspect this returns full width.
  const grid = pictureGridLayout({
    aspect, cols: 5, rows: 2, contentW: 1920 - SPACING.paddingX * 2,
    availH: 560, gap: 20, cellExtra: 0,
  });
  return (
    <section data-label="Picture Round Recap">
      <div style={slideBase}>
        <Frame />

        <div style={{
          padding: `90px ${SPACING.paddingX}px 92px`,
          height: "100%", display: "flex", flexDirection: "column",
        }}>
          <Eyebrow accentHex={accent.hex}>Round 01 · Recap</Eyebrow>
          <div style={{ display: "flex", alignItems: "baseline", gap: 28, marginTop: 18 }}>
            <div style={{
              fontFamily: displayFont, fontWeight: 700, fontSize: 76,
              letterSpacing: "0.03em", textTransform: "uppercase", color: PALETTE.paper,
            }}>
              Picture Round
            </div>
            <div style={{
              fontFamily: bodyFont, fontStyle: "italic",
              fontSize: 32, color: `${PALETTE.paper}B3`,
            }}>
              {pictureRound?.instruction ?? "Identify the character, place, ship or creature."}
            </div>
          </div>
          <RuleBar />

          <div style={{
            marginTop: 28, flex: 1, display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)", alignContent: "center",
            gap: 20, width: grid.gridW, alignSelf: "center",
          }}>
            {items.map((item, i) => (
              <PictureRecapCell key={i} item={item} index={i} fit={fit} aspect={aspect} />
            ))}
          </div>
        </div>

        <FooterBar
          left="Picture Round · Recap"
          right={`${items.length} Photos · Discuss Answers`}
          accentHex={accent.hex}
        />
      </div>
    </section>
  );
}

// ============================================================
// SLIDE: TIEBREAKER INTRO — Final Wager rules (Final Jeopardy style)
// ============================================================
function TiebreakerIntroSlide({ accent }) {
  const rules = [
    { n: "I",   t: "Place Your Wager",       d: "Each tied team secretly writes a wager from 0 up to their total score before the question is read." },
    { n: "II",  t: "One Question, One Answer", d: "Hosts read the prompt. Each team writes one answer on their sheet. No conferring." },
    { n: "III", t: "Reveal & Adjust",         d: "Correct answers add the wager to your score. Wrong answers subtract it. Highest total wins." },
    { n: "IV",  t: "Up to Three Tries",       d: "Still tied after wagers are settled? We play again with a new question — up to a maximum of three." },
  ];
  return (
    <RuleGrid
      label="Tiebreakers · Final Wager"
      eyebrow="Sudden Death · Final Wager"
      title="Tiebreakers"
      rules={rules}
      footerLeft="Final Wager"
      footerRight="Only If Tied"
      accent={accent}
    />
  );
}

// ============================================================
// SLIDE: END
// ============================================================
function EndSlide({ accent, end }) {
  const e = end || {};
  return (
    <section data-label="End">
      <div style={slideBase}>
        <Frame />

        <div style={{
          padding: `96px ${SPACING.paddingX}px ${SPACING.paddingTop}px`,
          height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
          alignItems: "center", textAlign: "center",
        }}>
          <Logo size={110} style={{ marginBottom: 40 }} />
          <div style={{
            fontFamily: displayFont, fontWeight: 600, fontSize: TYPE_SCALE.meta,
            letterSpacing: "0.32em", textTransform: "uppercase", color: accent.hex,
          }}>
            End of Game
          </div>
          {e.hero1 && (
            <div style={{
              fontFamily: heroFont, fontSize: 172, lineHeight: 0.92,
              textTransform: "uppercase", color: PALETTE.paper, marginTop: 28,
            }}>
              {e.hero1}
            </div>
          )}
          {e.hero2 && (
            <div style={{
              fontFamily: heroFont, fontSize: 172, lineHeight: 0.92,
              textTransform: "uppercase", color: PALETTE.gold,
            }}>
              {e.hero2}
            </div>
          )}

          {e.subtitle && (
            <div style={{
              marginTop: 56, fontFamily: displayFont, fontWeight: 600, fontSize: 40,
              color: `${PALETTE.paper}99`, letterSpacing: "0.28em", textTransform: "uppercase",
            }}>
              {e.subtitle}
            </div>
          )}
        </div>

        <FooterBar left="End of Game" right="Winner Announced Shortly" accentHex={accent.hex} />
      </div>
    </section>
  );
}

// ============================================================
// SLIDE: NEXT EVENT — announcement for the next trivia night
// ============================================================
function NextEventSlide({ accent, nextEvent }) {
  const e = nextEvent || {};
  return (
    <section data-label="Next Event">
      <div style={slideBase}>
        <Frame />

        <div style={{
          padding: `96px ${SPACING.paddingX}px ${SPACING.paddingTop}px`,
          height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
          alignItems: "center", textAlign: "center",
        }}>
          {e.eyebrow && (
            <div style={{
              fontFamily: displayFont, fontWeight: 600, fontSize: TYPE_SCALE.meta,
              letterSpacing: "0.32em", textTransform: "uppercase", color: accent.hex,
            }}>
              {e.eyebrow}
            </div>
          )}
          {e.hero && (
            <div style={{
              fontFamily: heroFont, fontSize: 120, lineHeight: 0.96,
              textTransform: "uppercase", color: PALETTE.paper, marginTop: 28,
            }}>
              {e.hero}
            </div>
          )}
          {e.date && (
            <div style={{
              marginTop: 44, fontFamily: displayFont, fontWeight: 700, fontSize: 96,
              color: accent.hex, letterSpacing: "0.06em", textTransform: "uppercase",
              textShadow: hardShadow(6),
            }}>
              {e.date}
            </div>
          )}
          {e.venue && (
            <div style={{
              marginTop: 26, fontFamily: displayFont, fontWeight: 600, fontSize: 44,
              color: `${PALETTE.paper}99`, letterSpacing: "0.26em", textTransform: "uppercase",
            }}>
              {e.venue}
            </div>
          )}
          {e.detail && (
            <div style={{
              marginTop: 48, fontFamily: bodyFont, fontStyle: "italic",
              fontWeight: 400, fontSize: 34, lineHeight: 1.4,
              color: `${PALETTE.paper}B3`, maxWidth: 1000,
            }}>
              {e.detail}
            </div>
          )}
        </div>

        <FooterBar left="Next Event" right={e.venue} accentHex={accent.hex} />
      </div>
    </section>
  );
}

export {
  TitleSlide, RulesSlide, PrizeSlide, CostumeContestSlide, RoundOpener,
  PictureRoundInstructions, QuestionSlide, RoundRecap, PictureRoundRecap,
  IntermissionSlide, TiebreakerIntroSlide, EndSlide, NextEventSlide,
  ACCENTS, PALETTE,
};
