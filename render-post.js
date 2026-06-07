// ─────────────────────────────────────────────────────────────────────────
// Lumen Reel post renderer.
//
// Picks a quote at RANDOM (deterministic seeded shuffle of the approved
// post-queue, so there are no repeats for a full cycle), renders a 9s vertical
// Reel for each language (themed paintings cross-fading behind bust + quote),
// and bakes in the rotating background music starting at its "drop" second.
//
// Writes out/posts/<date>/:
//   lumen_post_<date>_<lang>.mp4   — final reels (with music)
//   meta.json                      — chosen quote/figure + per-language captions
//
//   node render-post.js                 # today's post, all languages
//   node render-post.js 2026-06-09       # a specific date
//   node render-post.js 2026-06-09 --post 4 --langs tr,en
// ─────────────────────────────────────────────────────────────────────────
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { validateData } from "./scripts/validate-data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FFMPEG = process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";

const LANGUAGES = ["tr", "en", "ar", "es", "fr", "de", "ru", "pt", "it", "hi"];
const POST_START = "2026-06-07"; // day 0 of the every-2-days schedule
const REEL_SECONDS = 20;

const figures = JSON.parse(readFileSync(join(__dirname, "data/figures.json"), "utf8"));
const quotes = JSON.parse(readFileSync(join(__dirname, "data/quotes.json"), "utf8"));
const captions = JSON.parse(readFileSync(join(__dirname, "data/captions.json"), "utf8"));
const music = JSON.parse(readFileSync(join(__dirname, "data/music.json"), "utf8"));
const queue = JSON.parse(readFileSync(join(__dirname, "data/post-queue.json"), "utf8"));

const quoteById = {}; for (const q of quotes) quoteById[q.id] = q;
const figureById = {}; for (const f of figures) figureById[f.id] = f;

// Deterministic RNG so a given seed always yields the same shuffle/selection.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seed) {
  const a = arr.slice();
  const rng = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function postNumber(dateStr) {
  const start = new Date(POST_START + "T00:00:00Z");
  const cur = new Date(dateStr + "T00:00:00Z");
  return Math.max(0, Math.floor((cur - start) / (1000 * 60 * 60 * 24 * 2)));
}

function formatYear(year, lang) {
  if (year == null) return "?";
  if (year >= 0) return `${year}`;
  const abs = Math.abs(year);
  const s = { tr: `MÖ ${abs}`, en: `${abs} BC`, ar: `${abs} ق.م`, es: `${abs} a.C.`, fr: `${abs} av. J.-C.`, de: `${abs} v. Chr.`, ru: `${abs} до н.э.`, pt: `${abs} a.C.`, it: `${abs} a.C.`, hi: `${abs} ईसा पूर्व` };
  return s[lang] || `${abs} BC`;
}
function lifeSpan(f, lang) {
  if (f.birthYear == null && f.deathYear == null) return "";
  return `${formatYear(f.birthYear, lang)} – ${formatYear(f.deathYear, lang)}`;
}

function themeBackgrounds(theme) {
  const dir = join(__dirname, "public", "bg", theme);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.(jpg|jpeg|png)$/i.test(f)).sort().map((f) => `bg/${theme}/${f}`);
}

function composeCaption(figKey, lang, quoteText, figName) {
  const c = captions[figKey];
  if (!c) return `“${quoteText}” — ${figName}`;
  return `${c.bio[lang] || c.bio.en}\n\n“${quoteText}” — ${figName}\n\n${c.hashtags.join(" ")}`;
}

