"""Reel and story posting. Since 2026-11-07 fully automatic (`auto`, `auto-story`): render, voice
check, post what passes. The Telegram approval mode (`prepare`, `prepare-story`, `watch`) is kept
but no workflow runs it.

  python3 scripts/approval.py auto <date> [--langs tr,en]           # reels: render + QA + post
  python3 scripts/approval.py auto-story <date> [--langs tr,en]     # daily stories: render + QA + post
  python3 scripts/approval.py prepare <date> [--langs tr,en]        # reels: render + QA + send to Telegram
  python3 scripts/approval.py prepare-story <date> [--langs tr,en]  # daily stories: same, render-daily.js
  python3 scripts/approval.py watch [--minutes 330]                 # handle Kaan's button presses
  python3 scripts/approval.py render <lang> <slug> <out.mp4>        # local test render (no Telegram)

Each post day one item per language is taken from data/voiced/<lang>.json, voiced with
ElevenLabs (with timestamps), checked by speech-to-text against the text, rendered with
the LumenPoemReel composition and uploaded to the GitHub release `approve-<date>`.
Kaan gets one Telegram message per language with Paylaş / Yeniden seslendir /
Başka içerik / Bugün geç buttons. Nothing is posted without his press.

Daily stories (quote of the day, 15 s, render-daily.js) go the same way through the release
`story-approve-<date>`; Paylaş posts the Instagram story (EN also to YouTube Shorts).

State lives in git tags (atomic, visible): reel-posted-<date>-<lang>, reel-skip-<date>-<lang>,
story-posted-<date>-<lang>, story-skip-<date>-<lang>.
"""
import base64, difflib, hashlib, json, os, re, subprocess, sys, time, unicodedata, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date as Date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POST_START = "2026-06-07"
LANGS = ["tr", "en", "ar", "es", "fr", "de", "ru", "pt", "it", "hi"]
FLAG = {"tr": "🇹🇷", "en": "🇬🇧", "ar": "🇸🇦", "es": "🇪🇸", "fr": "🇫🇷", "de": "🇩🇪", "ru": "🇷🇺", "pt": "🇧🇷", "it": "🇮🇹", "hi": "🇮🇳"}
QA_MIN = 0.93          # speech-to-text vs. text similarity (letters only, accents folded)
QA_TRIES = 3

def _key():
    k = os.environ.get("ELEVENLABS_API_KEY")
    if not k and os.path.exists(f"{ROOT}/.env"):
        m = re.search(r"ELEVENLABS_API_KEY=(.+)", open(f"{ROOT}/.env").read()); k = m and m.group(1).strip()
    return k

# Per language: narrator (Microsoft Edge neural voice), spoken app plug, on-screen plug, IG handle.
# Spoken CTAs spell "Lumen" phonetically where the script differs, so the voice says it right.
def _plug(head_poem, head_prose, accent, badge, label_poem, label_prose):
    return {"poem": {"head": head_poem, "accent": accent, "badge": badge, "label": label_poem},
            "prose": {"head": head_prose, "accent": accent, "badge": badge, "label": label_prose}}

