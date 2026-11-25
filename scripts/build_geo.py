#!/usr/bin/env python3
"""地図(国土数値情報 N03・N02・S12 を加工)と、県と県の旅客の流れ(全国幹線旅客純流動調査 2015年度)を、3D地図で使う形にまとめる。
出力: public/js/geo-data.js"""
import json, pathlib, math
root = pathlib.Path(__file__).resolve().parent.parent
raw = root / "data/raw"
G = json.loads((raw / "geo_prefectures.geojson").read_text()); R = json.loads((raw / "geo_rail_main.geojson").read_text()); T = json.loads((raw / "transport_params.json").read_text())
acc = json.loads((raw / "accuracy_data.json").read_text())["population_by_prefecture_age_sex_2025"]["data"]["total_population"]
pop = {v["name_ja"]: v["total"]["total"] for k, v in acc.items() if k != "00"}
r4 = lambda c: [round(c[0], 3), round(c[1], 3)]
prefs = []
for f in sorted(G["features"], key=lambda f: f["properties"]["code"]):
    p = f["properties"]; geom = f["geometry"]; polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    prefs.append({"name": p["name"], "code": p["code"], "centroid": r4(p.get("label_point") or p["centroid"]), "pop": pop.get(p["name"], 0) * 1000, "area": p["area_km2"],
                  "polys": [[r4(c) for c in poly[0]] for poly in polys]})  # 外側の輪だけ(画面用)
rail = []
for f in R["features"]:
    g = f["geometry"]; parts = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
    for part in parts: rail.append({"type": "新幹線" if "新幹線" in f["properties"]["type"] else "在来線", "line": f["properties"]["line"], "coords": [r4(c) for c in part]})
def od(key):
    o = T["od"][key]; return {"prefs": o["prefs"], "values": [[0 if i == j else v for j, v in enumerate(row)] for i, row in enumerate(o["values"])], "source": o.get("source"), "year": o.get("year")}
out = {"prefs": prefs, "rail": rail, "od": od("junryudo_2015_all"), "modes": {"rail": od("junryudo_2015_rail"), "air": od("junryudo_2015_air"), "bus": od("junryudo_2015_bus"), "car": od("junryudo_2015_car")},
       "stations": [{k: s[k] for k in ("name", "operator", "pref", "lon", "lat", "riders_per_day", "riders_per_day_2019")} for s in T["top_stations"][:100]],
       "terms": T.get("terms")}
(root / "public/js/geo-data.js").write_text("// scripts/build_geo.py が作るファイル(出典:国土数値情報(行政区域・鉄道・駅別乗降客数)、国土交通省 全国幹線旅客純流動調査。加工して作成)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/geo-data.js").stat().st_size, "bytes", len(prefs), "prefs", len(rail), "rail parts")
