#!/usr/bin/env python3
"""飛行機とバス(data/raw/air_bus.json)を、画面と地図で使う形にまとめる。出力: public/js/travel-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/air_bus.json").read_text())
fy = [r for r in d["routes"] if r["period"].startswith("年度")]
by = {}
for r in fy: by.setdefault(r["route_ja"], {})[r["year"]] = r
latest = max(r["year"] for r in fy)
routes = []
for name, ys in by.items():
    r = ys.get(latest)
    if not r: continue
    routes.append({"name": name, "from": r["from"], "to": r["to"], "km": r["km"], "class": r["class"], "pax": r["passengers"], "lf": r["load_factor_pct"], "pax2019": (ys.get("2019") or {}).get("passengers"),
                   "series": {y: v["passengers"] for y, v in sorted(ys.items())}})
routes.sort(key=lambda x: -x["pax"])
airports = [{"code": a["code"], "name": a["name"], "pref": a.get("pref"), "lon": a.get("lon"), "lat": a.get("lat"), "dom": {y: v.get("domestic") for y, v in (a.get("passengers_fy") or {}).items()}, "intl": {y: v.get("international") for y, v in (a.get("passengers_fy") or {}).items()}} for a in d["airports"] if a.get("lon")]
S = d["series"]; keep = ["air_dom_pax_cy", "air_dom_lf_cy", "lcc_dom_pax_cy", "lcc_dom_share_cy", "bus_noriai_pax_fy", "bus_kashikiri_pax_fy", "bus_haishi_km_fy", "bus_highway_pax_fy_old", "bus_highway_pax_fy_jts"]
out = {"latest": latest, "routes": routes[:80], "airports": airports, "series": {k: {"name": S[k]["name_ja"], "unit": S[k].get("unit"), "values": S[k]["values"], "source": S[k].get("source")} for k in keep if k in S}}
(root / "public/js/travel-data.js").write_text("// scripts/build_travel.py が作るファイル(国土交通省 航空輸送統計・空港管理状況調書・自動車輸送統計ほか)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/travel-data.js").stat().st_size, "bytes", latest, len(routes), "routes", len(airports), "airports")