LOCALE = {
    "tr": {"voice": "tr-TR-AhmetNeural", "handle": "@lumen.bilgelik",   # Microsoft Edge
           "cta": {"poem": "Bu şiiri her sabah ana ekranında görmek için... Lumen.", "prose": "Bu satırları her sabah ana ekranında okumak için... Lumen."},
           "plug": _plug("Her sabah bir şiir,", "Her sabah bir pasaj,", "ana ekranında.", "App Store'da ücretsiz", "GÜNÜN ŞİİRİ", "GÜNÜN PASAJI")},
    "en": {"voice": "en-US-AndrewMultilingualNeural", "handle": "@lumen.wisdom",      # Microsoft Edge
           "cta": {"poem": "To see a poem like this on your home screen every morning... Lumen.", "prose": "To read lines like these on your home screen every morning... Lumen."},
           "plug": _plug("A poem every morning,", "A passage every morning,", "on your home screen.", "Free on the App Store", "POEM OF THE DAY", "PASSAGE OF THE DAY")},
    "ar": {"voice": "ar-SA-HamedNeural", "handle": "@lumen.hikma", "rtl": True,   # Microsoft Edge
           "cta": {"poem": "لترى قصيدةً كهذه على شاشتك الرئيسية كل صباح... لومِن.", "prose": "لتقرأ كلماتٍ كهذه على شاشتك الرئيسية كل صباح... لومِن."},
           "plug": _plug("كل صباح قصيدة،", "كل صباح نصّ،", "على شاشتك الرئيسية.", "مجاناً على App Store", "قصيدة اليوم", "نصّ اليوم")},
    "es": {"voice": "es-ES-AlvaroNeural", "handle": "@lumen.sabiduria",    # Microsoft Edge
           "cta": {"poem": "Para ver un poema así cada mañana en tu pantalla de inicio... Lumen.", "prose": "Para leer palabras así cada mañana en tu pantalla de inicio... Lumen."},
           "plug": _plug("Un poema cada mañana,", "Un pasaje cada mañana,", "en tu pantalla de inicio.", "Gratis en el App Store", "POEMA DEL DÍA", "PASAJE DEL DÍA")},
    "fr": {"voice": "fr-FR-HenriNeural", "handle": "@lumen.sagesse",      # Microsoft Edge
           "cta": {"poem": "Pour voir un poème comme celui-ci chaque matin sur ton écran d'accueil... Lumen.", "prose": "Pour lire des lignes comme celles-ci chaque matin sur ton écran d'accueil... Lumen."},
           "plug": _plug("Un poème chaque matin,", "Un texte chaque matin,", "sur ton écran d'accueil.", "Gratuit sur l'App Store", "POÈME DU JOUR", "TEXTE DU JOUR")},
    "de": {"voice": "de-DE-ConradNeural", "handle": "@lumen.weisheit",     # Microsoft Edge
           "cta": {"poem": "Damit du jeden Morgen ein Gedicht wie dieses auf deinem Startbildschirm siehst... Lumen.", "prose": "Damit du jeden Morgen Zeilen wie diese auf deinem Startbildschirm liest... Lumen."},
           "plug": _plug("Jeden Morgen ein Gedicht,", "Jeden Morgen ein Gedanke,", "auf deinem Startbildschirm.", "Kostenlos im App Store", "GEDICHT DES TAGES", "TEXT DES TAGES")},
    "ru": {"voice": "ru-RU-DmitryNeural", "handle": "@lumen.mudrost",      # Microsoft Edge
           "cta": {"poem": "Чтобы каждое утро видеть такие стихи на главном экране... Люмен.", "prose": "Чтобы каждое утро читать такие строки на главном экране... Люмен."},
           "plug": _plug("Каждое утро стихи,", "Каждое утро мысль,", "на главном экране.", "Бесплатно в App Store", "СТИХИ ДНЯ", "ТЕКСТ ДНЯ")},
    "pt": {"voice": "pt-BR-AntonioNeural", "handle": "@lumen.sabedoria",    # Microsoft Edge
           "cta": {"poem": "Para ver um poema assim toda manhã na sua tela inicial... Lumen.", "prose": "Para ler palavras assim toda manhã na sua tela inicial... Lumen."},
           "plug": _plug("Um poema toda manhã,", "Um trecho toda manhã,", "na sua tela inicial.", "Grátis na App Store", "POEMA DO DIA", "TRECHO DO DIA")},
    "it": {"voice": "it-IT-DiegoNeural", "handle": "@lumen.saggezza",     # Microsoft Edge
           "cta": {"poem": "Per vedere una poesia così ogni mattina sulla tua schermata Home... Lumen.", "prose": "Per leggere parole così ogni mattina sulla tua schermata Home... Lumen."},
           "plug": _plug("Una poesia ogni mattina,", "Un pensiero ogni mattina,", "sulla tua schermata Home.", "Gratis su App Store", "POESIA DEL GIORNO", "PENSIERO DEL GIORNO")},
    "hi": {"voice": "hi-IN-MadhurNeural", "handle": "@lumen.vidya",        # Microsoft Edge
           "cta": {"poem": "ऐसी कविता हर सुबह अपनी होम स्क्रीन पर देखने के लिए... लूमेन।", "prose": "ऐसे शब्द हर सुबह अपनी होम स्क्रीन पर पढ़ने के लिए... लूमेन।"},
           "plug": _plug("हर सुबह एक कविता,", "हर सुबह एक विचार,", "आपकी होम स्क्रीन पर।", "App Store पर मुफ़्त", "आज की कविता", "आज का विचार")},
}

def log(*a): print(*a, flush=True)
def sh(cmd, **kw): return subprocess.run(cmd, check=True, **kw)
def probe(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                                capture_output=True, text=True).stdout.strip())

def post_number(d):
    return (Date.fromisoformat(d) - Date.fromisoformat(POST_START)).days // 2

def queue(lang):
    p = f"{ROOT}/data/voiced/{lang}.json"
    return json.load(open(p)) if os.path.exists(p) else []

# The queues were reordered and grown for this post day, which takes item 0.
ROTATION_START = "2026-10-29"

def pick(lang, d, k=0):
    q = queue(lang)
    return q[(post_number(d) - post_number(ROTATION_START) + k) % len(q)] if q else None

