#!/usr/bin/env python3
"""Record the daily forecast-vs-actual log for the Breckenridge forecast.

Usage: python3 log_day.py verification.csv record.json

record.json:
{
  "logged": "2026-11-25",                       # date the forecast was read (local)
  "actual": {"date": "2026-11-25", "inches": 2.0}, # Breck's 24-hour total at that morning's report (optional)
  "forecasts": [                                 # this page's forecasts for upcoming 5 AM reports
    {"target": "2026-11-26", "lead": 1, "mid": 1.8, "p10": 1.0, "p90": 2.5, "nws": 2.6}
  ]
}

One row per (target_date, lead_days). Re-running the same day overwrites that day's values.
"""
import csv, json, os, sys

COLS = ["target_date", "lead_days", "logged", "fc_mid", "fc_p10", "fc_p90", "fc_nws", "actual"]

path, rec_path = sys.argv[1], sys.argv[2]
rec = json.load(open(rec_path))
rows = []
if os.path.exists(path):
    rows = list(csv.DictReader(open(path, newline="")))
key = lambda r: (r["target_date"], str(r["lead_days"]))
by = {key(r): r for r in rows}

def num(x):
    return "" if x is None or x == "" else f"{float(x):.2f}"

for f in rec.get("forecasts", []):
    k = (f["target"], str(f["lead"]))
    r = by.get(k) or {c: "" for c in COLS}
    r.update(target_date=f["target"], lead_days=str(f["lead"]), logged=rec["logged"],
             fc_mid=num(f.get("mid")), fc_p10=num(f.get("p10")), fc_p90=num(f.get("p90")), fc_nws=num(f.get("nws")))
    by[k] = r

a = rec.get("actual")
if a and a.get("inches") is not None:
    hit = False
    for r in by.values():
        if r["target_date"] == a["date"]:
            r["actual"] = num(a["inches"])
            hit = True
    if not hit:
        by[(a["date"], "")] = {**{c: "" for c in COLS}, "target_date": a["date"], "actual": num(a["inches"])}

out = sorted(by.values(), key=lambda r: (r["target_date"], r["lead_days"] or "9"))
with open(path, "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=COLS)
    w.writeheader()
    w.writerows(out)

done = [r for r in out if r["actual"] and r["fc_mid"] and r["lead_days"] == "1"]
print(f"logged {len(rec.get('forecasts', []))} forecasts; actual {a.get('inches') if a else 'n/a'}; {len(done)} verified next-morning forecasts on file")
