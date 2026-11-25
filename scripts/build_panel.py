#!/usr/bin/env python3
"""都道府県ごとの「地域の要因」と「結果」を1つの表にまとめる(複合要因の分析用)。
入力は data/raw/ の各ファイル(あるものだけ使う)。出力: public/js/panel-data.js
  {prefs:[名前...], vars:{key:{name, unit, group, source, year, values:[47個(順番は prefs と同じ)]}}, elections:{...}}
group は "要因"(人口構成・所得・天気・災害・保険)か "結果"(投票・購買・移動)。"""
import json, pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
raw = root / "data/raw"
load = lambda f: json.loads((raw / f).read_text()) if (raw / f).exists() else None
acc = load("accuracy_data.json")
P = acc["population_by_prefecture_age_sex_2025"]["data"]["total_population"]
codes = sorted(k for k in P if k != "00")
prefs = [P[c]["name_ja"] for c in codes]
vars_ = {}
def put(key, name, unit, group, source, year, values):
    vals = [values.get(p) for p in prefs]
    if sum(v is not None for v in vals) >= 40: vars_[key] = {"name": name, "unit": unit, "group": group, "source": source, "year": year, "values": [None if v is None else round(v, 4) for v in vals]}
# 人口構成(2025年)
pop = {P[c]["name_ja"]: P[c]["total"] for c in codes}
put("old65", "65歳以上の割合", "%", "要因", "総務省 人口推計 2025年10月1日", 2025, {p: 100 * sum(v[k] for k in ("65-69", "70-74", "75-79", "80-84", "85+")) / v["total"] for p, v in pop.items()})
put("young", "20〜39歳の割合", "%", "要因", "総務省 人口推計 2025年10月1日", 2025, {p: 100 * sum(v[k] for k in ("20-24", "25-29", "30-34", "35-39")) / v["total"] for p, v in pop.items()})
put("logpop", "人口(対数)", "log(千人)", "要因", "総務省 人口推計 2025年10月1日", 2025, {p: __import__("math").log(v["total"]) for p, v in pop.items()})
# 賃金(2025年)
W = acc["wage_by_prefecture_2025"]["data"]
def wage_of(rec):
    t = rec.get("total") or rec.get("男女計") or rec
    return t.get("contractual_cash_earnings") or t.get("scheduled_earnings")
wmap = {}
for k, rec in (W.items() if isinstance(W, dict) else []):
    name = rec.get("name_ja") if isinstance(rec, dict) else None
    if name in prefs:
        try: wmap[name] = float(wage_of(rec))
        except Exception: pass
put("wage", "月給(一般労働者・きまって支給する給与)", "千円", "要因", "厚生労働省 賃金構造基本統計調査 2025年", 2025, wmap)
# 衆院小選挙区の自民党の得票率(都道府県ごと、8回)
sd = load("smd_districts.json")
elections = []
if sd:
    for e in sd["elections"]:
        tot, ldp = {}, {}
        for d in e["districts"]:
            pref = re.match(r"(.+?[都道府県])第", d["name"]).group(1)
            v = sum(c[1] for c in d["cands"]); tot[pref] = tot.get(pref, 0) + v
            ldp[pref] = ldp.get(pref, 0) + sum(c[1] for c in d["cands"] if c[0] == "自由民主党")
        name = e["election"].split(" ")[0]; year = int(e["election"].split(" ")[1][:4])
        elections.append(name)
        put(f"ldp{year}", f"自民党の小選挙区の得票率({year}年)", "%", "結果", "総務省 衆議院議員総選挙結果調 候補者別得票数", year, {p: 100 * ldp[p] / tot[p] for p in tot})
out = {"prefs": prefs, "vars": vars_, "notes": ["都道府県を1つの単位として比べる表。県どうしの違いから個人の行動を言い切ることはできない(生態学的誤謬)。"]}
(root / "public/js/panel-data.js").write_text("// scripts/build_panel.py が作るファイル。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(len(prefs), "prefs", len(vars_), "vars:", ", ".join(vars_))
