#!/usr/bin/env python3
"""Validate a voiced reel queue file against data/voiced/README.md.

  python3 scripts/check_voiced.py <file.json> <lang> [--lib <library dir>]

Items that carry `lib_id` must quote their library passage verbatim: all stanza lines
joined in order must appear as one contiguous excerpt of that passage's text
(whitespace and the curly/straight quote style are ignored). Exits 1 on any error.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.expanduser("~/Developer/lumen/content/library")
KEYS = {"slug", "mode", "poet", "author", "title", "hook", "stanzas", "reel_bg", "caption", "source"}

def norm(s):
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("«", '"').replace("»", '"').replace("„", '"').replace(" ", " ")
    return re.sub(r"\s+", " ", s).strip()

def library(lang, lib):
    if lang == "en":
        out = {}
        for f in ("source_stoics.json", "source_east_west.json", "source_europe.json"):
            p = os.path.join(lib, f)
            if os.path.exists(p):
                out.update({x["id"]: x["text"] for x in json.load(open(p))})
        return out
    p = os.path.join(lib, f"pack_{lang}.json")
    return {x["id"]: x["text"] for x in json.load(open(p))} if os.path.exists(p) else {}

def check(items, lang, lib, existing=()):
    errs, texts = [], library(lang, lib)
    seen_slug = {x["slug"] for x in existing}
    seen_lib = {x["lib_id"] for x in existing if "lib_id" in x}
    old = [norm(" ".join(l for p in x["stanzas"] for l in p)) for x in existing]
    for i, x in enumerate(items):
        tag = f"[{i}] {x.get('slug', '?')}"
        e = lambda m: errs.append(f"{tag}: {m}")
        miss = KEYS - set(x) - ({"source"} if "lib_id" not in x else set())
        if miss: e(f"missing keys {sorted(miss)}"); continue
        if not re.fullmatch(r"[a-z0-9_]+", x["slug"]): e("slug must be [a-z0-9_]")
        if x["slug"] in seen_slug: e("duplicate slug (in this file or the queue)")
        seen_slug.add(x["slug"])
        if x["mode"] not in ("poem", "prose"): e("mode must be poem|prose")
        if len(x["hook"]) > 45: e(f"hook {len(x['hook'])} chars > 45")
        st = x["stanzas"]
        if not st or any(not p or any(not isinstance(l, str) or not l.strip() for l in p) for p in st): e("empty page/line")
        if len(st) < 2 or len(st[-1]) != 1: e("last page must hold exactly one line (the payoff)")
        elif len(st[-1][0]) > 150: e(f"payoff {len(st[-1][0])} chars > 150")
        lines = [l for p in st for l in p]
        if any(c in l for l in lines for c in "[]()*—"): e("brackets, asterisks or em dash in spoken text")
        words = len(" ".join(lines).split())
        if lang != "hi" and words > 95: e(f"{words} words > 95")
        if lang == "hi" and words > 110: e(f"{words} words > 110")
        if not os.path.exists(os.path.join(ROOT, "public", x["reel_bg"])): e(f"reel_bg {x['reel_bg']} not under public/")
        cap = x["caption"]
        if "—" in cap: e("em dash in caption")
        if len(re.findall(r"(?<!\S)#\w+", cap)) != 3: e("caption needs exactly 3 hashtags")
        if not cap.startswith(x["hook"].rstrip()[:20]): e("caption must start with the hook")
        if "lib_id" in x:
            if x["lib_id"] in seen_lib: e("lib_id used twice")
            seen_lib.add(x["lib_id"])
            src = texts.get(x["lib_id"])
            joined = norm(" ".join(lines))
            if src is None: e(f"lib_id {x['lib_id']} not in library")
            elif joined not in norm(src): e("stanza text is not a verbatim contiguous excerpt of the library passage")
            if any(joined[:60] in o or o[:60] in joined for o in old): e("overlaps an item already in the queue")
    return errs

if __name__ == "__main__":
    a = sys.argv[1:]
    lib = a[a.index("--lib") + 1] if "--lib" in a else LIB
    path, lang = a[0], a[1]
    items = json.load(open(path))
    qpath = os.path.join(ROOT, "data/voiced", f"{lang}.json")
    existing = json.load(open(qpath)) if os.path.exists(qpath) and os.path.abspath(qpath) != os.path.abspath(path) else []
    errs = check(items, lang, lib, existing)
    print("\n".join(errs) if errs else f"OK: {len(items)} items")
    sys.exit(1 if errs else 0)
