import {
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  interpolate,
  spring,
  Img,
  AbsoluteFill,
} from "remotion";

const GOLD = "#C9A961";
const GOLD_DARK = "#8B7355";
const BG_DARK = "#0A0E1A";
const BG_MID = "#111628";

const SERIF_FONT = "'Noto Serif', 'Noto Serif Devanagari', 'Noto Naskh Arabic', Georgia, serif";
const SANS_FONT = "'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Arabic', sans-serif";

export const LumenQuoteVideo = ({ figureName, quoteText, bustImage, lifeSpan, dayNumber = 1, dayLabel = "GÜN", slogan = "Her gün, bir ışık.", ctaText = "App Store'dan İndir", teaserText = "sayısız düşünür · binlerce söz" }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Timeline (15 seconds = 450 frames @ 30fps)
  // 0-1s: Dark, spotlight fades in
  // 1-2s: Bust appears with glow
  // 2-3s: Name + lifespan + day counter
  // 3-7s: Quote word by word
  // 7-8.5s: Hold quote
  // 8.5-10s: Scene shrinks into phone
  // 10-15s: CTA end screen with App Store badge

  // === SPOTLIGHT ===
  const spotlightOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  const spotlightFadeOut = interpolate(frame, [240, 270], [1, 0.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // === BUST ===
  const bustScale = spring({ frame: frame - 20, fps, config: { damping: 12, stiffness: 80 } });
  const bustOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" });
  const bustGlow = interpolate(frame, [30, 60, 210, 250], [0, 1, 1, 0.3], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const breathe = Math.sin(frame * 0.05) * 0.015 + 1;
  const finalBustScale = bustScale * breathe;

  // === NAME ===
  const nameOpacity = interpolate(frame, [60, 80], [0, 1], { extrapolateRight: "clamp" });
  const nameY = interpolate(frame, [60, 80], [20, 0], { extrapolateRight: "clamp" });

  // === DAY COUNTER ===
  const dayOpacity = interpolate(frame, [5, 20], [0, 1], { extrapolateRight: "clamp" });

  // === QUOTE ===
  const words = quoteText.split(" ");
  const quoteStartFrame = 90;
  const framesPerWord = Math.min(8, Math.floor(120 / words.length));

  // === DIVIDER ===
  const dividerWidth = interpolate(frame, [80, 95], [0, 200], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // === OUTRO (starts at 8.5s = frame 255) ===
  const outroStart = 255;
  const outroProgress = interpolate(frame, [outroStart, outroStart + 45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sceneScale = interpolate(outroProgress, [0, 1], [1, 0.32]);
  const sceneY = interpolate(outroProgress, [0, 1], [0, -180]);
  const sceneBorderRadius = interpolate(outroProgress, [0, 1], [0, 44]);
  const phoneFrameOpacity = interpolate(outroProgress, [0.3, 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // === CTA END SCREEN (10s-15s = frames 300-450) ===
  const ctaStart = 310;
  const logoFade = interpolate(frame, [ctaStart, ctaStart + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sloganFade = interpolate(frame, [ctaStart + 15, ctaStart + 35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const badgeFade = interpolate(frame, [ctaStart + 30, ctaStart + 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const teaserFade = interpolate(frame, [ctaStart + 45, ctaStart + 65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ctaGlow = interpolate(frame, [ctaStart + 50, ctaStart + 80, ctaStart + 110, ctaStart + 140], [0, 0.6, 0.3, 0.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // === BACKGROUND FADE ===
  const outerBg = interpolate(outroProgress, [0, 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const outerBgColor = `rgba(10, 14, 26, ${outerBg})`;

  return (
    <AbsoluteFill style={{ backgroundColor: outerBgColor }}>
      {/* Main scene wrapper */}
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${sceneScale}) translateY(${sceneY}px)`,
          borderRadius: sceneBorderRadius,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Background gradient */}
        <AbsoluteFill
          style={{
            background: `linear-gradient(160deg, ${BG_DARK} 0%, ${BG_MID} 50%, ${BG_DARK} 100%)`,
          }}
        />

        {/* Spotlight */}
        <div
          style={{
            position: "absolute",
            top: "25%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 800,
            height: 800,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${GOLD}15 0%, ${GOLD}08 40%, transparent 70%)`,
            opacity: spotlightOpacity * spotlightFadeOut,
          }}
        />

        {/* Particles */}
        {[...Array(12)].map((_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const radius = 250 + Math.sin(frame * 0.03 + i) * 30;
          const x = Math.cos(angle + frame * 0.005) * radius;
          const y = Math.sin(angle + frame * 0.005) * radius;
          const particleOpacity = interpolate(frame, [30, 60], [0, 0.4], { extrapolateRight: "clamp" }) *
            (0.3 + Math.sin(frame * 0.08 + i * 2) * 0.3);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top: "32%",
                left: "50%",
                width: 4,
                height: 4,
                borderRadius: "50%",
                backgroundColor: GOLD,
                opacity: particleOpacity * spotlightFadeOut,
                transform: `translate(${x}px, ${y}px)`,
              }}
            />
          );
        })}

        {/* Day counter */}
        <div
          style={{
            position: "absolute",
            top: 80,
            width: "100%",
            textAlign: "center",
            opacity: dayOpacity,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 24px",
              borderRadius: 20,
              border: `1px solid ${GOLD}30`,
              background: `${GOLD}08`,
            }}
          >
            <span style={{ fontFamily: SANS_FONT, fontSize: 16, color: `${GOLD}90`, letterSpacing: 2 }}>
              ✦
            </span>
            <span style={{ fontFamily: SERIF_FONT, fontSize: 18, color: GOLD, letterSpacing: 1 }}>
              {dayLabel} #{dayNumber}
            </span>
            <span style={{ fontFamily: SANS_FONT, fontSize: 16, color: `${GOLD}90`, letterSpacing: 2 }}>
              ✦
            </span>
          </div>
        </div>

        {/* Bust image with glow */}
        <div
          style={{
            position: "absolute",
            top: "18%",
            left: "50%",
            transform: `translate(-50%, 0) scale(${finalBustScale})`,
            opacity: bustOpacity,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 320,
              height: 320,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${GOLD}30 0%, ${GOLD}10 50%, transparent 70%)`,
              opacity: bustGlow,
            }}
          />
          <div
            style={{
              width: 240,
              height: 240,
              borderRadius: "50%",
              border: `3px solid ${GOLD}50`,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `linear-gradient(135deg, ${GOLD}15 0%, ${GOLD}05 100%)`,
            }}
          >
            <Img
              src={staticFile(bustImage)}
              style={{
                width: 200,
                height: 200,
                objectFit: "cover",
                borderRadius: "50%",
              }}
            />
          </div>
        </div>

        {/* Figure name */}
        <div
          style={{
            position: "absolute",
            top: "45%",
            width: "100%",
            textAlign: "center",
            opacity: nameOpacity,
            transform: `translateY(${nameY}px)`,
          }}
        >
          <div
            style={{
              fontFamily: SERIF_FONT,
              fontSize: 52,
              fontWeight: "600",
              color: GOLD,
              letterSpacing: 2,
            }}
          >
            {figureName}
          </div>
          <div
            style={{
              fontFamily: SERIF_FONT,
              fontSize: 24,
              color: "rgba(255,255,255,0.35)",
              marginTop: 8,
            }}
          >
            {lifeSpan}
          </div>
        </div>

        {/* Gold divider */}
        <div
          style={{
            position: "absolute",
            top: "54%",
            left: "50%",
            transform: "translateX(-50%)",
            height: 1,
            width: dividerWidth,
            background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
          }}
        />

        {/* Quote text */}
        <div
          style={{
            position: "absolute",
            top: "58%",
            width: "100%",
            textAlign: "center",
            padding: "0 80px",
          }}
        >
          <div
            style={{
              fontFamily: SERIF_FONT,
              fontSize: 80,
              color: `${GOLD}40`,
              lineHeight: "0.5",
              marginBottom: 20,
              opacity: interpolate(frame, [85, 95], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            {"“"}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px 12px" }}>
            {words.map((word, i) => {
              const wordFrame = quoteStartFrame + i * framesPerWord;
              const wordOpacity = interpolate(frame, [wordFrame, wordFrame + 10], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const wordY = interpolate(frame, [wordFrame, wordFrame + 10], [15, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <span
                  key={i}
                  style={{
                    fontFamily: SERIF_FONT,
                    fontSize: 44,
                    color: "white",
                    lineHeight: 1.5,
                    opacity: wordOpacity,
                    transform: `translateY(${wordY}px)`,
                    display: "inline-block",
                  }}
                >
                  {word}
                </span>
              );
            })}
          </div>
        </div>

        {/* Lumen watermark */}
        <div
          style={{
            position: "absolute",
            bottom: 80,
            width: "100%",
            textAlign: "center",
            opacity: interpolate(frame, [60, 80, 240, 260], [0, 0.5, 0.5, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ fontFamily: SERIF_FONT, fontSize: 22, color: GOLD, letterSpacing: 3 }}>
            ✦ Lumen ✦
          </div>
          <div style={{ fontFamily: SANS_FONT, fontSize: 14, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
            {slogan}
          </div>
        </div>
      </div>

      {/* === CTA END SCREEN === */}
      {outroProgress > 0 && (
        <>
          {/* Sparkle stars */}
          {[...Array(30)].map((_, i) => {
            const sx = ((i * 197 + 53) % 1080);
            const sy = ((i * 131 + 79) % 1920);
            const sSize = 2 + (i % 4) * 1.5;
            const sDelay = (i % 10) * 0.1;
            const sparkleOn = interpolate(
              frame,
              [outroStart + sDelay * 30, outroStart + 15 + sDelay * 30],
              [0, 0.8],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            const twinkle = 0.5 + Math.sin(frame * 0.15 + i * 1.7) * 0.5;
            return (
              <div
                key={`star-${i}`}
                style={{
                  position: "absolute",
                  left: sx,
                  top: sy,
                  width: sSize,
                  height: sSize,
                  borderRadius: "50%",
                  backgroundColor: i % 3 === 0 ? GOLD : "white",
                  opacity: sparkleOn * twinkle,
                  boxShadow: `0 0 ${sSize * 3}px ${i % 3 === 0 ? GOLD : "white"}`,
                }}
              />
            );
          })}

          {/* Floating bust icons around phone */}
          {[
            { img: "bust_seneca.png", x: -380, y: -280, size: 70, blur: 3 },
            { img: "bust_confucius.png", x: 320, y: -180, size: 65, blur: 2.5 },
            { img: "bust_plato.png", x: -300, y: 80, size: 60, blur: 3 },
            { img: "bust_aristotle.png", x: 360, y: 150, size: 55, blur: 2.5 },
            { img: "bust_buddha.png", x: -420, y: -50, size: 50, blur: 4 },
            { img: "bust_einstein.png", x: 420, y: -40, size: 58, blur: 3 },
            { img: "bust_lao_tzu.png", x: -260, y: 280, size: 52, blur: 3.5 },
            { img: "bust_yunus_emre.png", x: 280, y: 320, size: 48, blur: 3 },
            { img: "bust_hafiz.png", x: -450, y: 200, size: 45, blur: 4 },
            { img: "bust_marcus_aurelius.png", x: 450, y: -300, size: 50, blur: 4 },
          ].map((b, i) => {
            const floatY = Math.sin(frame * 0.04 + i * 1.2) * 8;
            const bustFade = interpolate(frame, [outroStart + 10 + i * 2, outroStart + 30 + i * 2], [0, 1], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp",
            });
            return (
              <div
                key={`teaser-${i}`}
                style={{
                  position: "absolute",
                  top: "38%",
                  left: "50%",
                  transform: `translate(${b.x}px, ${b.y + floatY}px)`,
                  opacity: bustFade * (0.35 + (i % 3) * 0.1),
                  filter: `blur(${b.blur}px)`,
                }}
              >
                <div
                  style={{
                    width: b.size,
                    height: b.size,
                    borderRadius: "50%",
                    border: `1px solid ${GOLD}25`,
                    overflow: "hidden",
                    background: `${GOLD}08`,
                  }}
                >
                  <Img
                    src={staticFile(b.img)}
                    style={{
                      width: b.size - 10,
                      height: b.size - 10,
                      objectFit: "cover",
                      borderRadius: "50%",
                      margin: 5,
                    }}
                  />
                </div>
              </div>
            );
          })}

          {/* Phone frame around miniaturized scene */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -62%)",
              width: 1080 * 0.32 + 24,
              height: 1920 * 0.32 + 24,
              borderRadius: 50,
              border: `2px solid ${GOLD}40`,
              opacity: phoneFrameOpacity,
              pointerEvents: "none",
              boxShadow: `0 0 60px ${GOLD}15, 0 0 120px ${GOLD}08`,
            }}
          />

          {/* === BIG CTA SECTION === */}
          <div
            style={{
              position: "absolute",
              bottom: 80,
              width: "100%",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Lumen Logo */}
            <div
              style={{
                fontFamily: SERIF_FONT,
                fontSize: 56,
                color: GOLD,
                letterSpacing: 6,
                opacity: logoFade,
                textShadow: `0 0 40px ${GOLD}40`,
              }}
            >
              Lumen
            </div>

            {/* Slogan */}
            <div
              style={{
                fontFamily: SERIF_FONT,
                fontSize: 26,
                color: "rgba(255,255,255,0.55)",
                marginTop: 12,
                opacity: sloganFade,
                letterSpacing: 1,
              }}
            >
              {slogan}
            </div>

            {/* Decorative divider */}
            <div
              style={{
                width: interpolate(frame, [ctaStart + 25, ctaStart + 45], [0, 160], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                height: 1,
                background: `linear-gradient(90deg, transparent, ${GOLD}60, transparent)`,
                marginTop: 24,
                marginBottom: 24,
              }}
            />

            {/* CTA Button */}
            <div
              style={{
                opacity: badgeFade,
                transform: `scale(${interpolate(badgeFade, [0, 1], [0.8, 1])})`,
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  padding: "18px 52px",
                  background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DARK})`,
                  borderRadius: 35,
                  fontFamily: SANS_FONT,
                  fontSize: 24,
                  fontWeight: "700",
                  color: BG_DARK,
                  letterSpacing: 1,
                  boxShadow: `0 6px 30px ${GOLD}50, 0 0 ${60 * ctaGlow}px ${GOLD}30`,
                }}
              >
                {ctaText}
              </div>
            </div>

            {/* Teaser text */}
            <div
              style={{
                marginTop: 22,
                fontFamily: SANS_FONT,
                fontSize: 19,
                color: "rgba(255,255,255,0.4)",
                letterSpacing: 0.5,
                opacity: teaserFade,
              }}
            >
              {teaserText}
            </div>

            {/* Pulsing dot indicator */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 20,
                opacity: teaserFade * 0.6,
              }}
            >
              {[0, 1, 2].map((dot) => {
                const dotPulse = 0.4 + Math.sin(frame * 0.08 + dot * 1.5) * 0.4;
                return (
                  <div
                    key={dot}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: GOLD,
                      opacity: dotPulse,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};
