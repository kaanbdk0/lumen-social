# Lumen Automation — Anayasa (Constitution)

The daily pipeline (`.github/workflows/daily-story.yml`) renders one quote video
per language and posts it to YouTube, Instagram and TikTok every day at 07:00 UTC.

These are the **invariants the automation must always uphold**. Most are enforced
in code by `scripts/validate-data.js` (run locally with `node scripts/validate-data.js`,
and automatically as the *“Validate data (constitution)”* CI step before every render).

## Rules

1. **Every figure has a bust image on disk.**
   For each entry in `data/figures.json`, `public/<bustImage>` must exist.
   This is exactly what broke on 2026-06-06: three female figures
   (`marie_curie`, `hypatia`, `cleopatra`) were added without their PNGs, so the
   day Marie Curie was selected, every language's render 404'd and the job produced
   **zero videos**. → enforced by validation + a render-time fallback to
   `bust_ancient_wisdom.png`.

2. **Every quote points to a real figure.**
   Each `quotes.json` entry's `figure_id` must resolve to a figure in `figures.json`.

3. **Every quote and figure has at least EN or TR text/name.**
   Missing per-language strings are warnings (the renderer falls back); missing
   *both* en and tr is a hard error.

4. **Every supported language has a locale block** in `data/locales.json`.
   Languages: `tr, en, ar, es, fr, de, ru, pt, it, hi`.

5. **Outro static busts exist.** `src/LumenQuoteVideo.jsx` hard-codes ~10 bust
   images in its end screen; they're listed in `REQUIRED_STATIC_ASSETS` and checked.

## Fail-loud, never fail-silent

The pipeline must **never march on emptiness**:

- `render-daily.js` exits non-zero if **0** videos were produced (instead of
  printing “Done!” and letting downstream steps run on nothing).
- A *“Verify rendered videos exist”* CI gate fails before any platform is touched
  if `out/<date>/` has no `.mp4`.
- The release-hosting step uses `set -euo pipefail` + `nullglob` and refuses to
  run on an empty video set.

## When you add a new figure or quote

1. Add the figure to `data/figures.json` **and** drop `public/bust_<key>.png`
   (1254×1254 PNG, same as the others — the iOS app's `Assets.xcassets` is the
   source of truth for the artwork).
2. Add quotes referencing the figure's `id`.
3. Run `node scripts/validate-data.js` — it must print **“Constitution upheld.”**
   before you commit. CI runs the same check and will block the daily run otherwise.
