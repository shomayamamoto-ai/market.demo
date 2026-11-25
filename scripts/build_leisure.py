#!/usr/bin/env python3
"""レジャー施設と温泉・銭湯(data/raw/leisure_parks.json, leisure_bath.json, leisure_points.json)を、
画面と仮想の住民で使う形にまとめる。
出力: public/js/leisure-data.js(画面と住民の財布用)、public/js/leisure-points.js(地図の点。大きいので必要なときだけ読む)"""
import json, pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
P = json.loads((root / "data/raw/leisure_parks.json").read_text())
B = json.loads((root / "data/raw/leisure_bath.json").read_text())
L = json.loads((root / "data/raw/leisure_points.json").read_text())
src = {s["id"]: s for s in P["sources"]}

# 1) テーマパーク(場所・入場者数。TEA/AECOMの推計は暦年、県の統計は公式)
parks = []
for p in P["parks"]:
    att = {y: {"v": a["value"], "k": a["kind"]} for y, a in p.get("attendance", {}).items() if a.get("value") and re.fullmatch(r"\d{4}", y)}  # 暦年の値だけ(USJの年度の値は除く)
    parks.append({"name": re.sub(r"\s*\(.*\)$", "", p["name"]), "pref": p["pref"], "city": p.get("city"), "lat": p["lat"], "lon": p["lon"],
                  "opened": (p.get("opened") or "")[:4], "att": att})
tdr = P["tdr"]["calendar_year_estimates_tea"]["values"]

# 2) 経済産業省 遊園地・テーマパーク(月ごと。2000年1月〜2024年12月)
M = P["meti_parks"]["monthly"]; months = sorted(M)
meti = {"start": months[0], "visitors": [M[m]["visitors_total_persons"] for m in months],
        "sales": [M[m]["sales_total_million_yen"] for m in months], "admission": [M[m]["sales_admission_facility_million_yen"] for m in months],
        "breaks": [k for k in P["meti_parks"]["link_coefficients"] if re.match(r"\d{4}-\d{2}$", k)],
        "sample": P["meti_parks"]["sample_definition"]}

# 3) 温泉(環境省 温泉利用状況)
O = B["onsen_riyou_joukyou"]
onsenNat = {y: {k: v.get(k) for k in ("onsen_areas", "sources_total", "lodging_facilities", "overnight_guests_fy", "onsen_public_baths")} for y, v in O["national_series_by_fy"].items()}
last = max(O["by_prefecture_by_fy"]); onsenPref = {k: {"areas": v["onsen_areas"], "guests": v["overnight_guests_fy"], "lodging": v["lodging_facilities"], "springs": v["sources_total"]} for k, v in O["by_prefecture_by_fy"][last]["prefs"].items()}
onsenPref2019 = {k: v["overnight_guests_fy"] for k, v in O["by_prefecture_by_fy"]["2019"]["prefs"].items()}

# 4) 公衆浴場(厚生労働省 衛生行政報告例)
PB = B["public_baths_eisei_gyosei"]
bathNat = {y: {"total": v["public_baths_total"], "sento": v.get("ippan_koshu_yokujo_sento")} for y, v in PB["national_series"].items()}
bathPref = {k: {"sento": v["ippan_sento"], "other": v["other_non_sento"], "sauna": v.get("private_sauna"), "health": v.get("private_health_center")} for k, v in PB["by_prefecture"]["2025"].items() if k != "全国"}

# 5) 社会生活基本調査 2021(行動者率 %)
SS = B["shakai_seikatsu_kihon_chosa"]
PARK = "遊園地，動植物園，水族館などの見物"
def park_key(d): return next(k for k in d if "遊園地" in k)
rate = {}
for sex in ("男", "女", "総数"):
    h, t = SS["hobby_rate_by_sex_age_2021"][sex], SS["travel_rate_by_sex_age_2021"][sex]
    rate[sex] = {age: {"park": h[age][park_key(h[age])], "day": t[age]["行楽(日帰り)"], "tour": t[age]["国内観光旅行"]} for age in h if age in t and "以上" not in age or age == "75歳以上"}
prefRate = {k: {"park": SS["hobby_rate_by_pref_2021"][k][park_key(SS["hobby_rate_by_pref_2021"][k])], "day": SS["travel_rate_by_pref_2021"][k]["行楽(日帰り)"], "tour": SS["travel_rate_by_pref_2021"][k]["国内観光旅行"]} for k in SS["hobby_rate_by_pref_2021"]}
ts = SS["hobby_rate_timeseries_1986_2021"]["総数"]
parkTs = {age: v[next(k for k in v if "遊園地" in k)] for age, v in ts.items()}
cp = SS["by_household_income_couples_2021"]
coupleIncome = {who: {inc: {"park": cp["hobby"][who][inc][park_key(cp["hobby"][who][inc])], "day": cp["travel"][who][inc]["行楽(日帰り)"], "tour": cp["travel"][who][inc]["観光旅行"]} for inc in cp["hobby"][who]} for who in ("夫", "妻")}

