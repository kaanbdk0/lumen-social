# Voiced reel queue — one file per language (`<lang>.json`)

Each file is a JSON array. The approval pipeline (`scripts/approval.py`) picks one
item per post day, voices it with ElevenLabs, renders `LumenPoemReel`, runs the
voice QA and sends it to Telegram for Kaan's approval.

```jsonc
{
  "slug": "marcus_sabah",            // unique within the file, [a-z0-9_]
  "mode": "poem" | "prose",          // poem = verse lines; prose = sentences flowing as a paragraph
  "poet": "Marcus Aurelius",         // short name (hook subtitle default)
  "author": "Marcus Aurelius",       // full name shown under the payoff and on the widget
  "title": "Kendime Düşünceler",     // work title shown on the widget card
  "hook": "Sabahları kalkmak zor mu geliyor?",   // on screen for the first 2.4 s, ≤ 45 chars
  "hookSub": "Marcus Aurelius · Kendime Düşünceler",  // optional, defaults to poet
  "stanzas": [["page 1 line", "..."], ["page 2 ..."], ["payoff — the LAST page is ONE line"]],
  "reel_bg": "bg/antik_canli/bg_00.jpg",  // any file under public/
  "caption": "full Instagram caption in this language",
  "source": "where the text comes from (edition / translation note)"
}
```

Rules
- Public domain only: author died 1955 or earlier. No living or copyrighted modern
  authors, no copyrighted translations (translate yourself from the original).
- Poems in the language they were written in are quoted **verbatim** from a reliable
  edition (Wikisource etc.). Excerpts are fine; never alter words.
- Spoken text ≤ ~90 words (≈ 45 s). Poem lines ≤ ~45 characters where possible.
- Every line string is spoken exactly as written (the timing alignment searches for
  it), so no stage directions, no brackets, no footnote marks.
- The last page holds a single line: the payoff, the strongest sentence.
- Captions: hook line first, then `Author · Title`, one question to the reader, the app
  line ("a poem/passage on your home screen every morning: Lumen (link in bio)" in the
  language), then exactly 3 hashtags. No em dashes. Calm, literary voice, no hype.
