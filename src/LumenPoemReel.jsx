import { AbsoluteFill, Audio, Img, Sequence, staticFile, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

// Lumen 2.0 poem reel: hook card (frame 1) → voiced poem, each verse appearing as it is
// spoken → payoff line → app plug that shows THIS poem as a home-screen widget.
// Text stays inside the Reels safe zone (y 230–1440, right rail clear).

const GOLD = "#C9A961";
const CREAM = "#F3EDE2";
const SERIF = "'New York', Georgia, 'Noto Serif', serif";
const SANS = "-apple-system, 'Helvetica Neue', 'Noto Sans', sans-serif";

export const POEM_HOOK_SEC = 2.4;
export const POEM_PLUG_SEC = 4.2;
export const POEM_GAP_SEC = 0.5;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" };

// Fit the longest verse of a stanza on one line inside `width` px.
const fitSize = (lines, width, max) => {
  const longest = Math.max(...lines.map((l) => l.length));
  return Math.min(max, Math.floor(width / (longest * 0.52)));
};

export const LumenPoemReel = ({
  hook = "Hiç anlatamadığın biri oldu mu?",
  hookSub = "Orhan Veli",
  title = "Anlatamıyorum",
  author = "Orhan Veli Kanık",
  stanzas = [],            // [[{text,start,end}], ...] seconds, relative to voice start
  voice = "reel/voice.mp3",
  music = "music/07.mp3",
  bg = "bg/modern_canli/bg_03.jpg",
  handle = "@lumen.bilgelik",
  cta = null,              // spoken app plug, e.g. "reel/cta_ozan.mp3"
  prose = false,           // paragraph mode: a page of sentences flowing as one paragraph
  rtl = false,             // right-to-left scripts (Arabic)
  plug = { head: "Her sabah bir şiir,", accent: "ana ekranında.", badge: "App Store'da ücretsiz", label: "GÜNÜN ŞİİRİ" },
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const vt = t - POEM_HOOK_SEC;                      // time inside the voice track
  const voiceEnd = stanzas.length ? stanzas[stanzas.length - 1].slice(-1)[0].end : 0;
  const plugStart = POEM_HOOK_SEC + voiceEnd + POEM_GAP_SEC;

  // slow Ken Burns: motion from the very first frame
  const zoom = interpolate(frame, [0, durationInFrames], [1.08, 1.22]);
  const pan = interpolate(frame, [0, durationInFrames], [0, -60]);

  const hookOut = interpolate(t, [POEM_HOOK_SEC - 0.35, POEM_HOOK_SEC], [1, 0], clamp);
  const hookIn = interpolate(frame, [0, 6], [0, 1], clamp);
  const plugIn = interpolate(t, [plugStart, plugStart + 0.6], [0, 1], clamp);
  const poemOut = 1 - plugIn;

  // which stanza is on screen
  const lastIdx = stanzas.length - 1;
  let current = -1;
  stanzas.forEach((s, i) => { if (vt >= s[0].start - 0.25) current = i; });

  return (
    <AbsoluteFill style={{ background: "#0D1117", overflow: "hidden", direction: rtl ? "rtl" : "ltr" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom}) translateY(${pan}px)` }}>
        <Img src={staticFile(bg)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(13,17,23,.35) 0%, rgba(13,17,23,.72) 40%, rgba(13,17,23,.86) 100%)" }} />

      <Sequence from={Math.round(POEM_HOOK_SEC * fps)}><Audio src={staticFile(voice)} /></Sequence>
      {cta && <Sequence from={Math.round((plugStart + 0.25) * fps)}><Audio src={staticFile(cta)} /></Sequence>}
      <Audio src={staticFile(music)} volume={(f) => interpolate(f, [0, 20, durationInFrames - 30, durationInFrames], [0, 0.16, 0.16, 0], clamp)} />

      {/* HOOK — up at frame 1, 6 words, center of the safe zone */}
      <div style={{ position: "absolute", left: 100, right: 160, top: 640, opacity: hookIn * hookOut }}>
        <div style={{ fontFamily: SERIF, fontSize: 92, fontWeight: 600, color: CREAM, lineHeight: 1.1 }}>{hook}</div>
        <div style={{ width: 90, height: 3, background: GOLD, margin: "38px 0 26px" }} />
        <div style={{ fontFamily: SANS, fontSize: 40, color: GOLD }}>{hookSub}</div>
      </div>

      {/* POEM */}
      {stanzas.map((s, i) => {
        if (i !== current) return null;
        const isPayoff = i === lastIdx && s.length === 1;
        const next = stanzas[i + 1];
        const out = next ? interpolate(vt, [next[0].start - 0.45, next[0].start - 0.1], [1, 0], clamp) : 1;
        const size = isPayoff ? Math.max(60, Math.min(112, Math.floor(830 / (s[0].text.length * 0.5)))) : 64;  // long payoffs wrap instead of shrinking
        return (
          <div key={i} style={{ position: "absolute", left: 90, right: 150, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: isPayoff ? "center" : "flex-start", paddingBottom: 220, opacity: out * poemOut }}>
            {!isPayoff && <div style={{ width: 70, height: 3, background: GOLD, marginBottom: 40, opacity: 0.9 }} />}
            {prose && !isPayoff && (
              <div style={{ fontFamily: SERIF, fontSize: 52, color: CREAM, lineHeight: 1.5, textShadow: "0 2px 18px rgba(0,0,0,.5)" }}>
                {s.map((l, j) => (
                  <span key={j} style={{ opacity: interpolate(vt, [l.start - 0.15, l.start + 0.35], [0.12, 1], clamp) }}>{l.text}{" "}</span>
                ))}
              </div>
            )}
            {!(prose && !isPayoff) && s.map((l, j) => {
              const o = interpolate(vt, [l.start - 0.15, l.start + 0.35], [0, 1], clamp);
              const y = interpolate(vt, [l.start - 0.15, l.start + 0.5], [18, 0], clamp);
              return (
                <div key={j} style={{ fontFamily: SERIF, fontSize: size, fontStyle: isPayoff ? "italic" : "normal", color: CREAM, lineHeight: 1.3, marginBottom: isPayoff ? 0 : 18, paddingInlineStart: isPayoff ? 0 : 48, textIndent: isPayoff ? 0 : -48, whiteSpace: "normal", textAlign: isPayoff ? "center" : "start", opacity: o, transform: `translateY(${y}px)`, textShadow: "0 2px 18px rgba(0,0,0,.5)" }}>
                  {l.text}
                </div>
              );
            })}
            {isPayoff && <div style={{ fontFamily: SANS, fontSize: 36, color: GOLD, marginTop: 30, opacity: interpolate(vt, [s[0].end + 0.2, s[0].end + 0.8], [0, 1], clamp) }}>{author}</div>}
          </div>
        );
      })}

      {/* APP PLUG — the same poem, as the widget they could have */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 300, display: "flex", flexDirection: "column", alignItems: "center", opacity: plugIn }}>
        <div style={{ fontFamily: SANS, fontSize: 58, fontWeight: 700, color: CREAM }}>{plug.head}</div>
        <div style={{ fontFamily: SANS, fontSize: 58, fontWeight: 700, color: GOLD, marginTop: 6 }}>{plug.accent}</div>
        <div style={{ marginTop: 70, width: 760, borderRadius: 44, padding: "40px 46px", background: "linear-gradient(150deg,#161B2C 0%,#0E1220 100%)", border: `1.5px solid ${GOLD}55`, boxShadow: `0 0 70px ${GOLD}22, 0 24px 60px rgba(0,0,0,.6)`, transform: `translateY(${interpolate(plugIn, [0, 1], [40, 0])}px)` }}>
          <div style={{ fontFamily: SANS, fontSize: 20, letterSpacing: 4, color: GOLD }}>{plug.label}</div>
          <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 600, color: "#fff", marginTop: 14 }}>{title}</div>
          <div style={{ fontFamily: SERIF, fontSize: 31, color: "rgba(255,255,255,.88)", lineHeight: 1.45, marginTop: 14 }}>
            {prose
              ? (() => { const p = (stanzas[0] || []).map((l) => l.text).join(" "); return p.length > 150 ? p.slice(0, p.lastIndexOf(" ", 150)) + "…" : p; })()
              : (stanzas[0] || []).slice(0, 4).map((l, j) => <div key={j}>{l.text}</div>)}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 24, color: GOLD, marginTop: 18 }}>{author}</div>
        </div>
        <div style={{ marginTop: 60, display: "flex", alignItems: "center", gap: 22 }}>
          <Img src={staticFile("lumen_appicon.png")} style={{ width: 96, height: 96, borderRadius: 22 }} />
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 44, color: GOLD, letterSpacing: 3 }}>Lumen</div>
            <div style={{ fontFamily: SANS, fontSize: 28, color: "rgba(255,255,255,.75)" }}>{plug.badge}</div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", left: 100, top: 1400, fontFamily: SANS, fontSize: 28, color: `${GOLD}cc`, opacity: 1 - plugIn, direction: "ltr" }}>{handle}</div>
    </AbsoluteFill>
  );
};
