#!/usr/bin/env python3
"""人口を自前で推計するための入力(生命表・出生率・社人研の仮定と公式推計)を、画面用の小さなファイルにまとめる。
入力: data/raw/population_inputs.json  出力: public/js/cohort-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/population_inputs.json").read_text())
ages = [str(a) for a in range(100)] + ["100+"]
lt, fe, ip, op = d["life_table"], d["fertility_by_age"]["data"], d["ipss_assumptions"]["data"], d["official_projection"]["data"]
qx = {s: [lt["data"][s]["qx"][a] for a in ages] for s in ("male", "female")}

def e0(q, f):  # 死亡率を一律に f 倍したときの平均寿命(100歳以上は生命表の平均余命を、死亡率に反比例させて使う)
    l, t = 1.0, 0.0
    for a in range(100):
        p = min(1.0, q[a] * f); t += l * (1 - p / 2); l *= 1 - p
    return t, l
def life(s, f):
    t, l = e0(qx[s], f); return t + l * lt["data"][s]["ex"]["100+"] / f
def solve(s, target):  # 2070年の平均寿命が社人研の仮定に合う、死亡率の倍率
    lo, hi = 0.2, 1.0
    for _ in range(60):
        m = (lo + hi) / 2
        if life(s, m) > target: lo = m
        else: hi = m
    return (lo + hi) / 2
le70 = ip["life_expectancy_by_year"]["2070"]["medium"]
factor = {s: solve(s, le70[s]) for s in ("male", "female")}
improve = {s: round(1 - factor[s] ** (1 / 45), 5) for s in factor}  # 2025→2070年の45年で、毎年同じ率で下がるとしたときの年率

base = op["by_year"]["2025"]["single_year_persons"]
mig = ip["international_migration"]
share = mig["foreign_net_migrants_age_share"]
def fold(v):  # 100歳以上をまとめる
    out = [v.get(str(a), 0) for a in range(100)]; out.append(sum(x for k, x in v.items() if k.rstrip("+").isdigit() and int(k.rstrip("+")) >= 100)); return out
out = {
    "baseYear": 2025,
    "base": {s: [base[a][s] for a in ages] for s in ("male", "female")},
    "qx": qx, "ex100": {s: lt["data"][s]["ex"]["100+"] for s in qx}, "e0": lt["data"]["life_expectancy_at_birth"],
    "improve": improve, "e0Target2070": le70,
    "fertilityPattern": fe["age_pattern_share_of_tfr"], "tfrActual": fe["tfr_published"], "maleShare": round(105.2 / 205.2, 5),
    "tfrMedium": {y: v["medium"] for y, v in ip["tfr_by_year"].items() if int(y) >= 2025},
    "japaneseWomenShare": round(sum(fe["female_population_japanese_by_5yr"].values()) / sum(base[str(x)]["female"] for x in range(15, 50)), 4),
    "officialVital": {y: [v["births_thousand"], v["deaths_thousand"]] for y, v in op["vital_events_by_year_from_report"].items() if y in ("2030", "2040", "2050", "2060", "2070")},
    "migrants": {s: mig["foreign_net_migrants_per_year_2022_2040"][s] for s in ("male", "female")},
    "migrantShare": {s: [round(x, 6) for x in fold(share[s])] for s in ("male", "female")},
    "official": {y: {"total": v["total"]["all_ages"], "young": v["total"]["age_0_14"], "work": v["total"]["age_15_64"], "old": v["total"]["age_65_plus"]} for y, v in op["by_year"].items()},
    "officialTotal": {y: v["total"] for y, v in op["total_by_year"].items() if int(y) >= 2025},
    "sources": [
        {"name": lt["source_name"], "url": lt["source_index_url"]},
        {"name": d["fertility_by_age"]["source_name"], "url": d["fertility_by_age"]["source_index_url"]},
        {"name": d["ipss_assumptions"]["source_name"], "url": d["ipss_assumptions"]["source_url"]},
        {"name": d["official_projection"]["source_name"], "url": d["official_projection"].get("source_index_url") or d["official_projection"]["source_url"]},
    ],
}
(root / "public/js/cohort-data.js").write_text("// scripts/build_cohort.py が作るファイル。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("improve", improve, "pattern", out["fertilityPattern"], "migrants", out["migrants"], type(mig["foreign_net_migrants_by_year"]).__name__, "share sum", sum(out["migrantShare"]["male"]), sum(out["migrantShare"]["female"]))
print({y: v for y, v in out["official"].items()}); print(list(out["tfrMedium"].items())[:3], mig.get("after_2040_rule"))
