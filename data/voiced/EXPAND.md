# Brief: grow one language's voiced reel queue from the Lumen library

Lumen posts one voiced reel per language every two days (Instagram, after Kaan approves it on
Telegram). Each reel: a short hook on screen, then a narrator reads a passage while the
sentences light up, then a one-line payoff. Read `README.md` in this folder first (item format and rules)
and look at the existing `<lang>.json` to match its voice, hooks and captions.

## Task
Write **32 new items** (EN: **40**) into `data/voiced/_new/<lang>.json` (a JSON array). Do not edit any other file.

Source: the Lumen library, `~/Developer/lumen/content/library/`
- non-EN: `pack_<lang>.json` (passages already translated into your language, or originals)
- EN: `source_stoics.json`, `source_east_west.json`, `source_europe.json` (field `text`, English)

For each item:
- `lib_id`: the library passage id. One item per passage; skip passages the existing queue already uses.
- `stanzas`: a **verbatim, contiguous excerpt** of that passage's text: copy the sentences
  exactly, in order, no skipped sentences in the middle, no edits. Split into 2–4 pages of 1–3 sentences
  (`mode: "prose"`). If the passage is verse (line breaks), use `mode: "poem"` with one verse line per string.
  The last page is ONE string: the strongest sentence. Since the excerpt is contiguous, choose a
  stretch that ENDS on its strongest sentence. Payoff ≤ 150 characters (ideally < 110).
- Spoken length ≤ 90 words (hi ≤ 110), ideally 45–80. It must stand on its own for a stranger
  scrolling Instagram: clear, quotable, emotionally true. Skip passages that need context.
- `hook` (≤ 45 chars, on screen 2.4 s): mix two styles as the existing queue does: a question to the
  viewer ("Fällt dir das Aufstehen schwer?") or "<Author> wrote this <N> years ago:" style.
  `hookSub`: "<Author> · <Work>" in your language.
- `poet` / `author` / `title`: author name and work title as the pack spells them (`title` = work).
- `reel_bg`: pick by mood: `bg/antik_canli/bg_0[0-4].jpg` (Greek/Roman), `bg/dogu_canli/…` (Lao Tzu,
  Buddha, Tagore), `bg/tasavvuf_canli/…` (Rumi, Khayyam, Gibran), `bg/modern_canli/…` (19th–20th c.
  Europe and America), `bg/ronesans_canli/…` (Montaigne, Pascal, La Rochefoucauld). The non-`_canli`
  folders (same names) and `tiktok/{friedrich_gezgin,friedrich_kesis,hayez_opucuk,klimt_opucuk,waterhouse_shalott}.jpg`
  are fine occasionally. Vary the image number.
- `caption`: exactly the existing pattern for this language: hook line, blank line, `Author · Work`,
  blank line, one question to the reader, blank line, the app line copied from an existing PROSE item
  (poem items use the poem app line), blank line, exactly 3 hashtags in your language. No em dashes.
- `source`: pack item's `source` field (EN: the source item's `edition`/`source`).
- `slug`: `<lang>_lib_<short>` in [a-z0-9_].

Variety: spread over at least 10 authors, max 5 items from one author, mix themes (love, loss,
courage, time, solitude, work, anger, death, joy). Interleave authors in the array order (it is the
posting order). Write in natural modern language for the hooks/questions; calm, literary, no hype.

## Validate (must pass before you finish)
`python3 ~/lumen-social/scripts/check_voiced.py ~/lumen-social/data/voiced/_new/<lang>.json <lang>`
Then read every item once more as a native speaker: does it work spoken aloud in 30–45 s? Replace weak ones.
Finish with a 3-line report: count, authors used, anything you were unsure about.
