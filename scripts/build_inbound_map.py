#!/usr/bin/env python3
"""3Dの地図用の、人口と訪日外国人の分布(約10kmのます目)を作る。出力: public/js/pop-grid.js
・人口:国勢調査2020の1kmメッシュを、2次メッシュ(約10km四方)に合計
・訪日外国人の泊数の、県の中での配分:観光庁 宿泊旅行統計(2025年、県ごとの外国人延べ宿泊者)を、
  そのます目の「宿泊業・飲食サービス業の従業者のうち、地元の人口では説明できない分(観光向けとみなす)」に比例して配る(推計。仮定)
・地名:ます目に最も近い、乗降客数の多い駅の名前(国土数値情報 駅別乗降客数)"""
import json, pathlib, math, re
root = pathlib.Path(__file__).resolve().parent.parent
pop = json.loads((root / "data/raw/mesh/mesh_pop.json").read_text())["cells"]
eco = json.loads((root / "data/raw/mesh/econ_mesh.json").read_text())["cells"]
geo = json.loads((root / "data/raw/geo_prefectures.geojson").read_text())["features"]
inb = json.loads((root / "data/raw/inbound.json").read_text())
mesh_js = (root / "public/js/mesh-data.js").read_text()
stations = json.loads(re.search(r'"stations":(\[\[.*?\]\])', mesh_js).group(1))

def center(code):
    s = str(code); p, u, q, v, r, w = int(s[0:2]), int(s[2:4]), int(s[4]), int(s[5]), int(s[6]), int(s[7])
    return p / 1.5 + q / 12 + (r + 0.5) / 120, 100 + u + v / 8 + (w + 0.5) / 80
G = {}
for code, v in pop.items():
    g = str(code)[:6]; la, lo = center(code); n = v[0] or 0
    c = G.setdefault(g, {"pop": 0, "emp": 0, "sla": 0, "slo": 0, "w": 0})
    c["pop"] += n; c["sla"] += la * (n + 1); c["slo"] += lo * (n + 1); c["w"] += n + 1
for code, v in eco.items():
    g = str(code)[:6]; c = G.setdefault(g, {"pop": 0, "emp": 0, "sla": 0, "slo": 0, "w": 0}); la, lo = center(code)
    e = v[5] or 0; c["emp"] += e
    if c["w"] == 0: c["sla"] += la; c["slo"] += lo; c["w"] += 1
# 県の判定(点が多角形の内側か)
polys = []
for f in geo:
    name = f["properties"]["name"]; gm = f["geometry"]; rings = [p[0] for p in gm["coordinates"]] if gm["type"] == "MultiPolygon" else [gm["coordinates"][0]]
    for r in rings:
        xs = [x for x, _ in r]; ys = [y for _, y in r]; polys.append((name, r, min(xs), max(xs), min(ys), max(ys)))
def inside(lo, la, r):
    c = False; j = len(r) - 1
    for i in range(len(r)):
        xi, yi = r[i]; xj, yj = r[j]
        if (yi > la) != (yj > la) and lo < (xj - xi) * (la - yi) / (yj - yi + 1e-12) + xi: c = not c
        j = i
    return c
cent = {f["properties"]["name"]: f["properties"]["centroid"] for f in geo}
def pref_of(lo, la):
    for name, r, x0, x1, y0, y1 in polys:
        if x0 <= lo <= x1 and y0 <= la <= y1 and inside(lo, la, r): return name
    return min(cent, key=lambda n: (cent[n][0] - lo) ** 2 + (cent[n][1] - la) ** 2)
names = [f["properties"]["name"] for f in geo]
cells = []
tot_pop = sum(c["pop"] for c in G.values()); tot_emp = sum(c["emp"] for c in G.values()); k = tot_emp / tot_pop
for g, c in G.items():
    if c["pop"] <= 0 and c["emp"] <= 0: continue
    la, lo = c["sla"] / c["w"], c["slo"] / c["w"]
    cells.append({"lo": lo, "la": la, "pop": c["pop"], "emp": c["emp"], "excess": max(0.0, c["emp"] - k * c["pop"]), "pref": pref_of(lo, la)})
nights = {p: v["foreign_guest_nights"].get("2025") for p, v in inb["prefectures"].items() if isinstance(v, dict) and "foreign_guest_nights" in v}
byp = {}
for c in cells: byp.setdefault(c["pref"], []).append(c)
for p, lst in byp.items():
    s = sum(c["excess"] for c in lst) or sum(c["emp"] for c in lst) or 1
    key = "excess" if sum(c["excess"] for c in lst) > 0 else "emp"
    for c in lst: c["foreign"] = (nights.get(p) or 0) * c[key] / s
# 照合:観光向けの従業者の県ごとの合計の割合と、実際の外国人の泊数の割合の相関(県の間の比較。配分に使ったのは県の中の比だけ)
P = [p for p in names if p in nights and p in byp]
ex = [sum(c["excess"] for c in byp[p]) for p in P]; ni = [nights[p] for p in P]
def corr(a, b):
    ma, mb = sum(a) / len(a), sum(b) / len(b); sa = math.sqrt(sum((x - ma) ** 2 for x in a)); sb = math.sqrt(sum((y - mb) ** 2 for y in b)); return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (sa * sb)
la_ = [math.log(x + 1) for x in ex]; lb_ = [math.log(y + 1) for y in ni]
check = {"corr_log": round(corr(la_, lb_), 3), "corr": round(corr(ex, ni), 3), "n": len(P)}
# 地名:近い駅(乗降客数の多い駅を優先)
big = sorted([s for s in stations if s[2] and s[2] > 0], key=lambda s: -s[2])[:3000]
def near_station(lo, la):
    # ます目(約10km)の中で、乗降客数が最も多い駅の名前を使う。無ければ最も近い駅
    dist = lambda s: math.hypot((s[0] - lo) * 111 * math.cos(math.radians(la)), (s[1] - la) * 111)
    inside_ = [s for s in big if dist(s) <= 6]
    best = max(inside_, key=lambda s: s[2]) if inside_ else min(big, key=dist)
    return best[3], dist(best)
top = sorted(cells, key=lambda c: -c.get("foreign", 0))[:40]
areas = []
for c in top:
    nm, d = near_station(c["lo"], c["la"]); areas.append({"name": nm, "km": round(d, 1), "pref": c["pref"], "foreign": round(c["foreign"]), "lo": round(c["lo"], 3), "la": round(c["la"], 3)})
out = {"prefs": names, "cells": [[round(c["lo"], 3), round(c["la"], 3), int(c["pop"]), names.index(c["pref"]), int(round(c.get("foreign", 0)))] for c in cells], "areas": areas, "check": check, "k": k,
       "note": "人口=国勢調査2020(1kmメッシュを約10kmに合計)。訪日外国人の泊数=観光庁 宿泊旅行統計 2025年の県の値を、県の中で「観光向けとみなした宿泊業・飲食サービス業の従業者」(経済センサス2021)に比例して配分した推計"}
(root / "public/js/pop-grid.js").write_text("// scripts/build_inbound_map.py が作るファイル(総務省 国勢調査2020・経済センサス2021 の地域メッシュ統計、観光庁 宿泊旅行統計、国土数値情報)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(len(cells), "cells", (root / "public/js/pop-grid.js").stat().st_size, "bytes", check)
print([(a["name"], a["pref"], a["foreign"]) for a in areas[:15]])
