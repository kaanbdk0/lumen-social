"""One-off voice test: Chatterbox Multilingual (MIT) on the same texts as the Edge samples."""
import json, os, sys, time
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

def text_of(lang, slug):
    it = next(x for x in json.load(open(f"data/voiced/{lang}.json")) if x["slug"] == slug)
    return [l for p in it["stanzas"] for l in p]

SAMPLES = [("tr", "tr_lib_kmm_birkac_ay"), ("en", "en_lib_thoreau_deliberately"), ("ar", json.load(open("data/voiced/ar.json"))[1]["slug"])]
os.makedirs("lab_out", exist_ok=True)
t0 = time.time(); model = ChatterboxMultilingualTTS.from_pretrained(device="cpu"); print("model loaded", round(time.time() - t0), "s", flush=True)
for lang, slug in SAMPLES:
    for ex, cfg in [(0.5, 0.5), (0.35, 0.3)]:            # default, and a calmer / slower reading
        t = time.time(); parts = []
        for line in text_of(lang, slug):
            parts.append(model.generate(line, language_id=lang, exaggeration=ex, cfg_weight=cfg))
            parts.append(__import__("torch").zeros(1, int(model.sr * 0.35)))
        wav = __import__("torch").cat(parts, dim=1)
        ta.save(f"lab_out/{lang}_chatterbox_ex{ex}_cfg{cfg}.wav", wav, model.sr)
        print(lang, ex, cfg, "audio", round(wav.shape[1] / model.sr, 1), "s, took", round(time.time() - t), "s", flush=True)
