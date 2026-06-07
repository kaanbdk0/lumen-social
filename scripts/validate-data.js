// ─────────────────────────────────────────────────────────────────────────
// Lumen automation "anayasa" (constitution) — as code.
//
// This is the single source of truth for the invariants the daily pipeline
// MUST uphold. If any of them is violated the data is broken and a render
// would silently produce 0 videos (or 404 on a missing asset). We fail LOUD
// and EARLY here instead of discovering it after a half-finished CI run.
//
// Run standalone:   node scripts/validate-data.js
// Or import:        import { validateData } from "./scripts/validate-data.js"
//
// See CONSTITUTION.md for the human-readable version of these rules.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC = join(ROOT, "public");

function themeImageCount(theme) {
  const dir = join(PUBLIC, "bg", theme);
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => /\.(jpg|jpeg|png)$/i.test(f)).length;
}

export const LANGUAGES = ["tr", "en", "ar", "es", "fr", "de", "ru", "pt", "it", "hi"];

// Bust images hard-coded in the outro of src/LumenQuoteVideo.jsx. They are not
// tied to the daily figure, so the data checks below would miss them — but a
// missing one still 404s and aborts every render. Keep this list in sync.
export const REQUIRED_STATIC_ASSETS = [
  "bust_seneca.png", "bust_confucius.png", "bust_plato.png", "bust_aristotle.png",
  "bust_buddha.png", "bust_einstein.png", "bust_lao_tzu.png", "bust_yunus_emre.png",
  "bust_hafiz.png", "bust_marcus_aurelius.png",
];

function bustFile(figure) {
  const img = figure.bustImage || "";
  return img.endsWith(".png") ? img : img + ".png";
}

/**
 * Validates figures/quotes/locales against the constitution.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateData() {
  const errors = [];
  const warnings = [];

  const figures = JSON.parse(readFileSync(join(ROOT, "data/figures.json"), "utf8"));
  const quotes = JSON.parse(readFileSync(join(ROOT, "data/quotes.json"), "utf8"));
  const locales = JSON.parse(readFileSync(join(ROOT, "data/locales.json"), "utf8"));
  // captions.json is optional for the legacy video pipeline but required for
  // the Reel post pipeline; validate it when present.
  let captions = null;
  try { captions = JSON.parse(readFileSync(join(ROOT, "data/captions.json"), "utf8")); } catch { /* absent */ }

  // Rule 1 — every language has a locale block.
  for (const lang of LANGUAGES) {
    if (!locales[lang]) errors.push(`locales.json: missing language "${lang}"`);
  }

  // Rule 2 — every figure is well-formed and its bust image exists on disk.
  const figureIds = new Set();
  for (const f of figures) {
    const label = f.key || f.id || "<unknown>";
    if (!f.id) errors.push(`figures.json: figure "${label}" has no id`);
    else figureIds.add(f.id);
    if (!f.bustImage) {
      errors.push(`figures.json: figure "${label}" has no bustImage`);
    } else if (!existsSync(join(PUBLIC, bustFile(f)))) {
      errors.push(`figures.json: figure "${label}" → public/${bustFile(f)} is MISSING`);
    }
    if (!f.names || !(f.names.en || f.names.tr)) {
      errors.push(`figures.json: figure "${label}" has no en/tr name`);
    } else {
      for (const lang of LANGUAGES) {
        if (!f.names[lang]) warnings.push(`figures.json: figure "${label}" missing name for "${lang}" (will fall back)`);
      }
    }
    // Every figure must declare a visual theme, and that theme must have at
    // least one background image. This is the "don't forget the new figure's
    // art" rule — a new figure with no theme/background fails the build here.
    if (!f.theme) {
      errors.push(`figures.json: figure "${label}" has no theme`);
    } else if (themeImageCount(f.theme) === 0) {
      errors.push(`figures.json: figure "${label}" → theme "${f.theme}" has no backgrounds in public/bg/${f.theme}/ (run: node scripts/fetch-backgrounds.js ${f.theme})`);
    }
    // Reel posts need a caption (bio in every language + hashtags) per figure.
    if (captions) {
      const c = captions[f.key];
      if (!c) {
        errors.push(`captions.json: figure "${label}" has no caption block`);
      } else {
        for (const lang of LANGUAGES) {
          if (!c.bio || !c.bio[lang]) errors.push(`captions.json: figure "${label}" missing ${lang} bio`);
          const tags = Array.isArray(c.hashtags) ? c.hashtags : c.hashtags?.[lang];
          if (!Array.isArray(tags) || tags.length === 0) errors.push(`captions.json: figure "${label}" missing ${lang} hashtags`);
        }
      }
    }
  }

  // Rule 3 — every quote resolves to a figure and has usable text.
  for (const q of quotes) {
    const label = q.id || "<unknown>";
    if (!q.figure_id || !figureIds.has(q.figure_id)) {
      errors.push(`quotes.json: quote "${label}" references unknown figure_id "${q.figure_id}"`);
    }
    if (!q.texts || !(q.texts.en || q.texts.tr)) {
      errors.push(`quotes.json: quote "${label}" has no en/tr text`);
    } else {
      for (const lang of LANGUAGES) {
        if (!q.texts[lang]) warnings.push(`quotes.json: quote "${label}" missing text for "${lang}" (will fall back)`);
      }
    }
  }

  // Rule 4 — static outro assets exist.
  for (const asset of REQUIRED_STATIC_ASSETS) {
    if (!existsSync(join(PUBLIC, asset))) errors.push(`public/${asset} is MISSING (used by outro)`);
  }

  return { errors, warnings };
}

// CLI entry point.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { errors, warnings } = validateData();
  if (warnings.length) {
    console.log(`⚠ ${warnings.length} warning(s):`);
    for (const w of warnings.slice(0, 30)) console.log(`   - ${w}`);
    if (warnings.length > 30) console.log(`   …and ${warnings.length - 30} more`);
  }
  if (errors.length) {
    console.error(`\n❌ Data validation FAILED — ${errors.length} error(s):`);
    for (const e of errors) console.error(`   - ${e}`);
    console.error(`\nFix these before rendering. See CONSTITUTION.md.`);
    process.exit(1);
  }
  console.log(`\n✅ Data validation passed. Constitution upheld.`);
}
