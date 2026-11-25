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
# 都道府県別の結果(総務省 結果調・家計調査・全国消費実態調査・国勢調査)
po = load("pref_outcomes.json")
if po:
    S = po["series"]
    for y in ("2005", "2009", "2012", "2014", "2017", "2021", "2024", "2026"):
        put(f"turnout{y}", f"衆院選の投票率({y}年)", "%", "結果", "総務省 衆議院議員総選挙結果調", int(y), {p: v.get(y) for p, v in S["shu_turnout"]["by_pref"].items()})
        pv = S["shu_pr_party_votes"]["by_pref"]
        def share(p, names):
            r = pv.get(p, {}).get(y) or {}; tot = sum(x for x in r.values() if isinstance(x, (int, float)) and x > 0) - (r.get("合計") or 0) * 0
            tot = r.get("合計") or sum(x for k, x in r.items() if isinstance(x, (int, float)) and k != "合計")
            return 100 * sum(r.get(n, 0) for n in names) / tot if tot else None
        put(f"pr_ldp{y}", f"比例代表の自民党の得票率({y}年)", "%", "結果", "総務省 結果調 都道府県別党派別得票数(比例代表)", int(y), {p: share(p, ["自由民主党"]) for p in prefs})
        put(f"pr_org{y}", f"比例代表の公明党+共産党の得票率({y}年)", "%", "結果", "総務省 結果調 都道府県別党派別得票数(比例代表)", int(y), {p: share(p, ["公明党", "日本共産党"]) for p in prefs})
        put(f"pr_kome{y}", f"比例代表の公明党の得票率({y}年)", "%", "結果", "総務省 結果調 都道府県別党派別得票数(比例代表)", int(y), {p: share(p, ["公明党"]) for p in prefs})
        put(f"pr_jcp{y}", f"比例代表の共産党の得票率({y}年)", "%", "結果", "総務省 結果調 都道府県別党派別得票数(比例代表)", int(y), {p: share(p, ["日本共産党"]) for p in prefs})
    for k in ("外食", "被服及び履物", "灯油", "教養娯楽", "火災・地震保険料", "自動車等関係費", "消費支出"):
        put(f"spend_{k}", f"{k}(年間、二人以上の世帯、2023〜25年平均)", "円", "結果", "総務省 家計調査 県庁所在市別(東京都は区部)", 2024, {p: v.get("2023-2025平均") for p, v in S[f"kakei_{k}"]["by_pref"].items()})
    put("car2014", "自動車の普及率(二人以上の世帯、2014年)", "%", "要因", "総務省 全国消費実態調査 2014年", 2014, {p: v.get("2014") for p, v in S["car_share_2plus"]["by_pref"].items()})
    put("rail2020", "通勤・通学で鉄道を使う人の割合(2020年)", "%", "要因", "総務省 国勢調査 2020年 利用交通手段", 2020, {p: v.get("2020") for p, v in S["commute_rail_share"]["by_pref"].items()})
ins = load("insurance_disaster.json")
if ins:
    put("eq2025", "地震保険の世帯加入率(2025年)", "%", "結果", "損害保険料率算出機構", 2025, {p: v.get("2025") for p, v in ins["series"]["eq_household_rate"]["by_pref"].items()})
    fl = ins["series"]["flood_damage_total_oku"]["by_pref"]
    put("flood10", "水害の被害額(2014〜2023年の合計、人口千人あたり)", "百万円", "要因", "国土交通省 水害統計", 2023, {p: sum(x for x in fl[p].values() if isinstance(x, (int, float))) * 100 / pop[p]["total"] for p in fl if p in pop})
# 天気(気象庁 各県の気象台。2016〜2025年の10年平均と、投票日の天気)
wx = load("jma_annual.json")
if wx:
    def mean10(st, f):
        v = [st["years"].get(str(y), {}).get(f) for y in range(2016, 2026)]
        v = [x for x in v if isinstance(x, (int, float)) and "]" not in str(st["years"].get(str(y), {}).get("flags", {}).get(f, ""))]
        return sum(v) / len(v) if len(v) >= 7 else None
    S = {st["pref"]: st for st in wx["stations"]}
    for f, name, unit in (("rain_days_1mm", "雨の日数(1mm以上、年)", "日"), ("sunshine_h", "日照時間(年)", "時間"), ("winter_days", "冬日の日数(最低気温0℃未満)", "日"), ("summer_days", "夏日の日数(最高気温25℃以上)", "日"), ("snowfall_cm", "降雪の深さの合計", "cm"), ("temp_mean", "平均気温", "℃")):
        put(f"wx_{f}", f"{name}、2016〜25年平均", unit, "要因", "気象庁 過去の気象データ(各県の気象台)", 2025, {p: mean10(S[p], f) for p in S})
ed = load("jma_election_days.json")
if ed:
    E = {st["pref"]: st["days"] for st in ed["stations"]}
    for date in sorted({d for st in E.values() for d, v in st.items() if v.get("role") == "投票日"}):
        y = date[:4]; kind = "shu" if any(v.get("election") == "衆院選" for st in E.values() for d, v in st.items() if d == date) else "san"
        put(f"rain_{kind}{y}", f"投票日の雨量({date})", "mm", "要因", "気象庁 日ごとの値(各県の気象台)", int(y), {p: (E[p].get(date) or {}).get("precip_mm") for p in E})
if po:
    for y in ("2007", "2010", "2013", "2016", "2019", "2022", "2025"):
        put(f"sturnout{y}", f"参院選の投票率({y}年)", "%", "結果", "総務省 参議院議員通常選挙結果調", int(y), {p: v.get(y) for p, v in po["series"]["san_turnout"]["by_pref"].items()})
out = {"prefs": prefs, "vars": vars_, "notes": ["都道府県を1つの単位として比べる表。県どうしの違いから個人の行動を言い切ることはできない(生態学的誤謬)。"]}
(root / "public/js/panel-data.js").write_text("// scripts/build_panel.py が作るファイル。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(len(prefs), "prefs", len(vars_), "vars:", ", ".join(vars_))
