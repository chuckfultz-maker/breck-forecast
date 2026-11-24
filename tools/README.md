# Breckenridge snow forecast: files and monthly recalibration

- `~/Downloads/breck-forecast.html` is the live forecast page. Open it in a browser.
- `~/Downloads/breck-forecast-tools/calibrate.js` refits the calibration from the Breckenridge NWS co-op observer
  (GHCN-D USC00050909) and Open-Meteo's archive of past model forecasts, 2016-17 to now.
- `~/Downloads/breck-forecast-tools/apply_cal.py` writes a new calibration into the page's single `const CAL=` line,
  and refuses anything that looks broken (a factor jumping more than 30%, values out of range,
  or a correction that fails the held-out-winter test).
- `~/Downloads/breck-forecast-tools/cal.json` holds the most recent calibration result.

## Monthly recalibration steps (run by the scheduled task)

1. Open a tab in the built-in browser at https://open-meteo.com/en/docs. Any normal https page works.
   The data sites are reachable from the browser but not from the cloud workspace.
2. Read the current calibration: the `const CAL={...};` line in breck-forecast.html.
3. Check https://www.onthesnow.com/colorado/breckenridge/historical-snowfall for any completed season after
   2025-26. Count a season only once it's over (after June). Pass any such totals as
   `window.__RESORT_EXTRA={2026:NNN}`, keyed by the season's starting year.
4. In that tab, run `window.__CUR_CAL=<current CAL>;`, then run the full contents of calibrate.js.
   It works in the background, so poll `window.__CAL.status` every 40 s until `done` (about 3 minutes).
   If the status is `error`, report `window.__CAL.error` and stop.
5. Save `JSON.stringify(window.__CAL.result)` to breck-forecast-tools/cal.json, then run
   `python3 apply_cal.py cal.json ../breck-forecast.html`.
6. If a GitHub repo is set up for the page (see below), copy the page to the repo as index.html, then commit and push.
7. Report what changed, or why nothing was applied.

## Daily check against Breck's report (run by the daily scheduled task)

1. In the built-in browser, open https://www.breckenridge.com/the-mountain/mountain-conditions/snow-and-weather-report.aspx
   and read the "24 HOUR SNOWFALL" figure and its "Updated <date> at <time>" line. Use it only if it's dated today (Mountain time).
2. Open https://chuckfultz-maker.github.io/breck-forecast/?v=<timestamp>, wait about 8 seconds, then read
   window.__breck.mornings[0..2]: for each, take d (the report date), k (lead days), snow[1] (mid-mountain), p10, p90 and nws.
3. Write record.json, e.g. {"logged":"<today>","actual":{"date":"<today>","inches":<24h>},"forecasts":[{"target":d,"lead":k,"mid":..,"p10":..,"p90":..,"nws":..}]}
   (write it with a short python script; don't hand-type numbers), then run:
   python3 log_day.py verification.csv record.json
4. Copy verification.csv to the GitHub repo's tools/ folder and push (see GitHub below). The page's Track record section reads it.
5. Only message Chuck if something failed. The monthly recalibration uses verification.csv automatically (apply_cal.py reads it).

## GitHub
Repo: chuckfultz-maker/breck-forecast (public). Live site: https://chuckfultz-maker.github.io/breck-forecast/
To publish after a calibration is applied: call add_repo (owner chuckfultz-maker, repo breck-forecast, access push),
clone it, copy ~/Downloads/breck-forecast.html to index.html and breck-forecast-tools/cal.json to tools/cal.json,
then commit and push to main. GitHub Pages republishes automatically within a couple of minutes.
If the calibration was NOT applied, don't push anything.