function main() {
  const args = process.argv.slice(2);
  const dateStr = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || new Date().toISOString().split("T")[0];
  const postOverride = args.includes("--post") ? Number(args[args.indexOf("--post") + 1]) : null;
  const langsArg = args.includes("--langs") ? args[args.indexOf("--langs") + 1].split(",") : LANGUAGES;

  // Preflight: uphold the constitution.
  const { errors } = validateData();
  if (errors.length) { console.error(`❌ Data validation failed:\n - ${errors.join("\n - ")}`); process.exit(1); }

  const n = postOverride != null ? postOverride : postNumber(dateStr);
  // RANDOM selection: shuffle the approved queue once (fixed seed) and walk it.
  const order = seededShuffle(queue.ids, 1337);
  const quoteId = order[n % order.length];
  const quote = quoteById[quoteId];
  const figure = figureById[quote.figure_id];
  const track = music.tracks[n % music.tracks.length];

  console.log(`\n✦ Lumen Reel — ${dateStr} (post #${n})`);
  console.log(`Figure: ${figure.key} | theme: ${figure.theme}`);
  console.log(`Quote: ${(quote.texts.en || quote.texts.tr || "").slice(0, 60)}`);
  console.log(`Music: ${track.file} @ ${track.startSec}s\n`);

  const backgrounds = themeBackgrounds(figure.theme);
  if (!backgrounds.length) { console.error(`❌ No backgrounds for theme ${figure.theme}`); process.exit(1); }

  let bustImage = figure.bustImage.endsWith(".png") ? figure.bustImage : figure.bustImage + ".png";
  if (!existsSync(join(__dirname, "public", bustImage))) bustImage = "bust_ancient_wisdom.png";

  const outDir = join(__dirname, "out", "posts", dateStr);
  mkdirSync(outDir, { recursive: true });
  const musicPath = join(__dirname, "public", "music", track.file);
  const hasMusic = existsSync(musicPath);

  const meta = { date: dateStr, postNumber: n, quoteId, figureKey: figure.key, theme: figure.theme, music: track.file, musicStartSec: track.startSec, captions: {}, titles: {}, langs: [] };
  let rendered = 0;

  for (const lang of langsArg) {
    const quoteText = quote.texts[lang] || quote.texts.en || quote.texts.tr;
    if (!quoteText) { console.log(`⚠ ${lang}: no text, skip`); continue; }
    const figName = figure.names[lang] || figure.names.en || figure.key;
    const props = {
      figureName: figName, quoteText, bustImage, lifeSpan: lifeSpan(figure, lang),
      handle: "@lumen.app", layout: "C", slotFrames: 9, backgrounds,
    };
    const silent = join(outDir, `_silent_${lang}.mp4`);
    const finalFile = join(outDir, `lumen_post_${dateStr}_${lang}.mp4`);
    const propsFile = join(outDir, `_props_${lang}.json`);
    try {
      writeFileSync(propsFile, JSON.stringify(props));
      console.log(`🎬 [${lang}] rendering reel...`);
      execSync(`npx remotion render src/index.js LumenReel "${silent}" --props="${propsFile}" --timeout=120000`, { cwd: __dirname, stdio: "pipe" });
      unlinkSync(propsFile);

      if (hasMusic) {
        console.log(`🎵 [${lang}] adding music ${track.file} @${track.startSec}s...`);
        const fadeOut = REEL_SECONDS - 0.6;
        execSync(
          `${FFMPEG} -y -i "${silent}" -ss ${track.startSec} -i "${musicPath}" ` +
          `-map 0:v:0 -map 1:a:0 -t ${REEL_SECONDS} -c:v copy -c:a aac -b:a 192k ` +
          `-af "afade=t=in:d=0.5,afade=t=out:st=${fadeOut}:d=0.6,volume=0.85" "${finalFile}"`,
          { stdio: "pipe" }
        );
        unlinkSync(silent);
      } else {
        execSync(`${FFMPEG} -y -i "${silent}" -c copy "${finalFile}"`, { stdio: "pipe" });
        unlinkSync(silent);
      }

      meta.captions[lang] = composeCaption(figure.key, lang, quoteText, figName);
      meta.langs.push(lang);
      rendered++;
      console.log(`✅ [${lang}] → ${finalFile}\n`);
    } catch (err) {
      console.error(`❌ [${lang}] failed: ${err.message}\n`);
    }
  }

  // YouTube title (EN): a short hook from the quote + figure.
  const enName = figure.names.en || figure.key;
  meta.titles.en = `${(quote.texts.en || "").slice(0, 80)} — ${enName} #shorts`;
  writeFileSync(join(outDir, "meta.json"), JSON.stringify(meta, null, 2));

  if (rendered === 0) { console.error(`\n❌ No reels rendered for ${dateStr}.`); process.exit(1); }
  console.log(`✦ Done! ${rendered}/${langsArg.length} reels in ${outDir}`);
}

main();