# ─── ElevenLabs ──────────────────────────────────────────────────────────────
def _el(path, body):
    req = urllib.request.Request(f"https://api.elevenlabs.io{path}", data=json.dumps(body).encode(),
                                 headers={"xi-api-key": _key(), "Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=180)

# ─── Edge TTS (Microsoft neural voices, free, no key) ────────────────────────
# Each line is voiced on its own and joined with short pauses, so the line timing is exact.
EDGE = os.environ.get("EDGE_TTS", "edge-tts")

def edge(text, voice, rate, path):
    r = subprocess.run([EDGE, "--voice", voice, f"--rate={rate}", "--text", text, "--write-media", path], capture_output=True, text=True)
    if r.returncode or not os.path.exists(path): raise RuntimeError(f"edge-tts: {(r.stderr or '')[-300:]}")
    return path

def tts(stanzas, voice, work, prose):
    pause_line, pause_stanza, rate = (0.25, 0.7, "-5%") if prose else (0.45, 0.6, "-8%")
    parts, out, t = [], [], 0.0
    def silence(sec):
        f = f"{work}_sil{int(sec * 1000)}.wav"
        if not os.path.exists(f): sh(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", str(sec), f])
        return f
    for si, st in enumerate(stanzas):
        row = []
        for li, line in enumerate(st):
            mp3 = edge(line, voice, rate, f"{work}_{si}_{li}.mp3"); wav = mp3[:-4] + ".wav"
            sh(["ffmpeg", "-y", "-loglevel", "error", "-i", mp3, "-ar", "24000", "-ac", "1", wav])
            d = probe(wav); row.append({"text": line, "start": round(t, 2), "end": round(t + d, 2)}); parts.append(wav); t += d
            gap = pause_line if li < len(st) - 1 else pause_stanza
            if not (si == len(stanzas) - 1 and li == len(st) - 1): parts.append(silence(gap)); t += gap
        out.append(row)
    lst = f"{work}_list.txt"; open(lst, "w").write("".join(f"file '{os.path.abspath(x)}'\n" for x in parts))
    sh(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c:a", "libmp3lame", "-b:a", "192k", f"{work}.mp3"])
    audio = open(f"{work}.mp3", "rb").read()
    for f in set(parts) | {lst, f"{work}.mp3"} | {f"{work}_{si}_{li}.mp3" for si, st in enumerate(stanzas) for li in range(len(st))}:
        if os.path.exists(f): os.remove(f)
    return audio, out

def _letters(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if c.isalpha() and not unicodedata.combining(c))

def qa(timing):
    """Edge voices read the text as given (no invented words like the generative voice), so the
    check is mechanical: every line got audio, at a plausible speaking rate."""
    problems = []
    for row in timing:
        for l in row:
            d = l["end"] - l["start"]; n = len(_letters(l["text"])) or 1
            if d < 0.3 or n / d > 30 or n / d < 2: problems.append(f"satır sesi şüpheli: {l['text'][:30]}… ({d:.1f} sn)")
    return {"score": 0.0 if problems else 1.0, "tail": 0.0, "longest": 0.0, "problems": problems}

def cta_audio(voice, lang, mode):
    path = f"{ROOT}/public/reel/cta_{voice}_{lang}_{mode}.mp3"
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        edge(LOCALE[lang]["cta"][mode], voice, "-5%", path)
    return os.path.relpath(path, f"{ROOT}/public"), probe(path)

# ─── Render ──────────────────────────────────────────────────────────────────
def render(lang, item, out_mp4, variant=0):
    """Voice (Edge TTS, line by line) + check + Remotion render + loudnorm. Returns the check report."""
    loc, mode = LOCALE[lang], item.get("mode", "poem")
    voice = loc["voice"]
    stanzas = item["stanzas"]
    os.makedirs(f"{ROOT}/public/reel", exist_ok=True)
    tag = f"{lang}_{item['slug']}"
    path = f"{ROOT}/public/reel/{tag}.mp3"
    for attempt in range(QA_TRIES):                   # retries only cover network hiccups
        try:
            audio, timing = tts(stanzas, voice, f"{ROOT}/public/reel/_{tag}", mode == "prose"); break
        except Exception as e:
            log(f"  [{lang}] take {attempt+1}: {e}"); time.sleep(5)
    else:
        raise RuntimeError("no usable take")
    open(path, "wb").write(audio)
    rep = qa(timing); rep["attempts"] = attempt + 1
    log(f"  [{lang}] voice: {rep['problems'] or 'OK'}")
    cta, cta_sec = cta_audio(voice, lang, mode)
    props = {"stanzas": timing, "voice": os.path.relpath(path, f"{ROOT}/public"), "bg": item["reel_bg"], "hook": item["hook"],
             "hookSub": item.get("hookSub", item["poet"]), "title": item["title"], "author": item.get("author", item["poet"]),
             "handle": loc["handle"], "plug": loc["plug"][mode], "prose": mode == "prose", "rtl": bool(loc.get("rtl")),
             "cta": cta, "ctaSec": cta_sec}
    pf = f"{ROOT}/out/_props_{tag}.json"; os.makedirs(f"{ROOT}/out", exist_ok=True)
    json.dump(props, open(pf, "w"), ensure_ascii=False)
    raw = out_mp4 + ".raw.mp4"
    sh(["npx", "remotion", "render", "src/index.js", "LumenPoemReel", raw, f"--props={pf}", "--timeout=300000"],
       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    sh(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out_mp4])
    for f in (raw, pf): os.remove(f)
    return rep

# ─── GitHub (release = hosting, tags = state) ───────────────────────────────
def gh(*args, check=True):
    return subprocess.run(["gh", *args], capture_output=True, text=True, check=check, cwd=ROOT)

def asset_name(d, lang): return f"lumen_post_{d}_{lang}.mp4"
def video_url(d, lang):
    return f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/releases/download/approve-{d}/{asset_name(d, lang)}"

def upload(d, files):
    gh("release", "create", f"approve-{d}", "--title", f"Onay bekleyen reels {d}", "--notes", "Telegram onayı bekleyen reels. Otomatik silinir.", check=False)
    gh("release", "upload", f"approve-{d}", *files, "--clobber")

def tags(prefix):
    r = gh("api", f"repos/{os.environ['GITHUB_REPOSITORY']}/git/matching-refs/tags/{prefix}", "--paginate", "-q", ".[].ref", check=False)
    return {l[len("refs/tags/"):] for l in r.stdout.split()}

def mark(tag_name):
    """Record a decision as a tag through the API (no git credentials or local tag state involved)."""
    repo = os.environ["GITHUB_REPOSITORY"]
    sha = gh("api", f"repos/{repo}/commits/HEAD", "-q", ".sha").stdout.strip()
    r = gh("api", f"repos/{repo}/git/refs", "-f", f"ref=refs/tags/{tag_name}", "-f", f"sha={sha}", check=False)
    if r.returncode != 0 and "already exists" not in r.stdout + r.stderr:
        raise RuntimeError(f"tag {tag_name}: {(r.stdout + r.stderr)[-300:]}")

def resolved(d, lang, have=None, kind="reel"):
    have = have if have is not None else tags(f"{kind}-")
    return f"{kind}-posted-{d}-{lang}" in have or f"{kind}-skip-{d}-{lang}" in have

# ─── Telegram ────────────────────────────────────────────────────────────────
def tg(method, **params):
    tok = os.environ["TELEGRAM_BOT_TOKEN"]
    body = json.dumps(params).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{tok}/{method}", data=body, headers={"Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=70))
    except urllib.error.HTTPError as e:
        return json.loads(e.read() or b"{}")

def tg_video(path, caption, keyboard):
    tok = os.environ["TELEGRAM_BOT_TOKEN"]
    # Without explicit size + thumbnail Telegram guesses the aspect and shows the 9:16 reel squashed.
    thumb = path + ".thumb.jpg"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "1", "-i", path, "-frames:v", "1", "-vf", "scale=320:-2", thumb])
    out = subprocess.run(["curl", "-s", "-F", f"chat_id={os.environ['TELEGRAM_CHAT_ID']}", "-F", f"video=@{path}",
                          "-F", "width=1080", "-F", "height=1920", "-F", f"duration={round(probe(path))}",
                          "-F", f"thumbnail=@{thumb}",
                          "-F", "supports_streaming=true", "-F", f"caption={caption}",
                          "-F", f"reply_markup={json.dumps({'inline_keyboard': keyboard})}",
                          f"https://api.telegram.org/bot{tok}/sendVideo"], capture_output=True, text=True, timeout=300).stdout
    return json.loads(out or "{}")

