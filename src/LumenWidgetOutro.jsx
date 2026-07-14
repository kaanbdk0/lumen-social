import { AbsoluteFill, Img, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const GOLD = "#C9A961";
const GOLD_DARK = "#8B7355";
const BG_DARK = "#0A0E1A";
const BG_MID = "#111628";
const SERIF = "'Noto Serif', Georgia, serif";
const SANS = "'Noto Sans', -apple-system, 'Helvetica Neue', sans-serif";

const COPY = {
  en: { head: "Use your home screen wisely", accent: "Add the Lumen widget", sub: "A sage's wisdom, every day", badge: "Download on the App Store", card: "He who is brave is free.", author: "Seneca", widgetLabel: "LUMEN · WIDGET" },
  tr: { head: "Ana ekranını akıllıca kullan", accent: "Lumen widget'ını ekle", sub: "Her gün bir bilgeden ilham", badge: "App Store'dan İndir", card: "Cesur olan özgürdür.", author: "Seneca", widgetLabel: "LUMEN · WIDGET" },
  es: { head: "Aprovecha tu pantalla de inicio", accent: "Añade el widget de Lumen", sub: "La sabiduría de un sabio, cada día", badge: "Consíguelo en el App Store", card: "Quien es valiente es libre.", author: "Séneca", widgetLabel: "LUMEN · WIDGET" },
};

export const LumenWidgetOutro = ({ lang = "en" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = COPY[lang] || COPY.en;

  const fadeIn = (start, dur = 15) =>
    interpolate(frame, [start, start + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const iconSpring = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 90 } });
  const iconScale = interpolate(iconSpring, [0, 1], [0.7, 1]);
  const cardSpring = spring({ frame: frame - 34, fps, config: { damping: 16, stiffness: 90 } });
  const cardY = interpolate(cardSpring, [0, 1], [40, 0]);
  const badgePulse = 0.5 + Math.sin(frame * 0.12) * 0.5;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 32%, ${BG_MID} 0%, ${BG_DARK} 70%)` }}>
      {/* sparkles */}
      {[...Array(26)].map((_, i) => {
        const sx = (i * 197 + 53) % 1080;
        const sy = (i * 131 + 79) % 1920;
        const sz = 2 + (i % 3) * 1.4;
        const on = fadeIn(6 + (i % 8) * 2, 20);
        const tw = 0.4 + Math.sin(frame * 0.14 + i * 1.7) * 0.5;
        return <div key={i} style={{ position: "absolute", left: sx, top: sy, width: sz, height: sz, borderRadius: "50%", background: i % 3 === 0 ? GOLD : "#fff", opacity: on * tw * 0.7, boxShadow: `0 0 ${sz * 3}px ${i % 3 === 0 ? GOLD : "#fff"}` }} />;
      })}

      {/* app icon */}
      <div style={{ position: "absolute", top: 210, left: "50%", transform: `translateX(-50%) scale(${iconScale})`, opacity: fadeIn(4, 14) }}>
        <div style={{ width: 236, height: 236, borderRadius: 54, overflow: "hidden", boxShadow: `0 0 70px ${GOLD}45, 0 18px 50px rgba(0,0,0,0.5)` }}>
          <Img src={staticFile("lumen_appicon.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      </div>

      {/* Lumen wordmark */}
      <div style={{ position: "absolute", top: 470, width: "100%", textAlign: "center", opacity: fadeIn(18, 14) }}>
        <div style={{ fontFamily: SERIF, fontSize: 60, color: GOLD, letterSpacing: 8, textShadow: `0 0 40px ${GOLD}40` }}>Lumen</div>
      </div>

      {/* iOS-style medium widget mockup */}
      <div style={{ position: "absolute", top: 620, left: "50%", transform: `translateX(-50%) translateY(${cardY}px)`, opacity: cardSpring, width: 660, height: 300, borderRadius: 40, background: "linear-gradient(150deg, #161B2C 0%, #0E1220 100%)", border: `1.5px solid ${GOLD}45`, boxShadow: `0 0 60px ${GOLD}18, 0 20px 60px rgba(0,0,0,0.55)`, padding: 34, display: "flex", alignItems: "center", gap: 30 }}>
        <div style={{ width: 150, height: 150, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `2px solid ${GOLD}55`, background: "#0c0f1a" }}>
          <Img src={staticFile("bust_seneca.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: SANS, fontSize: 17, color: `${GOLD}cc`, letterSpacing: 3, marginBottom: 12 }}>{t.widgetLabel}</div>
          <div style={{ fontFamily: SERIF, fontSize: 33, color: "#fff", lineHeight: 1.3 }}>{t.card}</div>
          <div style={{ fontFamily: SERIF, fontSize: 22, color: GOLD, marginTop: 14 }}>— {t.author}</div>
        </div>
      </div>

      {/* headline + accent + sub */}
      <div style={{ position: "absolute", top: 1010, width: "100%", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div style={{ fontFamily: SANS, fontSize: 46, fontWeight: 700, color: "#fff", opacity: fadeIn(52, 14), letterSpacing: 0.3 }}>{t.head}</div>
        <div style={{ fontFamily: SANS, fontSize: 46, fontWeight: 700, color: GOLD, opacity: fadeIn(60, 14), textShadow: `0 0 30px ${GOLD}40` }}>{t.accent}</div>
        <div style={{ width: interpolate(fadeIn(72, 18), [0, 1], [0, 200]), height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}70, transparent)`, marginTop: 18, marginBottom: 14 }} />
        <div style={{ fontFamily: SERIF, fontSize: 30, color: "rgba(255,255,255,0.6)", opacity: fadeIn(78, 14) }}>{t.sub}</div>
      </div>

      {/* App Store badge (self-drawn) */}
      <div style={{ position: "absolute", bottom: 150, width: "100%", textAlign: "center", opacity: fadeIn(92, 16) }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 16, padding: "20px 34px", background: "#000", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 20, boxShadow: `0 0 ${40 * badgePulse}px ${GOLD}30` }}>
          <div style={{ fontFamily: "-apple-system, 'Helvetica Neue', sans-serif", fontSize: 52, color: "#fff", lineHeight: 1 }}>{""}</div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontFamily: SANS, fontSize: 16, color: "rgba(255,255,255,0.8)", letterSpacing: 0.5 }}>{lang === "tr" ? "İndir:" : lang === "es" ? "Disponible en" : "Download on the"}</div>
            <div style={{ fontFamily: SANS, fontSize: 34, fontWeight: 600, color: "#fff", marginTop: 2 }}>App Store</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
