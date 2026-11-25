#!/usr/bin/env python3
"""気象庁の各県の気象台の年ごとの値(data/raw/jma_annual.json、1961〜2025年)を、画面で使う形にまとめる。
資料不足値(記号「]」)は空にする。出力: public/js/weather-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/jma_annual.json").read_text())
F = ["rain_days_1mm", "rain_days_10mm", "precip_mm", "sunshine_h", "temp_mean", "summer_days", "hot_days", "winter_days", "snowfall_cm", "clear_days"]
years = list(range(1961, 2026))
out = {"years": years, "fields": {f: d["fields"][f]["name_ja"] for f in F}, "units": {f: d["fields"][f].get("unit") for f in F}, "stations": [], "source": d["source"], "notes": d["notes"][:8]}
for st in d["stations"]:
    row = {"pref": st["pref"], "name": st["name"], "lon": st["lon"], "lat": st["lat"], "v": {}}
    for f in F:
        vals = []
        for y in years:
            r = st["years"].get(str(y), {}); v = r.get(f); flag = str(r.get("flags", {}).get(f, ""))
            vals.append(None if v is None or "]" in flag or "×" in flag or not isinstance(v, (int, float)) else v)
        row["v"][f] = vals
    out["stations"].append(row)
(root / "public/js/weather-data.js").write_text("// scripts/build_weather.py が作るファイル(出典:気象庁ホームページ 過去の気象データ。年ごとの値を加工)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/weather-data.js").stat().st_size, "bytes", len(out["stations"]), "stations")
