"""Semi-automatic reel posting: prepare → Telegram approval → post.

  python3 scripts/approval.py prepare <date> [--langs tr,en]   # render + QA + send to Telegram
  python3 scripts/approval.py watch [--minutes 330]             # handle Kaan's button presses
  python3 scripts/approval.py render <lang> <slug> <out.mp4>    # local test render (no Telegram)

Each post day one item per language is taken from data/voiced/<lang>.json, voiced with
ElevenLabs (with timestamps), checked by speech-to-text against the text, rendered with
the LumenPoemReel composition and uploaded to the GitHub release `approve-<date>`.
Kaan gets one Telegram message per language with Paylaş / Yeniden seslendir /
Başka içerik / Bugün geç buttons. Nothing is posted without his press.

State lives in git tags (atomic, visible): reel-posted-<date>-<lang>, reel-skip-<date>-<lang>.
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

# Per language: native narrator voice, spoken app plug, on-screen plug, IG handle.
# Spoken CTAs spell "Lumen" phonetically where the script differs, so the voice says it right.
def _plug(head_poem, head_prose, accent, badge, label_poem, label_prose):
    return {"poem": {"head": head_poem, "accent": accent, "badge": badge, "label": label_poem},
            "prose": {"head": head_prose, "accent": accent, "badge": badge, "label": label_prose}}

LOCALE = {
    "tr": {"voice": "5nr6ATQepuidiLb6OT3B", "handle": "@lumen.bilgelik",   # Ozan Karaca
           "cta": {"poem": "Bu şiiri her sabah ana ekranında görmek için... Lumen.", "prose": "Bu satırları her sabah ana ekranında okumak için... Lumen."},
           "plug": _plug("Her sabah bir şiir,", "Her sabah bir pasaj,", "ana ekranında.", "App Store'da ücretsiz", "GÜNÜN ŞİİRİ", "GÜNÜN PASAJI")},
    "en": {"voice": "JBFqnCBsd6RMkjVDRZzb", "handle": "@lumen.wisdom",      # George
           "cta": {"poem": "To see a poem like this on your home screen every morning... Lumen.", "prose": "To read lines like these on your home screen every morning... Lumen."},
           "plug": _plug("A poem every morning,", "A passage every morning,", "on your home screen.", "Free on the App Store", "POEM OF THE DAY", "PASSAGE OF THE DAY")},
    "ar": {"voice": "R6nda3uM038xEEKi7GFl", "handle": "@lumen.hikma", "rtl": True,   # Anas, MSA
           "cta": {"poem": "لترى قصيدةً كهذه على شاشتك الرئيسية كل صباح... لومِن.", "prose": "لتقرأ كلماتٍ كهذه على شاشتك الرئيسية كل صباح... لومِن."},
           "plug": _plug("كل صباح قصيدة،", "كل صباح نصّ،", "على شاشتك الرئيسية.", "مجاناً على App Store", "قصيدة اليوم", "نصّ اليوم")},
    "es": {"voice": "l1zE9xgNpUTaQCZzpNJa", "handle": "@lumen.sabiduria",    # Alberto Rodríguez
           "cta": {"poem": "Para ver un poema así cada mañana en tu pantalla de inicio... Lumen.", "prose": "Para leer palabras así cada mañana en tu pantalla de inicio... Lumen."},
           "plug": _plug("Un poema cada mañana,", "Un pasaje cada mañana,", "en tu pantalla de inicio.", "Gratis en el App Store", "POEMA DEL DÍA", "PASAJE DEL DÍA")},
    "fr": {"voice": "YV28ox2c5Cuh5rim0LrW", "handle": "@lumen.sagesse",      # Marcel
           "cta": {"poem": "Pour voir un poème comme celui-ci chaque matin sur ton écran d'accueil... Lumen.", "prose": "Pour lire des lignes comme celles-ci chaque matin sur ton écran d'accueil... Lumen."},
           "plug": _plug("Un poème chaque matin,", "Un texte chaque matin,", "sur ton écran d'accueil.", "Gratuit sur l'App Store", "POÈME DU JOUR", "TEXTE DU JOUR")},
    "de": {"voice": "re2r5d74PqDzicySNW0I", "handle": "@lumen.weisheit",     # Leon Stern
           "cta": {"poem": "Damit du jeden Morgen ein Gedicht wie dieses auf deinem Startbildschirm siehst... Lumen.", "prose": "Damit du jeden Morgen Zeilen wie diese auf deinem Startbildschirm liest... Lumen."},
           "plug": _plug("Jeden Morgen ein Gedicht,", "Jeden Morgen ein Gedanke,", "auf deinem Startbildschirm.", "Kostenlos im App Store", "GEDICHT DES TAGES", "TEXT DES TAGES")},
    "ru": {"voice": "ogi2DyUAKJb7CEdqqvlU", "handle": "@lumen.mudrost",      # Stanislav
           "cta": {"poem": "Чтобы каждое утро видеть такие стихи на главном экране... Люмен.", "prose": "Чтобы каждое утро читать такие строки на главном экране... Люмен."},
           "plug": _plug("Каждое утро стихи,", "Каждое утро мысль,", "на главном экране.", "Бесплатно в App Store", "СТИХИ ДНЯ", "ТЕКСТ ДНЯ")},
    "pt": {"voice": "YNOujSUmHtgN6anjqXPf", "handle": "@lumen.sabedoria",    # Victor Power
           "cta": {"poem": "Para ver um poema assim toda manhã na sua tela inicial... Lumen.", "prose": "Para ler palavras assim toda manhã na sua tela inicial... Lumen."},
           "plug": _plug("Um poema toda manhã,", "Um trecho toda manhã,", "na sua tela inicial.", "Grátis na App Store", "POEMA DO DIA", "TRECHO DO DIA")},
    "it": {"voice": "13Cuh3NuYvWOVQtLbRN8", "handle": "@lumen.saggezza",     # Marco
           "cta": {"poem": "Per vedere una poesia così ogni mattina sulla tua schermata Home... Lumen.", "prose": "Per leggere parole così ogni mattina sulla tua schermata Home... Lumen."},
           "plug": _plug("Una poesia ogni mattina,", "Un pensiero ogni mattina,", "sulla tua schermata Home.", "Gratis su App Store", "POESIA DEL GIORNO", "PENSIERO DEL GIORNO")},
    "hi": {"voice": "zgqefOY5FPQ3bB7OZTVR", "handle": "@lumen.vidya",        # Niraj
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

def pick(lang, d, k=0):
    q = queue(lang)
    return q[(post_number(d) + k) % len(q)] if q else None

# ─── ElevenLabs ──────────────────────────────────────────────────────────────
def _el(path, body):
    req = urllib.request.Request(f"https://api.elevenlabs.io{path}", data=json.dumps(body).encode(),
                                 headers={"xi-api-key": _key(), "Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=180)

def add_voice(vid):
    """Shared-library voices must be in the account before TTS; no-op when already added."""
    try:
        q = urllib.parse.urlencode({"page_size": 100, "search": vid})
        v = json.load(urllib.request.urlopen(urllib.request.Request("https://api.elevenlabs.io/v1/shared-voices?" + q, headers={"xi-api-key": _key()}), timeout=60))["voices"]
        v = next((x for x in v if x["voice_id"] == vid), None)
        if v: _el(f"/v1/voices/add/{v['public_owner_id']}/{vid}", {"new_name": "Lumen " + v["name"][:20]})
    except Exception: pass

def tts(stanzas, voice, seed, prose):
    pause_line, pause_stanza, speed = (0.15, 0.7, 0.95) if prose else (0.45, 0.5, 0.92)
    text = f' <break time="{pause_stanza}s" /> '.join(f' <break time="{pause_line}s" /> '.join(s) for s in stanzas)
    r = json.load(_el(f"/v1/text-to-speech/{voice}/with-timestamps", {
        "text": text, "model_id": "eleven_multilingual_v2", "seed": seed,
        # low style + higher stability = fewer odd intonations / mumbles
        "voice_settings": {"stability": 0.7, "similarity_boost": 0.8, "style": 0.15, "speed": speed}}))
    al = r["alignment"]; spoken = "".join(al["characters"])
    out, pos = [], 0
    for s in stanzas:
        row = []
        for l in s:
            i = spoken.find(l, pos)
            if i < 0: raise ValueError(f"alignment lost at: {l}")
            row.append({"text": l, "start": round(al["character_start_times_seconds"][i], 2),
                        "end": round(al["character_end_times_seconds"][i + len(l) - 1], 2)}); pos = i + len(l)
        out.append(row)
    # longest single character (excluding spaces/punctuation): a stretched, wailing sound shows up here
    longest = max((e - s for c, s, e in zip(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]) if c.isalpha()), default=0)
    return base64.b64decode(r["audio_base64"]), out, longest

def stt(path, lang):
    out = subprocess.run(["curl", "-s", "-X", "POST", "https://api.elevenlabs.io/v1/speech-to-text", "-H", f"xi-api-key: {_key()}",
                          "-F", "model_id=scribe_v1", "-F", f"language_code={lang}", "-F", f"file=@{path}"],
                         capture_output=True, text=True, timeout=180).stdout
    return json.loads(out).get("text", "")

def _letters(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if c.isalpha() and not unicodedata.combining(c))

def qa(audio_path, stanzas, lang, last_end, longest):
    """Score the take. Fails on wrong/missing/invented words or a long babbling tail."""
    heard = stt(audio_path, lang)
    ref = " ".join(" ".join(s) for s in stanzas)
    score = difflib.SequenceMatcher(None, _letters(ref), _letters(heard), autojunk=False).ratio()
    tail = probe(audio_path) - last_end
    problems = []
    if score < QA_MIN: problems.append(f"metin eşleşmesi düşük (%{score*100:.0f})")
    if tail > 1.5: problems.append(f"sonda {tail:.1f} sn fazladan ses")
    if longest > 0.9: problems.append(f"uzayan ses ({longest:.1f} sn)")
    return {"score": round(score, 3), "tail": round(tail, 2), "longest": round(longest, 2), "problems": problems, "heard": heard}

def cta_audio(voice, lang, mode):
    path = f"{ROOT}/public/reel/cta_{voice}_{lang}_{mode}.mp3"
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "wb").write(_el(f"/v1/text-to-speech/{voice}", {"text": LOCALE[lang]["cta"][mode], "model_id": "eleven_multilingual_v2",
            "voice_settings": {"stability": 0.7, "similarity_boost": 0.8, "style": 0.15, "speed": 0.95}}).read())
    return os.path.relpath(path, f"{ROOT}/public"), probe(path)

# ─── Render ──────────────────────────────────────────────────────────────────
def render(lang, item, out_mp4, variant=0):
    """Voice + QA (up to QA_TRIES takes, best kept) + Remotion render + loudnorm. Returns the QA report."""
    loc, mode = LOCALE[lang], item.get("mode", "poem")
    voice = item.get("voice", loc["voice"]); add_voice(voice)
    stanzas = item["stanzas"]
    os.makedirs(f"{ROOT}/public/reel", exist_ok=True)
    tag = f"{lang}_{item['slug']}"
    best = None
    for attempt in range(QA_TRIES):
        seed = int(hashlib.md5(f"{tag}:{variant}:{attempt}".encode()).hexdigest()[:7], 16)
        try:
            audio, timing, longest = tts(stanzas, voice, seed, mode == "prose")
        except ValueError as e:
            log(f"  [{lang}] take {attempt+1}: {e}"); continue
        path = f"{ROOT}/public/reel/{tag}_{attempt}.mp3"; open(path, "wb").write(audio)
        rep = qa(path, stanzas, lang, timing[-1][-1]["end"], longest)
        log(f"  [{lang}] take {attempt+1}: %{rep['score']*100:.1f} {rep['problems'] or 'OK'}")
        if best is None or (len(rep["problems"]), -rep["score"]) < (len(best[2]["problems"]), -best[2]["score"]):
            best = (path, timing, rep)
        if not rep["problems"]: break
    if best is None: raise RuntimeError("no usable take")
    path, timing, rep = best
    rep["attempts"] = attempt + 1
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
    for a in range(QA_TRIES):
        p = f"{ROOT}/public/reel/{tag}_{a}.mp3"
        if os.path.exists(p) and p != path: os.remove(p)
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

def resolved(d, lang, have=None):
    have = have if have is not None else tags(f"reel-")
    return f"reel-posted-{d}-{lang}" in have or f"reel-skip-{d}-{lang}" in have

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
    sh(["bash", "-c", "sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg fonts-noto-core fonts-noto-extra fonts-noto-cjk >/dev/null && npm ci --silent && npx remotion browser ensure"], cwd=ROOT)
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

def close_buttons(msg, note):
    if not msg: return
    tg("editMessageReplyMarkup", chat_id=msg["chat"]["id"], message_id=msg["message_id"], reply_markup={"inline_keyboard": []})
    tg("sendMessage", chat_id=msg["chat"]["id"], text=note, reply_to_message_id=msg["message_id"])

def handle(cb):
    data, msg = cb.get("data", ""), cb.get("message")
    parts = data.split("|"); act, d = parts[0], parts[1]
    lang = parts[2] if len(parts) > 2 else None
    tg("answerCallbackQuery", callback_query_id=cb["id"], text={"ok": "Paylaşılıyor…", "okall": "Hepsi paylaşılıyor…", "redo": "Yeniden seslendiriliyor…",
                                                               "next": "Başka içerik hazırlanıyor…", "skip": "Tamam, bugün geçiyoruz."}.get(act, ""))
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
    """(date, lang) pairs still waiting for a decision, from approve-* releases of the last 3 days."""
    rel = gh("release", "list", "--limit", "50", "--json", "tagName", check=False)
    have = tags("reel-"); pending = []
    for r in json.loads(rel.stdout or "[]"):
        t = r["tagName"]
        if not t.startswith("approve-"): continue
        d = t[len("approve-"):]
        if (Date.today() - Date.fromisoformat(d)).days > 3:
            gh("release", "delete", t, "-y", "--cleanup-tag", check=False); continue
        assets = json.loads(gh("release", "view", t, "--json", "assets", check=False).stdout or '{"assets":[]}')["assets"]
        pending += [(d, a["name"][:-5]) for a in assets if a["name"].endswith(".json") and not resolved(d, a["name"][:-5], have)]
    return pending

def watch(minutes):
    deadline = time.time() + minutes * 60
    chat = int(os.environ["TELEGRAM_CHAT_ID"])
    if not open_items(): log("nothing pending"); return       # scheduled runs end in seconds on quiet days
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
            if not cb or cb.get("from", {}).get("id") != chat: continue
            try: handle(cb)
            except Exception as e: log("handle error:", repr(e)[:400]); say(f"Bir hata oldu: {str(e)[:200]}")
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
    elif cmd == "watch":
        watch(int(sys.argv[sys.argv.index("--minutes") + 1]) if "--minutes" in sys.argv else 330)
    elif cmd == "render":
        lang, slug, out = sys.argv[2:5]
        item = next(x for x in queue(lang) if x["slug"] == slug)
        print(json.dumps(render(lang, item, os.path.abspath(out)), ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
