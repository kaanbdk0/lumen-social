import { execSync } from "child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";
import { validateData } from "./scripts/validate-data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Paths ──
const FFMPEG = process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";

// Last-resort bust used if a figure's image is somehow missing at render time.
// The preflight check below should catch this first; this only keeps the day's
// render alive instead of letting one bad asset abort every language.
const FALLBACK_BUST = "bust_ancient_wisdom.png";

// ── Config ──
const LANGUAGES = ["tr", "en", "ar", "es", "fr", "de", "ru", "pt", "it", "hi"];
const START_DATE = "2026-05-11";

// ── ElevenLabs ──
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ||
  readFileSync(join(__dirname, ".env"), "utf8").match(/ELEVENLABS_API_KEY=(.+)/)?.[1]?.trim();
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ||
  readFileSync(join(__dirname, ".env"), "utf8").match(/ELEVENLABS_VOICE_ID=(.+)/)?.[1]?.trim();
const ELEVENLABS_FEMALE_VOICE_ID = process.env.ELEVENLABS_FEMALE_VOICE_ID || "4RZ84U1b4WCqpu57LvIq";

// ── Load data ──
const figures = JSON.parse(readFileSync(join(__dirname, "data/figures.json"), "utf8"));
const quotes = JSON.parse(readFileSync(join(__dirname, "data/quotes.json"), "utf8"));
const locales = JSON.parse(readFileSync(join(__dirname, "data/locales.json"), "utf8"));

// ── djb2 stable hash (same as iOS app) ──
function stableHashBig(str) {
  let hash = BigInt(5381);
  for (const ch of Buffer.from(str, "utf8")) {
    hash = ((hash << BigInt(5)) + hash) + BigInt(ch);
    hash = hash & BigInt("0xFFFFFFFFFFFFFFFF");
  }
  return hash & BigInt("0x7FFFFFFFFFFFFFFF");
}

function dayNumber(dateStr) {
  const start = new Date(START_DATE);
  const current = new Date(dateStr);
  return Math.floor((current - start) / (1000 * 60 * 60 * 24)) + 1;
}

function formatYear(year, lang) {
  if (year === 0) return "";
  if (year >= 0) return `${year}`;
  const abs = Math.abs(year);
  const suffixes = {
    tr: `MÖ ${abs}`, en: `${abs} BC`, ar: `${abs} ق.م`,
    es: `${abs} a.C.`, fr: `${abs} av. J.-C.`, de: `${abs} v. Chr.`,
    ru: `${abs} до н.э.`, pt: `${abs} a.C.`, it: `${abs} a.C.`,
    hi: `${abs} ईसा पूर्व`,
  };
  return suffixes[lang] || `${abs} BC`;
}

function lifeSpan(figure, lang) {
  const birth = figure.birthYear != null ? formatYear(figure.birthYear, lang) : "?";
  const death = figure.deathYear != null ? formatYear(figure.deathYear, lang) : "?";
  if (!birth && !death) return "";
  return `${birth} – ${death}`;
}

function getDailyQuote(dateStr) {
  let hash = stableHashBig(dateStr);
  hash = (hash * BigInt(2654435761)) & BigInt("0x7FFFFFFFFFFFFFFF");
  const index = Number(hash % BigInt(quotes.length));
  const quote = quotes[index];
  const figure = figures.find((f) => f.id === quote.figure_id);
  return { quote, figure };
}

function getVoiceId(figure) {
  return figure.gender === "female" ? ELEVENLABS_FEMALE_VOICE_ID : ELEVENLABS_VOICE_ID;
}