# 6) 家計調査(二人以上の世帯、円/世帯/年)
K = B["kakei_chosa"]
ITEMS = ["遊園地入場・乗物代", "温泉・銭湯入浴料", "宿泊料", "国内パック旅行費", "入場・観覧・ゲーム代", "教養娯楽サービス", "消費支出"]
def table(t, year="annual_2025"):
    d = K[year][t]["data"]; cols = [c for c in d["消費支出"] if not c.startswith("(再掲)")]
    out = {"cols": cols, "members": [d["世帯人員"][c]["yen_per_household_year"] for c in cols] if "世帯人員" in d else None}
    for it in ITEMS:
        out[it] = [d[it][c]["yen_per_household_year"] for c in cols]
        if "purchases_per_100_households_year" in d[it][cols[0]]: out[it + "|回"] = [d[it][c].get("purchases_per_100_households_year") for c in cols]
    return out
kakei = {"age": table("by_head_age"), "quintile": table("by_income_quintile"), "age2019": table("by_head_age", "annual_2019_pre_covid"), "quintile2019": table("by_income_quintile", "annual_2019_pre_covid")}
city = K["annual_2025"]["by_prefectural_capital_city"]["data"]
kakei["city"] = {c: {it: city[it][c]["yen_per_household_year"] for it in ITEMS if c in city[it]} for c in city["消費支出"]}
mon = K["monthly_items_2019_2025"]["data"]
kakei["monthly"] = {it: {m: mon[m]["items"][it]["yen_per_household_month"] for m in sorted(mon) if it in mon[m]["items"]} for it in ITEMS if it != "教養娯楽サービス"}
kakei["series"] = {y: {it: v.get(it) for it in ITEMS if it in v} for y, v in K["annual_national_series_2000_2025"]["data"].items()}

lit = [{"cite": x["cite"], "url": x.get("url"), "topic": x.get("topic"), "key": x.get("key_numbers")} for x in B["literature_jstage"]]
out = {"parks": parks, "tdr": tdr, "meti": meti, "onsenNat": onsenNat, "onsenPref": onsenPref, "onsenPref2019": onsenPref2019, "onsenYear": last,
       "bathNat": bathNat, "bathPref": bathPref, "rate": rate, "prefRate": prefRate, "parkTs": parkTs, "coupleIncome": coupleIncome, "kakei": kakei, "lit": lit,
       "sources": {"tea": "TEA/AECOM Theme Index(各年版、aecom.com)", "meti": src.get("meti_lt", {}).get("url"), "onsen": O["source_page"] if "source_page" in O else O["source"],
                   "bath": PB["source"], "ss": SS["source"], "kakei": K["source"], "hts": "長崎県 観光統計(www.pref.nagasaki.jp)"}}
(root / "public/js/leisure-data.js").write_text("// scripts/build_leisure.py が作るファイル(経済産業省 特定サービス産業動態統計、環境省 温泉利用状況、厚生労働省 衛生行政報告例、総務省 社会生活基本調査・家計調査、TEA/AECOM ほか)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")

# 7) 地図の点(国土数値情報。非商用の利用条件)。数が多い「スポーツ・レクリエーション」と映画館は除く
KIND = {"温泉・健康": "onsen", "その他集客施設(レジャーランド・レクパーク等)": "leisure", "動植物園": "zoo", "水族館": "zoo", "動植物園・水族館": "zoo", "テーマ・公園テーマ施設": "leisure"}
pts = [[round(p["lon"], 3), round(p["lat"], 3), KIND[p["category"]], p["name"][:40]] for p in L["points"] if p["category"] in KIND]
attr = "出典:国土数値情報(観光資源データ 2014年、集客施設データ 2014年、文化施設データ 2013年)(国土交通省)を加工して作成"
(root / "public/js/leisure-points.js").write_text("// scripts/build_leisure.py が作るファイル。" + attr + "。利用条件は非商用。手で書き換えない。\nexport default " + json.dumps({"attr": attr, "points": pts}, ensure_ascii=False, separators=(",", ":")) + ";\n")
for f in ("leisure-data.js", "leisure-points.js"): print(f, (root / "public/js" / f).stat().st_size)
print({k: sum(1 for p in pts if p[2] == k) for k in ("onsen", "leisure", "zoo")}, list(rate["男"].keys()))