def say(text, **kw):
    return tg("sendMessage", chat_id=os.environ["TELEGRAM_CHAT_ID"], text=text, disable_web_page_preview=True, **kw)

def keyboard(d, lang, k, v):
    return [[{"text": "✅ Paylaş", "callback_data": f"ok|{d}|{lang}"},
             {"text": "🔁 Yeniden seslendir", "callback_data": f"redo|{d}|{lang}|{k}|{v + 1}"}],
            [{"text": "⏭ Başka içerik", "callback_data": f"next|{d}|{lang}|{k + 1}"},
             {"text": "❌ Bugün geç", "callback_data": f"skip|{d}|{lang}"}]]

def preview_text(d, lang, item, rep, caption):
    qa_line = ("🎙 Ses kontrolü: %{:.0f} ✓".format(rep["score"] * 100) if not rep["problems"]
               else "⚠️ Ses kontrolü: " + "; ".join(rep["problems"]) + " — dikkatli dinle")
    head = f"{FLAG[lang]} {lang.upper()} · {item.get('author', item['poet'])} · {item['title']}\n{qa_line}\n\n"
    return (head + caption)[:1020]

def send_preview(d, lang, item, rep, mp4, k, v):
    r = tg_video(mp4, preview_text(d, lang, item, rep, item["caption"]), keyboard(d, lang, k, v))
    if not r.get("ok"): log(f"  [{lang}] telegram: {r}")
    return r

# ─── Steps ───────────────────────────────────────────────────────────────────
def build_one(d, lang, k=0, v=0):
    """Render + upload one language. Returns (item, report, mp4) or raises."""
    item = pick(lang, d, k)
    if not item: raise RuntimeError("bu dil için içerik kuyruğu yok")
    mp4 = f"{ROOT}/out/approve/{d}/{asset_name(d, lang)}"; os.makedirs(os.path.dirname(mp4), exist_ok=True)
    rep = render(lang, item, mp4, v)
    meta = {"date": d, "lang": lang, "slug": item["slug"], "k": k, "v": v, "caption": item["caption"],
            "title": f"{item['title']} · {item.get('author', item['poet'])} #shorts"[:100], "qa": {x: rep[x] for x in ("score", "tail", "longest", "problems", "attempts")}}
    mj = f"{ROOT}/out/approve/{d}/{lang}.json"; json.dump(meta, open(mj, "w"), ensure_ascii=False, indent=1)
    upload(d, [mp4, mj])
    return item, rep, mp4

def prepare(d, langs):
    say(f"🌙 Lumen · {d} reel'leri hazırlanıyor ({len(langs)} dil). Her biri hazır oldukça buraya gelecek.")
    ok = []
    for lang in langs:
        if resolved(d, lang): log(f"[{lang}] already done today"); continue
        try:
            item, rep, mp4 = build_one(d, lang)
            send_preview(d, lang, item, rep, mp4, 0, 0); ok.append(lang)
        except Exception as e:
            log(f"[{lang}] ✗ {e!r}"[:400]); say(f"{FLAG[lang]} {lang.upper()} hazırlanamadı: {str(e)[:200]}")
    if ok:
        say(f"Hazır: {', '.join(FLAG[l] for l in ok)}\nTek tek onaylayabilir ya da hepsini birden paylaşabilirsin.",
            reply_markup={"inline_keyboard": [[{"text": f"✅ Kalanların hepsini paylaş ({len(ok)})", "callback_data": f"okall|{d}"}]]})

