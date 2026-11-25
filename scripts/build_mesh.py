#!/usr/bin/env python3
"""1kmメッシュの人口(国勢調査2020)と事業所(経済センサス2021)、全駅の位置と乗降客数(国土数値情報 S12)を、新駅の試算で使う形にまとめる。
画面を開いたときだけ読み込む(大きいので)。出力: public/js/mesh-data.js
形:{codes:[8桁コードを数で], pop:[], old:[], emp:[], shop:[], stations:[[経度,緯度,1日の乗降客数,名前]]}"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
M = json.loads((root / "data/raw/mesh/mesh_pop.json").read_text())["cells"]; E = json.loads((root / "data/raw/mesh/econ_mesh.json").read_text()); EF = E["fields"]; EC = E["cells"]
i_emp = next(i for i, f in enumerate(EF) if "従業者" in f and "卸売" not in f and "宿泊" not in f)
shop = [i for i, f in enumerate(EF) if "従業者" in f and ("卸売" in f or "宿泊" in f)]
codes = sorted(set(M) | set(EC), key=int)
out = {"codes": [int(c) for c in codes], "pop": [M.get(c, [0] * 5)[0] for c in codes], "old": [M.get(c, [0] * 5)[4] for c in codes],
       "emp": [EC.get(c, [0] * len(EF))[i_emp] for c in codes], "shop": [sum(EC.get(c, [0] * len(EF))[i] for i in shop) for c in codes]}
S = json.loads((root / "data/raw/stations.json").read_text())["stations"]
def latest(s):
    r = s.get("riders") or {}; ys = sorted(y for y, v in r.items() if v)
    return (r[ys[-1]] if ys else None)
st = {}
for s in S:  # 同じ名前で近い駅は、事業者をまとめて1駅とみなす(乗換駅)
    v = latest(s)
    if s.get("lon") is None: continue
    k = (s["name"], round(s["lon"], 2), round(s["lat"], 2)); o = st.setdefault(k, [round(s["lon"], 4), round(s["lat"], 4), -1, s["name"]])
    if v is not None: o[2] = max(o[2], 0) + v  # −1 は乗降客数が公表されていない駅(無人駅など)。距離の計算には使う
out["stations"] = list(st.values()); out["fields"] = {"pop": "人口(2020年国勢調査)", "old": "65歳以上", "emp": "従業者(2021年経済センサス、民営)", "shop": "うち卸売・小売と宿泊・飲食の従業者"}
(root / "public/js/mesh-data.js").write_text("// scripts/build_mesh.py が作るファイル(総務省 国勢調査2020・経済センサス2021 の地域メッシュ統計、国土数値情報 駅別乗降客数を加工)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/mesh-data.js").stat().st_size, "bytes", len(codes), "cells", len(out["stations"]), "stations", "emp field", EF[i_emp], [EF[i] for i in shop])
