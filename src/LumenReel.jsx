import { staticFile, Img, AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

const GOLD = "#C9A961";
const SERIF_FONT = "'Noto Serif', 'Noto Serif Devanagari', 'Noto Naskh Arabic', Georgia, serif";
const SANS_FONT = "'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Arabic', sans-serif";

// Short silent Reel: themed public-domain paintings cross-fade with a slow
// Ken-Burns zoom in the background while the bust + quote sit fixed in front.
// Backgrounds cycle fast (~1.5s each). Posted to IG Reels + TikTok.
export const LumenReel = ({
  figureName = "Marcus Aurelius",
  quoteText = "Hayatımızın mutluluğu, düşüncelerimizin kalitesine bağlıdır.",
  bustImage = "bust_marcus_aurelius.png",
  lifeSpan = "121 – 180",
  handle = "@lumen.app",
  layout = "A", // A: quote top-left + bust bottom · B: quote top-center + bust bottom · C: bust top + quote below
  slotFrames = 13, // frames each painting is shown (@30fps: 13≈0.43s, 9≈0.3s)
  backgrounds = ["bg/antik/bg_00.jpg", "bg/antik/bg_01.jpg", "bg/antik/bg_02.jpg"],
}) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames, fps } = useVideoConfig();

  const bgs = backgrounds.length ? backgrounds : ["bg/antik/bg_00.jpg"];
  // Fast montage: paintings cycle on a fixed short interval (decoupled from how
  // many distinct images there are — they just repeat). slotFrames controls the
  // pace; ~13 frames @30fps ≈ 0.43s per painting. Lower = faster.
  const slot = Math.max(5, slotFrames);
  const slots = Math.ceil(durationInFrames / slot);
  const fade = Math.max(3, Math.round(slot * 0.4)); // cross-fade length

  // Front-layer entrance
  const frontFade = interpolate(frame, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const quoteRise = interpolate(frame, [0, 22], [24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const quoteSize = Math.round(width * 0.066);
  // Layout C makes the bust the hero (top, larger); A/B keep it a bottom accent.
  const bustSize = Math.round(width * (layout === "C" ? 0.50 : layout === "B" ? 0.46 : 0.40));

  return (
    <AbsoluteFill style={{ backgroundColor: "#070A12" }}>
      {/* ── Background: fast cross-fading paintings (cycle through bgs) ── */}
      {Array.from({ length: slots }).map((_, s) => {
        const bg = bgs[s % bgs.length];
        const start = s * slot;
        const end = start + slot;
        const opacity = interpolate(
          frame,
          [start - fade, start, end - fade, end],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        if (opacity <= 0) return null;
        // Subtle zoom within each short slot (kept small since slots are brief).
        const prog = interpolate(frame, [start - fade, end], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const scale = 1.10 + prog * 0.05;
        return (
          <Img
            key={s}
            src={staticFile(bg)}
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity,
              transform: `scale(${scale})`,
              filter: "saturate(0.85) brightness(0.62)",
            }}
          />
        );
      })}

      {/* Constant darkening + vignette so the fixed text stays readable */}
      <AbsoluteFill
        style={{
          background:
            `linear-gradient(180deg, rgba(7,10,18,0.80) 0%, rgba(7,10,18,0.32) 28%, rgba(7,10,18,0.50) 60%, rgba(7,10,18,0.95) 100%)`,
        }}
      />
      <AbsoluteFill style={{ background: `radial-gradient(120% 75% at 50% 44%, transparent 38%, rgba(7,10,18,0.62) 100%)` }} />

      {/* ── Front layer (fixed). Position varies by `layout`. ── */}
      <div style={{ opacity: frontFade }}>
        {/* Brand mark (always top) */}
        <div style={{ position: "absolute", top: height * 0.06, width: "100%", textAlign: "center", fontFamily: SERIF_FONT, fontSize: width * 0.027, letterSpacing: 7, color: `${GOLD}cc` }}>
          ✦ LUMEN ✦
        </div>

        {/* The bust medallion, reused across layouts */}
        {(() => {
          const Bust = (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  width: bustSize, height: bustSize, borderRadius: "50%",
                  border: `3px solid ${GOLD}66`, overflow: "hidden",
                  background: `linear-gradient(135deg, ${GOLD}20 0%, ${GOLD}05 100%)`,
                  boxShadow: `0 0 ${bustSize * 0.25}px ${GOLD}33, 0 12px 40px rgba(0,0,0,0.6)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Img src={staticFile(bustImage)} style={{ width: "82%", height: "82%", objectFit: "cover", borderRadius: "50%" }} />
              </div>
              {lifeSpan ? (
                <div style={{ marginTop: width * 0.02, fontFamily: SERIF_FONT, fontSize: width * 0.026, color: "rgba(255,255,255,0.45)" }}>{lifeSpan}</div>
              ) : null}
            </div>
          );

          const centered = layout !== "A";
          const Quote = (
            <div style={{ textAlign: centered ? "center" : "left", transform: `translateY(${quoteRise}px)` }}>
              <div style={{ fontFamily: SERIF_FONT, fontSize: width * 0.15, color: `${GOLD}55`, lineHeight: 0.7, marginBottom: width * 0.008 }}>{"“"}</div>
              <div style={{ fontFamily: SERIF_FONT, fontStyle: "italic", fontSize: quoteSize, lineHeight: 1.32, color: "#F4EFE6", textShadow: "0 2px 18px rgba(0,0,0,0.7)" }}>
                {quoteText}
              </div>
              <div style={{ marginTop: width * 0.035, fontFamily: SERIF_FONT, fontSize: width * 0.038, color: GOLD, letterSpacing: 1 }}>
                {"— "}{figureName}
              </div>
            </div>
          );

          if (layout === "C") {
            // Bust on top (hero), quote centered below it.
            return (
              <>
                <div style={{ position: "absolute", top: height * 0.16, left: 0, right: 0, display: "flex", justifyContent: "center" }}>{Bust}</div>
                <div style={{ position: "absolute", top: height * 0.52, left: width * 0.09, right: width * 0.09 }}>{Quote}</div>
              </>
            );
          }
          // Layouts A & B: quote on top, bust at the bottom (centered).
          return (
            <>
              <div style={{ position: "absolute", top: height * 0.15, left: width * 0.09, right: width * 0.09 }}>{Quote}</div>
              <div style={{ position: "absolute", bottom: height * 0.11, left: 0, right: 0, display: "flex", justifyContent: "center" }}>{Bust}</div>
            </>
          );
        })()}

        {/* Handle (always bottom) */}
        <div style={{ position: "absolute", bottom: height * 0.045, width: "100%", textAlign: "center", fontFamily: SANS_FONT, fontSize: width * 0.024, letterSpacing: 2, color: "rgba(255,255,255,0.4)" }}>
          {handle}
        </div>
      </div>
    </AbsoluteFill>
  );
};
