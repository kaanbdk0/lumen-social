import { staticFile, Img, AbsoluteFill, useVideoConfig } from "remotion";

const GOLD = "#C9A961";
const SERIF_FONT = "'Noto Serif', 'Noto Serif Devanagari', 'Noto Naskh Arabic', Georgia, serif";
const SANS_FONT = "'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Arabic', sans-serif";

// Static feed/photo post: a themed public-domain painting darkened behind the
// figure's bust, with the quote overlaid. Rendered with `remotion still`.
export const LumenPost = ({
  figureName = "Marcus Aurelius",
  quoteText = "Hayatımızın mutluluğu, düşüncelerimizin kalitesine bağlıdır.",
  bustImage = "bust_marcus_aurelius.png",
  background = "bg/antik/bg_00.jpg",
  lifeSpan = "121 – 180",
  handle = "@lumen",
}) => {
  const { width, height } = useVideoConfig();
  const bustSize = Math.round(width * 0.42);
  const quoteSize = Math.round(width * 0.072);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0E1A" }}>
      {/* Themed background painting */}
      <Img
        src={staticFile(background)}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scale(1.05)",
          filter: "saturate(0.85) brightness(0.7)",
        }}
      />

      {/* Darkening + vignette so text and bust read clearly */}
      <AbsoluteFill
        style={{
          background:
            `linear-gradient(180deg, rgba(8,11,20,0.78) 0%, rgba(8,11,20,0.30) 30%, rgba(8,11,20,0.55) 62%, rgba(8,11,20,0.94) 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 80% at 50% 42%, transparent 40%, rgba(8,11,20,0.6) 100%)`,
        }}
      />

      {/* Top brand mark */}
      <div
        style={{
          position: "absolute",
          top: height * 0.05,
          width: "100%",
          textAlign: "center",
          fontFamily: SERIF_FONT,
          fontSize: width * 0.028,
          letterSpacing: 6,
          color: `${GOLD}cc`,
        }}
      >
        ✦ LUMEN ✦
      </div>

      {/* Quote block (top) */}
      <div
        style={{
          position: "absolute",
          top: height * 0.13,
          left: width * 0.09,
          right: width * 0.09,
          textAlign: "left",
        }}
      >
        <div style={{ fontFamily: SERIF_FONT, fontSize: width * 0.16, color: `${GOLD}55`, lineHeight: 0.7, marginBottom: width * 0.01 }}>
          {"“"}
        </div>
        <div
          style={{
            fontFamily: SERIF_FONT,
            fontStyle: "italic",
            fontSize: quoteSize,
            lineHeight: 1.32,
            color: "#F4EFE6",
            textShadow: "0 2px 18px rgba(0,0,0,0.65)",
          }}
        >
          {quoteText}
        </div>
        <div
          style={{
            marginTop: width * 0.04,
            fontFamily: SERIF_FONT,
            fontSize: width * 0.04,
            color: GOLD,
            letterSpacing: 1,
          }}
        >
          {"— "}{figureName}
        </div>
      </div>

      {/* Bust (bottom center) */}
      <div
        style={{
          position: "absolute",
          bottom: height * 0.11,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: bustSize,
            height: bustSize,
            borderRadius: "50%",
            border: `3px solid ${GOLD}66`,
            overflow: "hidden",
            background: `linear-gradient(135deg, ${GOLD}20 0%, ${GOLD}05 100%)`,
            boxShadow: `0 0 ${bustSize * 0.25}px ${GOLD}33, 0 12px 40px rgba(0,0,0,0.6)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Img
            src={staticFile(bustImage)}
            style={{ width: "82%", height: "82%", objectFit: "cover", borderRadius: "50%" }}
          />
        </div>
        {lifeSpan ? (
          <div style={{ marginTop: width * 0.02, fontFamily: SERIF_FONT, fontSize: width * 0.028, color: "rgba(255,255,255,0.45)" }}>
            {lifeSpan}
          </div>
        ) : null}
      </div>

      {/* Handle watermark */}
      <div
        style={{
          position: "absolute",
          bottom: height * 0.045,
          width: "100%",
          textAlign: "center",
          fontFamily: SANS_FONT,
          fontSize: width * 0.026,
          letterSpacing: 2,
          color: "rgba(255,255,255,0.4)",
        }}
      >
        {handle}
      </div>
    </AbsoluteFill>
  );
};
