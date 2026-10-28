#!/usr/bin/env python3
"""One-off: merge data/voiced/_new/<lang>.json into the queue for the 2026-10-29 rotation restart.

Order: old items not yet posted interleaved with the new ones, the item posted on 2026-10-27 last.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from approval import post_number
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

for lang in sys.argv[1:]:
    qp, np_ = f"{ROOT}/data/voiced/{lang}.json", f"{ROOT}/data/voiced/_new/{lang}.json"
    old, new = json.load(open(qp)), json.load(open(np_))
    for x in new:  # a hook that already names the author only needs the work below it
        if x["poet"].split()[-1] in x["hook"] and "hookSub" in x: x["hookSub"] = x["title"]
    posted = old[post_number("2026-10-27") % len(old)]
    rest = [x for x in old if x is not posted]
    out = []
    for i in range(max(len(rest), len(new))):
        if i < len(rest): out.append(rest[i])
        if i < len(new): out.append(new[i])
    out.append(posted)
    assert len(out) == len(old) + len(new) and len({x["slug"] for x in out}) == len(out)
    json.dump(out, open(qp, "w"), ensure_ascii=False, indent=1)
    open(qp, "a").write("\n")
    print(lang, len(old), "+", len(new), "=", len(out), "| last:", posted["slug"])