// ── ElevenLabs TTS ──
function generateSpeech(text, outputPath, voiceId) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.7, similarity_boost: 0.8, style: 0.4 },
    });

    const req = https.request({
      hostname: "api.elevenlabs.io",
      path: `/v1/text-to-speech/${voiceId}`,
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        let errData = "";
        res.on("data", (d) => errData += d);
        res.on("end", () => reject(new Error(`ElevenLabs ${res.statusCode}: ${errData}`)));
        return;
      }
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        writeFileSync(outputPath, Buffer.concat(chunks));
        resolve(outputPath);
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Generate SFX (once per run) ──
function generateSFX(outDir) {
  const dronePath = join(outDir, "_sfx_drone.mp3");
  const shimmerPath = join(outDir, "_sfx_shimmer.mp3");
  const whooshPath = join(outDir, "_sfx_whoosh.mp3");

  if (!existsSync(dronePath)) {
    execSync(`${FFMPEG} -y -f lavfi -i "anoisesrc=d=11:c=pink:r=44100:a=0.02" -af "lowpass=f=120,highpass=f=30,afade=t=in:ss=0:d=2,afade=t=out:st=9:d=2" "${dronePath}"`, { stdio: "pipe" });
  }
  if (!existsSync(shimmerPath)) {
    execSync(`${FFMPEG} -y -f lavfi -i "sine=f=1200:d=3" -f lavfi -i "sine=f=1800:d=3" -f lavfi -i "sine=f=2400:d=3" -filter_complex "[0][1][2]amix=inputs=3:duration=longest,volume=0.03,afade=t=in:d=0.5,afade=t=out:st=1.5:d=1.5,aecho=0.8:0.7:40|60:0.3|0.2" "${shimmerPath}"`, { stdio: "pipe" });
  }
  if (!existsSync(whooshPath)) {
    execSync(`${FFMPEG} -y -f lavfi -i "anoisesrc=d=2:c=white:r=44100:a=0.08" -af "highpass=f=200,lowpass=f=3000,afade=t=in:d=0.3,afade=t=out:st=0.8:d=1.2,volume=0.15" "${whooshPath}"`, { stdio: "pipe" });
  }

  return { dronePath, shimmerPath, whooshPath };
}

// ── Merge video + voice + SFX ──
function mergeAudioVideo(videoPath, voicePath, sfx, finalPath) {
  execSync(`${FFMPEG} -y \
    -i "${videoPath}" \
    -i "${voicePath}" \
    -i "${sfx.dronePath}" \
    -i "${sfx.shimmerPath}" \
    -i "${sfx.whooshPath}" \
    -filter_complex "\
      [1:a]adelay=2500|2500,apad=whole_dur=15[voice];\
      [2:a]volume=0.4,apad=whole_dur=15[drone];\
      [3:a]adelay=2800|2800,apad=whole_dur=15[shimmer];\
      [4:a]adelay=8500|8500,apad=whole_dur=15[whoosh];\
      [voice][drone][shimmer][whoosh]amix=inputs=4:duration=longest:normalize=0,atrim=0:15[audio]" \
    -map 0:v -map "[audio]" \
    -c:v copy -c:a aac -t 15 \
    "${finalPath}"`, { stdio: "pipe", timeout: 30000 });
}

// ── Main ──
async function main() {
  const dateStr = process.argv[2] || new Date().toISOString().split("T")[0];
  const langsArg = process.argv[3];
  const targetLangs = langsArg ? langsArg.split(",") : LANGUAGES;

  // ── Preflight: uphold the constitution before doing any work ──
  const { errors, warnings } = validateData();
  if (warnings.length) console.log(`⚠ ${warnings.length} data warning(s) (non-fatal).`);
  if (errors.length) {
    console.error(`\n❌ Aborting render — data validation failed (${errors.length} error(s)):`);
    for (const e of errors) console.error(`   - ${e}`);
    process.exit(1);
  }

  const day = dayNumber(dateStr);
  const { quote, figure } = getDailyQuote(dateStr);

  console.log(`\n✦ Lumen Daily Render ✦`);
  console.log(`Date: ${dateStr} | Day #${day}`);
  console.log(`Figure: ${figure.key} (${figure.names.en || figure.names.tr})`);
  console.log(`Voice: ${figure.gender === "female" ? "female" : "male"}`);
  console.log(`Quote (TR): ${quote.texts.tr || "—"}`);
  console.log(`Quote (EN): ${quote.texts.en || "—"}`);
  console.log(`Languages: ${targetLangs.join(", ")}\n`);

  const outDir = join(__dirname, "out", dateStr);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // Resolve bust image with a fallback so a single missing asset never
  // aborts the render (preflight already guarantees it exists, but defense
  // in depth keeps production alive on unexpected data).
  let bustImage = figure.bustImage.endsWith(".png") ? figure.bustImage : figure.bustImage + ".png";
  if (!existsSync(join(__dirname, "public", bustImage))) {
    console.log(`⚠ Bust image ${bustImage} missing — falling back to ${FALLBACK_BUST}`);
    bustImage = FALLBACK_BUST;
  }

  // Generate SFX once
  console.log("🔊 Generating sound effects...");
  const sfx = generateSFX(outDir);
  console.log("✅ SFX ready\n");

  let rendered = 0;
  for (const lang of targetLangs) {
    const locale = locales[lang];
    if (!locale) { console.log(`⚠ Skipping ${lang}: no locale`); continue; }

    const quoteText = quote.texts[lang] || quote.texts.en || quote.texts.tr;
    if (!quoteText) { console.log(`⚠ Skipping ${lang}: no text`); continue; }

    const figureName = figure.names[lang] || figure.names.en || figure.key;
    const life = lifeSpan(figure, lang);

    const props = {
      figureName, quoteText,
      bustImage,
      lifeSpan: life, dayNumber: day,
      dayLabel: locale.dayLabel, slogan: locale.slogan,
      ctaText: locale.ctaText, teaserText: locale.teaserText,
    };

    const silentVideo = join(outDir, `_silent_${lang}.mp4`);
    const voiceFile = join(outDir, `_voice_${lang}.mp3`);
    const finalFile = join(outDir, `lumen_${dateStr}_${lang}.mp4`);

    try {
      // Step 1: Render silent video
      console.log(`🎬 [${lang}] Rendering video...`);
      const propsFile = join(outDir, `_props_${lang}.json`);
      writeFileSync(propsFile, JSON.stringify(props));
      execSync(
        `npx remotion render src/index.js LumenQuote "${silentVideo}" --props="${propsFile}"`,
        { cwd: __dirname, stdio: "pipe", timeout: 300000 }
      );
      unlinkSync(propsFile);

      // Step 2: Generate voice
      console.log(`🎤 [${lang}] Generating voice...`);
      const voiceId = getVoiceId(figure);
      await generateSpeech(quoteText, voiceFile, voiceId);

      // Step 3: Merge video + voice + SFX
      console.log(`🔀 [${lang}] Merging audio...`);
      mergeAudioVideo(silentVideo, voiceFile, sfx, finalFile);

      // Cleanup temp files
      unlinkSync(silentVideo);
      unlinkSync(voiceFile);

      rendered++;
      console.log(`✅ [${lang}] → ${finalFile}\n`);
    } catch (err) {
      console.error(`❌ [${lang}] failed: ${err.message}\n`);
    }
  }

  // Cleanup SFX
  [sfx.dronePath, sfx.shimmerPath, sfx.whooshPath].forEach((f) => {
    if (existsSync(f)) unlinkSync(f);
  });

  // Honest exit: if we produced nothing, the run FAILED — don't let the
  // pipeline march on to create empty releases and "succeed" on emptiness.
  if (rendered === 0) {
    console.error(`\n❌ No videos were rendered for ${dateStr}. Failing the job.`);
    process.exit(1);
  }

  console.log(`✦ Done! ${rendered}/${targetLangs.length} videos in: ${outDir}\n`);
}

main();