ENV_READY = False
def ensure_render_env():
    """The watcher only installs the heavy render stack when a re-render is requested."""
    global ENV_READY
    if ENV_READY or not os.environ.get("CI"): ENV_READY = True; return
    log("installing render environment…")
    sh(["bash", "-c", "sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg fonts-noto-core fonts-noto-extra fonts-noto-cjk fonts-noto-color-emoji >/dev/null && npm ci --silent && npx remotion browser ensure"], cwd=ROOT)
    ENV_READY = True

def fetch_meta(d, lang):
    dest = f"{ROOT}/out/approve/{d}"; os.makedirs(dest, exist_ok=True)
    gh("release", "download", f"approve-{d}", "-p", f"{lang}.json", "-D", dest, "--clobber")
    return json.load(open(f"{dest}/{lang}.json"))

def post(d, langs):
    """Post the given languages of one day to Instagram (+ EN to YouTube). Returns {lang: ok}."""
    metas = {l: fetch_meta(d, l) for l in langs}
    pdir = f"{ROOT}/out/posts/{d}"; os.makedirs(pdir, exist_ok=True)
    meta = {"date": d, "figureKey": ",".join(m["slug"] for m in metas.values()), "langs": list(langs),
            "captions": {l: m["caption"] for l, m in metas.items()}, "titles": {l: m["title"] for l, m in metas.items()}}
    json.dump(meta, open(f"{pdir}/meta.json", "w"), ensure_ascii=False)
    env = dict(os.environ, VIDEO_BASE_URL=f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/releases/download/approve-{d}")
    r = subprocess.run(["node", "scripts/post-reel-instagram.js", d], cwd=ROOT, env=env, capture_output=True, text=True)
    log(r.stdout[-3000:], r.stderr[-2000:])
    result = {l: bool(re.search(rf"\[{l}\] ✅", r.stdout)) for l in langs}
    if result.get("en"):
        gh("release", "download", f"approve-{d}", "-p", asset_name(d, "en"), "-D", pdir, "--clobber", check=False)
        y = subprocess.run(["node", "scripts/post-reel-youtube.js", d], cwd=ROOT, capture_output=True, text=True)
        log(y.stdout[-1500:], y.stderr[-800:])
    for l, good in result.items():
        if good: mark(f"reel-posted-{d}-{l}")
    return result

# ─── Daily stories ───────────────────────────────────────────────────────────
def story_rel(d): return f"story-approve-{d}"
def story_asset(d, lang): return f"lumen_{d}_{lang}.mp4"   # the name post-instagram.js expects

def daily_quote(d, lang):
    """Same pick as render-daily.js getDailyQuote: djb2 over the date, then a Knuth multiply."""
    M = 0x7FFFFFFFFFFFFFFF
    h = 5381
    for b in d.encode(): h = ((h << 5) + h + b) & 0xFFFFFFFFFFFFFFFF
    h = ((h & M) * 2654435761) & M
    quotes = json.load(open(f"{ROOT}/data/quotes.json")); figures = json.load(open(f"{ROOT}/data/figures.json"))
    q = quotes[h % len(quotes)]; f = next(x for x in figures if x["id"] == q["figure_id"])
    t = q["texts"]
    return t.get(lang) or t.get("en") or t.get("tr"), f["names"].get(lang) or f["names"].get("en") or f["key"]

def story_qa(mp4, text, lang):
    """render-daily.js already refuses a quote too long for the 15 s story; here: is the voice there?"""
    r = subprocess.run(["ffmpeg", "-i", mp4, "-vn", "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True)
    m = re.search(r"mean_volume: (-?[\d.]+) dB", r.stderr); vol = float(m.group(1)) if m else -99
    return {"score": 1.0 if vol > -45 else 0.0, "problems": [] if vol > -45 else [f"ses yok gibi ({vol} dB)"]}

def build_story(d, lang, v=0):
    """render-daily.js for one language (a fresh voice take each run), best of QA_TRIES, uploaded."""
    text, name = daily_quote(d, lang)
    out = f"{ROOT}/out/{d}/{story_asset(d, lang)}"
    best = None
    for attempt in range(QA_TRIES):
        r = subprocess.run(["node", "render-daily.js", d, lang], cwd=ROOT, capture_output=True, text=True)
        if r.returncode or not os.path.exists(out):
            log(f"  [{lang}] story render failed: {(r.stdout + r.stderr)[-400:]}"); continue
        rep = story_qa(out, text, lang)
        log(f"  [{lang}] story take {attempt+1}: %{rep['score']*100:.1f} {rep['problems'] or 'OK'}")
        take = f"{out}.take{attempt}.mp4"; os.replace(out, take)
        if best is None or rep["score"] > best[1]["score"]: best = (take, rep)
        if not rep["problems"]: break
    if best is None: raise RuntimeError("hikâye render edilemedi")
    os.replace(best[0], out)
    for a in range(QA_TRIES):
        if os.path.exists(f"{out}.take{a}.mp4"): os.remove(f"{out}.take{a}.mp4")
    rep = dict(best[1], attempts=attempt + 1)
    meta = {"date": d, "lang": lang, "v": v, "figure": name, "text": text, "qa": {x: rep[x] for x in ("score", "problems", "attempts")}}
    mj = f"{ROOT}/out/{d}/{lang}.json"; json.dump(meta, open(mj, "w"), ensure_ascii=False, indent=1)
    gh("release", "create", story_rel(d), "--title", f"Onay bekleyen hikâyeler {d}", "--notes", "Telegram onayı bekleyen günlük hikâyeler. Otomatik silinir.", check=False)
    gh("release", "upload", story_rel(d), out, mj, "--clobber")
    return meta, rep, out

def story_keyboard(d, lang, v):
    return [[{"text": "✅ Paylaş", "callback_data": f"sok|{d}|{lang}"},
             {"text": "🔁 Yeniden seslendir", "callback_data": f"sredo|{d}|{lang}|{v + 1}"}],
            [{"text": "❌ Bugün geç", "callback_data": f"sskip|{d}|{lang}"}]]

def send_story_preview(d, lang, meta, rep, mp4, v):
    qa_line = ("🎙 Ses kontrolü: %{:.0f} ✓".format(rep["score"] * 100) if not rep["problems"]
               else "⚠️ Ses kontrolü: " + "; ".join(rep["problems"]) + " — dikkatli dinle")
    cap = f"📱 Hikâye · {FLAG[lang]} {lang.upper()} · {meta['figure']}\n{qa_line}\n\n“{meta['text']}”"
    r = tg_video(mp4, cap[:1020], story_keyboard(d, lang, v))
    if not r.get("ok"): log(f"  [{lang}] telegram: {r}")

def prepare_story(d, langs):
    say(f"☀️ Lumen · {d} hikâyeleri hazırlanıyor ({len(langs)} dil).")
    ok = []
    for lang in langs:
        if resolved(d, lang, kind="story"): continue
        try:
            meta, rep, mp4 = build_story(d, lang)
            send_story_preview(d, lang, meta, rep, mp4, 0); ok.append(lang)
        except Exception as e:
            log(f"[{lang}] ✗ {e!r}"[:400]); say(f"{FLAG[lang]} {lang.upper()} hikâyesi hazırlanamadı: {str(e)[:200]}")
    if ok:
        say(f"Hikâyeler hazır: {', '.join(FLAG[l] for l in ok)}\nHikâyeler 24 saat kalır; gün içinde onaylaman yeterli.",
            reply_markup={"inline_keyboard": [[{"text": f"✅ Kalan hikâyelerin hepsini paylaş ({len(ok)})", "callback_data": f"sokall|{d}"}]]})

def post_story(d, langs):
    """Instagram story for each language (+ EN to YouTube Shorts). Returns {lang: ok}."""
    accounts = [a for a in json.loads(os.environ.get("INSTAGRAM_ACCOUNTS", "[]")) if a.get("lang") in langs]
    env = dict(os.environ, INSTAGRAM_ACCOUNTS=json.dumps(accounts),
               VIDEO_BASE_URL=f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/releases/download/{story_rel(d)}")
    r = subprocess.run(["node", "scripts/post-instagram.js", d], cwd=ROOT, env=env, capture_output=True, text=True)
    log(r.stdout[-3000:], r.stderr[-2000:])
    result = {l: bool(re.search(rf"\[{l}\] ✅", r.stdout)) for l in langs}
    if result.get("en"):
        gh("release", "download", story_rel(d), "-p", story_asset(d, "en"), "-D", f"{ROOT}/out/{d}", "--clobber", check=False)
        y = subprocess.run(["node", "scripts/post-youtube.js", d], cwd=ROOT, capture_output=True, text=True)
        log(y.stdout[-1500:], y.stderr[-800:])
    for l, good in result.items():
        if good: mark(f"story-posted-{d}-{l}")
    return result

def release_langs(rel):
    r = gh("release", "view", rel, "--json", "assets", check=False)
    return [a["name"][:-5] for a in json.loads(r.stdout or '{"assets":[]}')["assets"] if a["name"].endswith(".json")]

def handle_story(act, parts, msg):
    d = parts[1]; lang = parts[2] if len(parts) > 2 else None
    have = tags("story-")
    if act == "sok":
        if resolved(d, lang, have, "story"): return close_buttons(msg, "Bu zaten sonuçlanmış.")
        res = post_story(d, [lang])
        close_buttons(msg, f"✅ {FLAG[lang]} hikâye paylaşıldı." if res[lang] else f"❌ {FLAG[lang]} hikâye paylaşılamadı, Actions kaydına bak. Tekrar denemek için yeniden bas.")
        if not res[lang]: tg("editMessageReplyMarkup", chat_id=msg["chat"]["id"], message_id=msg["message_id"], reply_markup={"inline_keyboard": story_keyboard(d, lang, 0)})
    elif act == "sokall":
        todo = [l for l in release_langs(story_rel(d)) if not resolved(d, l, have, "story")]
        if not todo: return close_buttons(msg, "Paylaşılacak bekleyen hikâye kalmadı.")
        res = post_story(d, todo)
        good = [FLAG[l] for l, v in res.items() if v]; bad = [FLAG[l] for l, v in res.items() if not v]
        close_buttons(msg, f"✅ Hikâyeler paylaşıldı: {' '.join(good) or '-'}" + (f"\n❌ Olmadı: {' '.join(bad)}" if bad else ""))
    elif act == "sskip":
        mark(f"story-skip-{d}-{lang}"); close_buttons(msg, f"{FLAG[lang]} bugünkü hikâye paylaşılmayacak.")
    elif act == "sredo":
        if resolved(d, lang, have, "story"): return close_buttons(msg, "Bu zaten sonuçlanmış.")
        v = int(parts[3])
        close_buttons(msg, "🔁 Hikâye yeniden seslendiriliyor, birkaç dakika…")
        ensure_render_env()
        try:
            meta, rep, mp4 = build_story(d, lang, v)
            send_story_preview(d, lang, meta, rep, mp4, v)
        except Exception as e:
            say(f"{FLAG[lang]} hikâye yeniden hazırlanamadı: {str(e)[:200]}")

# ─── Fully automatic (no Telegram) ───────────────────────────────────────────
AUTO_ITEMS = 3   # a language whose voice fails QA on every take moves on to the next queue item, up to this many

def auto_reels(d, langs):
    """Render + voice-check each language and post the ones that pass. A language whose voice
    fails the check on every take and every tried item is skipped that day, never posted."""
    have = tags("reel-"); ready = []
    for lang in langs:
        if resolved(d, lang, have): log(f"[{lang}] already done"); continue
        for k in range(AUTO_ITEMS):
            try:
                item, rep, _ = build_one(d, lang, k)
            except Exception as e:
                log(f"[{lang}] item {k}: ✗ {e!r}"[:400]); continue
            if not rep["problems"]:
                log(f"[{lang}] {item['slug']} ✓ %{rep['score']*100:.0f}"); ready.append(lang); break
            log(f"[{lang}] {item['slug']} voice check failed: {rep['problems']}")
        else:
            log(f"[{lang}] skipped today: no item passed the voice check")
    if ready:
        res = post(d, ready)
        log("posted:", [l for l, ok in res.items() if ok], "failed:", [l for l, ok in res.items() if not ok])
    clean_old_releases()

def auto_stories(d, langs):
    have = tags("story-"); ready = []
    for lang in langs:
        if resolved(d, lang, have, "story"): log(f"[{lang}] already done"); continue
        try:
            meta, rep, _ = build_story(d, lang)
        except Exception as e:
            log(f"[{lang}] ✗ {e!r}"[:400]); continue
        if rep["problems"]: log(f"[{lang}] skipped today: voice check failed {rep['problems']}"); continue
        ready.append(lang)
    if ready:
        res = post_story(d, ready)
        log("posted:", [l for l, ok in res.items() if ok], "failed:", [l for l, ok in res.items() if not ok])
    clean_old_releases()

def clean_old_releases():
    """Hosting releases are only needed until Instagram has fetched the videos."""
    rel = gh("release", "list", "--limit", "50", "--json", "tagName", check=False)
    for r in json.loads(rel.stdout or "[]"):
        t = r["tagName"]
        if (t.startswith("approve-") or t.startswith("story-approve-")) and (Date.today() - Date.fromisoformat(t[-10:])).days > 2:
            gh("release", "delete", t, "-y", "--cleanup-tag", check=False)

def close_buttons(msg, note):
    if not msg: return
    tg("editMessageReplyMarkup", chat_id=msg["chat"]["id"], message_id=msg["message_id"], reply_markup={"inline_keyboard": []})
    tg("sendMessage", chat_id=msg["chat"]["id"], text=note, reply_to_message_id=msg["message_id"])

def handle(cb):
    data, msg = cb.get("data", ""), cb.get("message")
    parts = data.split("|"); act, d = parts[0], parts[1]
    lang = parts[2] if len(parts) > 2 else None
    note = {"ok": "Paylaşılıyor…", "okall": "Hepsi paylaşılıyor…", "redo": "Yeniden seslendiriliyor…",
            "next": "Başka içerik hazırlanıyor…", "skip": "Tamam, bugün geçiyoruz."}
    note.update({"s" + k: v for k, v in note.items()})   # story buttons: sok, sokall, sredo, sskip
    tg("answerCallbackQuery", callback_query_id=cb["id"], text=note.get(act, ""))
    if act in ("sok", "sokall", "sskip", "sredo"): return handle_story(act, parts, msg)
    have = tags("reel-")
    if act == "ok":
        if resolved(d, lang, have): return close_buttons(msg, "Bu zaten sonuçlanmış.")
        res = post(d, [lang])
        close_buttons(msg, f"✅ {FLAG[lang]} paylaşıldı." if res[lang] else f"❌ {FLAG[lang]} paylaşılamadı, Actions kaydına bak. Tekrar denemek için yeniden bas.")
        if not res[lang]: tg("editMessageReplyMarkup", chat_id=msg["chat"]["id"], message_id=msg["message_id"], reply_markup={"inline_keyboard": keyboard(d, lang, 0, 0)})
    elif act == "okall":
        rel = gh("release", "view", f"approve-{d}", "--json", "assets", check=False)
        langs = [a["name"][:-5] for a in json.loads(rel.stdout or '{"assets":[]}')["assets"] if a["name"].endswith(".json")]
        todo = [l for l in langs if not resolved(d, l, have)]
        if not todo: return close_buttons(msg, "Paylaşılacak bekleyen reel kalmadı.")
        res = post(d, todo)
        good = [FLAG[l] for l, v in res.items() if v]; bad = [FLAG[l] for l, v in res.items() if not v]
        close_buttons(msg, f"✅ Paylaşıldı: {' '.join(good) or '-'}" + (f"\n❌ Olmadı: {' '.join(bad)}" if bad else ""))
    elif act == "skip":
        mark(f"reel-skip-{d}-{lang}"); close_buttons(msg, f"{FLAG[lang]} bugün paylaşılmayacak.")
    elif act in ("redo", "next"):
        if resolved(d, lang, have): return close_buttons(msg, "Bu zaten sonuçlanmış.")
        k = int(parts[3]); v = int(parts[4]) if act == "redo" else 0
        close_buttons(msg, "🔁 Yeni ses hazırlanıyor, birkaç dakika…" if act == "redo" else "⏭ Başka bir içerik hazırlanıyor, birkaç dakika…")
        ensure_render_env()
        try:
            item, rep, mp4 = build_one(d, lang, k, v)
            send_preview(d, lang, item, rep, mp4, k, v)
        except Exception as e:
            say(f"{FLAG[lang]} yeniden hazırlanamadı: {str(e)[:200]}")

def open_items():
    """(kind, date, lang) still waiting for a decision: reels from approve-* releases of the last
    3 days, stories from story-approve-* of the last day (a story is stale after that)."""
    rel = gh("release", "list", "--limit", "50", "--json", "tagName", check=False)
    have = tags("reel-") | tags("story-"); pending = []
    for r in json.loads(rel.stdout or "[]"):
        t = r["tagName"]
        kind, keep = ("reel", 3) if t.startswith("approve-") else ("story", 1) if t.startswith("story-approve-") else (None, 0)
        if not kind: continue
        d = t[-10:]
        if (Date.today() - Date.fromisoformat(d)).days > keep:
            gh("release", "delete", t, "-y", "--cleanup-tag", check=False); continue
        pending += [(kind, d, l) for l in release_langs(t) if not resolved(d, l, have, kind)]
    return pending

def watch(minutes):
    deadline = time.time() + minutes * 60
    chat = int(os.environ["TELEGRAM_CHAT_ID"])
    pending = open_items()
    if not pending: log("nothing pending"); return       # scheduled runs end in seconds on quiet days
    log("watching, pending:", pending)
    offset, idle_since = None, time.time()
    while time.time() < deadline:
        r = tg("getUpdates", timeout=50, allowed_updates=["callback_query"], **({"offset": offset} if offset else {}))
        ups = r.get("result", [])
        if ups:
            offset = ups[-1]["update_id"] + 1
            tg("getUpdates", offset=offset, timeout=0)       # acknowledge first: a crash must not replay a re-render
            idle_since = time.time()
        for u in ups:
            cb = u.get("callback_query")
            if not cb: continue
            log("button:", cb.get("data"), "from me" if cb.get("from", {}).get("id") == chat else "from someone else, ignored")
            if cb.get("from", {}).get("id") != chat: continue
            try: handle(cb); log("done:", cb.get("data"))
            except Exception as e: log("handle error:", repr(e)[:400]); say(f"Bir hata oldu: {str(e)[:300]}")
        if not ups and time.time() - idle_since > 600 and not open_items():
            log("nothing pending, exiting"); return
    # Time is up but reels are still waiting: hand over to a fresh run right away, so a button
    # press never lands in a gap between watchers.
    if open_items() and os.environ.get("CI"):
        gh("workflow", "run", "reel-approve.yml", check=False); log("still pending, started a new watcher")

def main():
    cmd = sys.argv[1]
    if cmd == "prepare":
        d = sys.argv[2]; langs = LANGS
        if "--langs" in sys.argv and sys.argv[sys.argv.index("--langs") + 1]: langs = sys.argv[sys.argv.index("--langs") + 1].split(",")
        prepare(d, langs)
    elif cmd == "prepare-story":
        d = sys.argv[2]; langs = LANGS
        if "--langs" in sys.argv and sys.argv[sys.argv.index("--langs") + 1]: langs = sys.argv[sys.argv.index("--langs") + 1].split(",")
        prepare_story(d, langs)
    elif cmd in ("auto", "auto-story"):
        d = sys.argv[2]; langs = LANGS
        if "--langs" in sys.argv and sys.argv[sys.argv.index("--langs") + 1]: langs = sys.argv[sys.argv.index("--langs") + 1].split(",")
        (auto_reels if cmd == "auto" else auto_stories)(d, langs)
    elif cmd == "watch":
        watch(int(sys.argv[sys.argv.index("--minutes") + 1]) if "--minutes" in sys.argv else 330)
    elif cmd == "render":
        lang, slug, out = sys.argv[2:5]
        item = next(x for x in queue(lang) if x["slug"] == slug)
        print(json.dumps(render(lang, item, os.path.abspath(out)), ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
