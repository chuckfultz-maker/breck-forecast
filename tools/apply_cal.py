#!/usr/bin/env python3
"""Write a new calibration into breck-forecast.html.

Usage: python3 apply_cal.py cal.json breck-forecast.html
Replaces the single `const CAL=...;` line. Refuses changes that look broken
(any model factor moving more than 30% in one run, or values out of range),
so a bad data month can't wreck the forecast. Prints what changed.
"""
import json, re, sys

cal_path, page_path = sys.argv[1], sys.argv[2]
new = json.load(open(cal_path))
html = open(page_path, encoding="utf-8").read()
m = re.search(r"^const CAL=(\{.*\});$", html, re.M)
if not m:
    sys.exit("CAL line not found in page")
old = json.loads(m.group(1))

problems = []
for mid, v in new["models"].items():
    for k in ("f1", "f2"):
        n, o = v[k], old["models"][mid][k]
        if not (0.6 <= n <= 2.0):
            problems.append(f"{mid}.{k}={n} out of range")
        elif abs(n / o - 1) > 0.30:
            problems.append(f"{mid}.{k} jumped {o} -> {n}")
if not (1.0 <= new["elev"] <= 1.5):
    problems.append(f"elev={new['elev']} out of range")
if len(new["slr"]) < 5 or not all(2 <= r <= 20 for _, r in new["slr"]):
    problems.append("snow-ratio table looks wrong")
if new["cv"]["of"] and new["cv"]["improved"] / new["cv"]["of"] < 0.5:
    problems.append(f"correction only helped {new['cv']['improved']}/{new['cv']['of']} held-out winters")
for key in ("w1", "w2"):
    w = new.get(key)
    if w is None:
        continue
    if any(v < 0 for v in w.values()) or not (0.95 <= sum(w.values()) <= 1.05):
        problems.append(f"{key} blend weights look wrong: {w}")
if problems:
    print("NOT APPLIED:\n  " + "\n  ".join(problems))
    sys.exit(2)

line = "const CAL=" + json.dumps(new, ensure_ascii=False, separators=(",", ":")) + ";"
html = html[: m.start()] + line + html[m.end():]
open(page_path, "w", encoding="utf-8").write(html)

print("APPLIED calibration dated", new["updated"])
for mid, v in new["models"].items():
    o = old["models"][mid]
    if (v["f1"], v["f2"]) != (o["f1"], o["f2"]):
        print(f"  {mid}: {o['f1']}/{o['f2']} -> {v['f1']}/{v['f2']}")
for k in ("w1", "w2"):
    if new.get(k) != old.get(k):
        print(f"  blend weights {k}: {old.get(k)} -> {new.get(k)}")
for k in ("elev", "resortRatio", "modelRatio", "slrDays"):
    if new[k] != old[k]:
        print(f"  {k}: {old[k]} -> {new[k]}")
if new["slr"] != old["slr"]:
    print(f"  snow ratio: {old['slr']} -> {new['slr']}")
print(f"  held-out winters improved: {new['cv']['improved']}/{new['cv']['of']}")
