#!/usr/bin/env python3
"""data/raw/*.json(収集した統計)から、アプリが読む data/japan.json を作る。

使い方:  python3 scripts/build_data.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
load = lambda name: json.loads((RAW / name).read_text(encoding="utf-8"))
demo, cons, ind, fut = (load(n) for n in ["demographics.json", "consumption.json", "industry.json", "future_media.json"])
acc = load("accuracy_data.json")

def rng(key):
    """'20-24' '20_24' 'le34' 'ge85' '85+' → (min, max)"""
    k = key.replace("_", "-")
    if k.startswith("le"): return 0, int(k[2:])
    if k.startswith("ge"): return int(k[2:]), None
    if k.endswith("+"): return int(k[:-1]), None
    a, b = k.split("-")
    return int(a), int(b)

REGIONS = {
    "北海道": ["01"], "東北": ["02", "03", "04", "05", "06", "07"],
    "関東": ["08", "09", "10", "11", "12", "13", "14"],
    "中部": ["15", "16", "17", "18", "19", "20", "21", "22", "23"],
    "近畿": ["24", "25", "26", "27", "28", "29", "30"],
    "中国": ["31", "32", "33", "34", "35"], "四国": ["36", "37", "38", "39"],
    "九州・沖縄": ["40", "41", "42", "43", "44", "45", "46", "47"],
}
REGION_OF = {code: r for r, codes in REGIONS.items() for code in codes}

# ---------- 人口 ----------
P = demo["population_by_age_sex"]
groups = []
for key, v in P["data"]["by_age_group"].items():
    if key == "85+": continue
    lo, hi = rng(key)
    groups.append({"min": lo, "max": hi, "male": v["male"], "female": v["female"]})
b85 = P["data"]["age_85_plus_breakdown_from_single_year_table"]
groups.append({"min": 85, "max": 89, "male": b85["85-89"]["male"], "female": b85["85-89"]["female"]})
groups.append({"min": 90, "max": None, "male": b85["90+"]["male"], "female": b85["90+"]["female"]})
population = {
    "year": P["year"], "unit": "千人", "total": P["data"]["total_population"]["total"], "ageGroups": groups,
    "prefectures": [{"name": v["name"], "region": REGION_OF[code], "pop": v["total"]}
                    for code, v in demo["population_by_prefecture"]["data"]["prefectures"].items()],
}

# ---------- 配偶関係 ----------
M = demo["marital_status_by_age_sex"]["data"]
marital = {"bands": []}
for key in M["male"]:
    if key.startswith("total"): continue
    lo, hi = rng(key)
    row = {"min": lo, "max": hi}
    for sex in ("male", "female"):
        v = M[sex][key]
        row[sex] = {"never": round(v["never_married_pct"] / 100, 4), "married": round(v["married_pct"] / 100, 4)}
    marital["bands"].append(row)

# ---------- 就業 ----------
E, T = demo["employment_rate_by_age_sex"]["data"], demo["employment_type_by_age_sex"]["data"]
def regular_share(sex, age):
    for key in ["15-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75+"]:
        lo, hi = rng(key)
        if age >= lo and (hi is None or age <= hi): return T[sex][key]["regular_pct"] / 100
employment = {"bands": []}
for key in ["15-19", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70-74", "75+"]:
    lo, hi = rng(key)
    employment["bands"].append({"min": lo, "max": hi, **{
        sex: {"rate": round(E[sex][key]["employment_rate_pct"] / 100, 4), "regularShare": round(regular_share(sex, lo), 4)}
        for sex in ("male", "female")}})

# ---------- 賃金 ----------
W = cons["wage_structure_by_age_sex"]["data"]
BT, ALL = W["by_employment_type"], W["all_regular_workers"]
wage = {"unit": "千円/月(所定内給与)", "bands": [], "bonusMonths": {"regular": 3.0, "nonRegular": 0.5}}
for key in ["le19", "20_24", "25_29", "30_34", "35_39", "40_44", "45_49", "50_54", "55_59", "60_64", "65_69"]:
    lo, hi = rng(key)
    if key == "65_69": hi = None  # 70歳以上は公表が無いので65〜69歳の値を使う
    row = {"min": lo, "max": hi}
    for sex in ("male", "female"):
        if key in BT:
            reg, non = BT[key]["seishain"][sex], BT[key]["non_seishain"][sex]
        else:  # 雇用形態別が取れていない年齢は、50〜54歳の「全体との比」を当てはめる
            base = ALL["50_54"][sex]
            reg = ALL[key][sex] * BT["50_54"]["seishain"][sex] / base
            non = ALL[key][sex] * BT["50_54"]["non_seishain"][sex] / base
        row[sex] = {"regular": round(reg, 1), "nonRegular": round(non, 1)}
    wage["bands"].append(row)
wage["overallAnnualManYen"] = round(ALL["all"]["both"] * (12 + 2.5) / 10)

# ---------- 単身率(その年齢・性別の人のうち、一人暮らしの割合) ----------
H = demo["household_family_type"]["data"]["by_householder_sex_and_age"]
single_rate = []
for key in ["15-19", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70-74", "75-79", "80-84", "85+"]:
    lo, hi = rng(key)
    row = {"min": lo, "max": hi}
    for sex in ("male", "female"):
        if key == "85+":
            people = sum(M[sex][k]["population"] for k in ["85-89", "90-94", "95-99", "100+"])
        else:
            people = M[sex][key]["population"]
        row[sex] = round(H[sex][key]["single_person_households"] / people, 4)
    single_rate.append(row)
household = {"singleRate": single_rate, "composition": demo["household_family_type"]["data"]["composition"]}

# ---------- 家計の支出 ----------
CAT = {"food": "food", "housing": "housing", "utilities": "utilities", "furniture_household": "furniture",
       "clothing_footwear": "clothing", "medical": "medical", "transport_communication": "transport_comm",
       "education": "education", "culture_recreation": "recreation", "other": "other"}
items = lambda v: {CAT[k]: x for k, x in v["categories"].items()}
K2, K1 = cons["kakei_two_plus_by_head_age"]["data"], cons["kakei_single_by_age_sex"]["data"]["single"]
spending = {"unit": "円/月", "twoPlus": [], "single": {"male": [], "female": []}}
for key, v in K2["by_age_5yr"].items():
    lo, hi = rng(key)
    spending["twoPlus"].append({"min": lo, "max": hi, "members": v["avg_household_size"], "total": v["consumption_total"], "items": items(v)})
for sex in ("male", "female"):
    for key in ["le34", "35_59", "ge60"]:
        lo, hi = rng(key)
        v = K1[sex][key]
        spending["single"][sex].append({"min": lo, "max": hi, "total": v["consumption_total"], "items": items(v)})

# ---------- デジタル利用 ----------
IU, IS = cons["ict_usage_by_age"]["data"]["internet_use"]["both"], cons["ict_usage_by_age"]["data"]["internet_services"]["both"]
digital = {"bands": []}
for key in ["6_12", "13_19", "20_29", "30_39", "40_49", "50_59", "60_69", "70_79", "ge80"]:
    lo, hi = rng(key)
    net = IU[key]["internet_use_pct"] / 100
    digital["bands"].append({"min": lo, "max": hi, "internet": round(net, 4),
                             "sns": round(net * IS[key]["sns_use_pct"] / 100, 4),  # 人口に対する割合に直す
                             "ec": round(net * IS[key]["online_purchase_or_transaction_total_pct"] / 100, 4)})  # 商品・サービスの購入・取引(計。デジタルコンテンツと金融取引を含む)

# ---------- メディアの届きやすさ(平日1日あたりの利用時間) ----------
MU = fut["media_usage_time"]["data"]["weekday_avg_minutes"]
TV, NET = MU["tv_realtime"], MU["internet"]
media = {"bands": [], "mean": {"tv": TV["all"], "net": NET["all"]}}
for dec, lo, hi in [("10s", 0, 19), ("20s", 20, 29), ("30s", 30, 39), ("40s", 40, 49), ("50s", 50, 59), ("60s", 60, 69), ("70s", 70, None)]:
    media["bands"].append({"min": lo, "max": hi, "tv": TV[dec], "net": NET[dec]})

# ---------- 将来推計人口(5歳階級 × 性別) ----------
proj = {"years": {}}
for year, v in fut["population_projection"]["data"].items():
    if not year.isdigit(): continue
    rows = []
    for key, g in v["five_year"].items():
        lo, hi = rng(key)
        rows.append({"min": lo, "max": hi, "male": g["male"], "female": g["female"]})
    # 現在人口の最上位階級(90歳以上)に合わせて、90歳以上をまとめる
    top = [r for r in rows if r["min"] >= 90]
    rows = [r for r in rows if r["min"] < 90] + [{"min": 90, "max": None, "male": round(sum(r["male"] for r in top), 3), "female": round(sum(r["female"] for r in top), 3)}]
    proj["years"][year] = rows

# ---------- 産業・市場 ----------
CS, RT, EC = ind["economic_census_2021"]["data"], ind["retail_trade_statistics"]["data"], ind["ecommerce_market_survey"]["data"]
CP = ind["corporate_statistics"]["data"]["all_industries_ex_finance"]
census_rows = sorted(({"label": v["label"], "sales": v["sales"]} for v in CS["by_industry"].values() if v["sales"]), key=lambda r: -r["sales"])
ec_rows = [{"label": "物販:" + v["label"], "value": v["value"]} for v in EC["btoc_physical_goods"]["categories"].values() if v["value"]]
ec_rows += [{"label": "サービス:" + v["label"], "value": v["value"]} for v in EC["btoc_services"]["categories"].values() if v["value"]]
ec_rows += [{"label": "デジタル:" + v["label"], "value": v["value"]} for v in EC["btoc_digital"]["categories"].values() if v["value"]]
NA = ind["national_accounts_household_consumption"]["data"]
industry = {
    "unit": "億円",
    "census": {"total": CS["total"]["sales"], "rows": census_rows, "yearNote": "経済センサス-活動調査 2021年調査、売上は2020年の1年間",
               "note": "産業大分類の全17産業を表示しています。"},
    "corporate": {"sales": CP["sales"]["value"],
                  "note": f"法人企業統計 2025年度の全産業(金融・保険を除く)売上高は約{CP['sales']['value'] / 10000:,.0f}兆円(財務省の発表資料が画像形式のため、目視で確認)。"},
    "retail": {"total": RT["retail_total"]["value"], "yearNote": "商業動態統計 2025年",
               "rows": [{"label": RT["by_format"][k]["label"].split("(")[0], "value": RT["by_format"][k]["value"]}
                        for k in ["supermarkets", "convenience_stores", "drugstores", "department_stores", "large_electronics_stores", "home_centers"]],
               "industryRows": sorted(({"label": v["label"], "value": v["value"]} for v in RT["by_industry"].values() if v.get("value")), key=lambda r: -r["value"])},
    "ec": {"total": EC["btoc_total"]["value"], "yearNote": "電子商取引に関する市場調査 2025年", "rows": sorted(ec_rows, key=lambda r: -r["value"]),
           "note": f"物販のEC化率は{EC['btoc_physical_goods']['ec_ratio_pct']}%。BtoB-ECは約{EC['btob_ec']['value'] / 10000:,.0f}兆円。"},
    "householdConsumption": {
        "label": "家計最終消費支出(2024年・名目、国民経済計算)",
        "value": NA["household_final_consumption_total"]["value"],
        "rows": sorted(({"label": v["label"], "value": v["value"]} for v in NA["by_purpose"].values() if v.get("value")), key=lambda r: -r["value"]),
        "note": "国の統計は、持ち家の家賃相当分(帰属家賃)や、医療・保険などの扱いが家計調査と異なるため、家計調査をもとにしたこのモデルの合計より大きくなります。",
    },
}


# ====================== 精度向上のための追加統計 ======================
FIVE = ["0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70-74", "75-79", "80-84", "85+"]

# 居住地:年齢5歳階級 × 性別ごとの、都道府県別人口(千人)。並びは population.prefectures と同じ
PA = acc["population_by_prefecture_age_sex_2025"]["data"]["total_population"]
codes = list(demo["population_by_prefecture"]["data"]["prefectures"].keys())
population["prefByAge"] = [{"min": rng(k)[0], "max": rng(k)[1], **{sex: [PA[c][sex][k] for c in codes] for sex in ("male", "female")}} for k in FIVE]
WP = acc["wage_by_prefecture_2025"]["data"]
national_wage = acc["wage_by_age_sex_2025"]["data"]["total"]["all_ages"]["scheduled_earnings"]
for pref, c in zip(population["prefectures"], codes):
    pref["wageIndex"] = round(WP[c]["total"]["scheduled_earnings"] / national_wage, 3)

# 年収:賃金構造基本統計調査の「きまって支給する現金給与額 × 12 + 年間賞与」(万円)
WT = acc["wage_by_employment_type_age_sex_2025"]["data"]
PT = cons["wage_structure_by_age_sex"]["data"]["part_time_hourly_wage_yen"]
def part_time_hourly(age, sex):
    key = "le19" if age < 20 else f"{age // 5 * 5}_{age // 5 * 5 + 4}"
    return (PT.get(key) or PT["all"])[sex]
wage = {"unit": "万円/年", "bands": [], "partTimeHours": 1000}
for key in ["under20", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70+"]:
    lo, hi = (0, 19) if key == "under20" else rng(key)
    wage["bands"].append({"min": lo, "max": hi, **{sex: {
        "regular": round(WT["regular"][sex][key]["annual_earnings_est"] / 10, 1),
        "nonRegular": round(WT["non_regular"][sex][key]["annual_earnings_est"] / 10, 1),
        "partTime": round(part_time_hourly(lo if lo else 18, sex) * 1000 / 10000, 1)} for sex in ("male", "female")}})
wage["overallAnnualManYen"] = round(acc["wage_by_age_sex_2025"]["data"]["total"]["all_ages"]["annual_earnings_est"] / 10)

# 就業の内訳:労働力調査(5歳階級 × 性別)。15歳以上人口に対する割合
LF = acc["labour_force_status_by_age_sex_2025"]["data"]
labour = {"bands": []}
for key in FIVE[3:]:
    lo, hi = rng(key)
    row = {"min": lo, "max": hi}
    for sex in ("male", "female"):
        v, n = LF[sex][key], LF[sex][key]["population_15plus"]
        part = v["part_time"] + v["arubaito"]
        sh = {"self": (v["self_employed"] + v["family_workers"]) / n, "exec": v["executives"] / n, "regular": v["regular"] / n,
              "nonRegular": v["non_regular"] / n, "unemployed": v["unemployed"] / n, "student": v["nilf_attending_school"] / n, "housework": v["nilf_housework"] / n}
        row[sex] = {k: round(x, 4) for k, x in sh.items()}
        row[sex]["partShare"] = round(part / v["non_regular"], 3) if v["non_regular"] else 0  # 非正規のうちパート・アルバイトの割合
    labour["bands"].append(row)

# 世帯の種類:国勢調査2020(その年齢・性別の人が、どの種類の世帯に属しているか)
HT = acc["household_family_type_members_by_age_sex_2020"]["data"]["by_family_type"]
household["typeBands"] = []
for key in [k for k in HT["male"] if k not in ("total", "unknown")]:
    lo, hi = rng(key)
    row = {"min": lo, "max": hi}
    for sex in ("male", "female"):
        v = HT[sex][key]
        # 年齢が分からない一人暮らし(全国で約240万人、一人暮らしの11%)を、年齢の分かる一人暮らしと同じ年齢構成で割り振る
        known = sum(x["single_person"] for k2, x in HT[sex].items() if k2 not in ("total", "unknown"))
        single = v["single_person"] * HT[sex]["total"]["single_person"] / known
        n = v["total"] + single - v["single_person"]
        row[sex] = {"single": round(single / n, 4), "coupleOnly": round(v["couple_only"] / n, 4), "coupleKids": round(v["couple_with_children"] / n, 4),
                    "singleParent": round(v["single_parent_with_children"] / n, 4)}
        row[sex]["other"] = round(1 - sum(row[sex].values()), 4)
        # 普通の世帯の外で暮らす人(老人ホーム・病院・寮など、と世帯が分からない人)の割合:1 − 一般世帯の人数 ÷ その年齢の人口(国勢調査の不詳補完値)
        pk = ["95-99", "100+"] if key == "95+" else [key]
        pop = sum(M[sex][k]["population"] for k in pk if k in M[sex])
        if pop and lo >= 15: row[sex]["outside"] = round(max(0.0, 1 - v["total"] / pop), 4)
    household["typeBands"].append(row)

# 所得による支出の違い:家計調査の年間収入五分位(全体平均 = 1 とした費目別の倍率)
def factors(groups, base):
    return [{"income": groups[q]["annual_income_man_yen"], "f": {CAT[k]: round(groups[q]["categories"][k] / base["categories"][k], 3) for k in CAT}} for q in ["Q1", "Q2", "Q3", "Q4", "Q5"]]
Q2P = acc["fies_two_plus_by_income_quintile_2025"]["data"]["two_plus_households"]
Q1P = acc["fies_single_by_income_2025"]["data"]["by_income_quintile"]["single_households"]
spending["quintile"] = {"twoPlus": factors(Q2P, Q2P["all"]), "single": factors(Q1P, Q1P["all"])}
# 費目ごとの「支出弾力性」:消費支出の総額が1%多い世帯は、その費目に何%多く使うか。
# 家計調査の年間収入18階級について、ln(費目の支出) を ln(消費支出) に世帯数の重みつきで回帰した傾き。
# 1未満は暮らしに欠かせない支出(基礎的)、1以上は余裕があると増える支出(選択的)。総務省統計局と同じ考え方。
import math
IC = acc["fies_two_plus_by_income_class_2025"]["data"]
classes = [v for k, v in IC.items() if k != "all" and v.get("consumption_total")]
def elasticity(cat):
    pts = [(math.log(v["consumption_total"]), math.log(v["categories"][cat]), v["household_share_per_10000"]) for v in classes if v["categories"][cat] > 0]
    W = sum(w for _, _, w in pts); mx = sum(x * w for x, _, w in pts) / W; my = sum(y * w for _, y, w in pts) / W
    return sum(w * (x - mx) * (y - my) for x, y, w in pts) / sum(w * (x - mx) ** 2 for x, _, w in pts)
spending["elasticity"] = {CAT[k]: round(elasticity(k), 3) for k in CAT}
spending["quintileTotal"] = {"twoPlus": [round(Q2P[q]["consumption_total"] / Q2P["all"]["consumption_total"], 3) for q in ["Q1", "Q2", "Q3", "Q4", "Q5"]],
                             "single": [round(Q1P[q]["consumption_total"] / Q1P["all"]["consumption_total"], 3) for q in ["Q1", "Q2", "Q3", "Q4", "Q5"]]}
# 地方による支出の違い(二人以上の世帯、全国平均 = 1)
RG = acc["fies_two_plus_by_region_2025"]["data"]["two_plus_households"]
FIES_REGION = {"hokkaido": ["01"], "tohoku": ["02", "03", "04", "05", "06", "07"], "kanto": ["08", "09", "10", "11", "12", "13", "14", "19", "20"],
               "hokuriku": ["15", "16", "17", "18"], "tokai": ["21", "22", "23", "24"], "kinki": ["25", "26", "27", "28", "29", "30"],
               "chugoku": ["31", "32", "33", "34", "35"], "shikoku": ["36", "37", "38", "39"], "kyushu": ["40", "41", "42", "43", "44", "45", "46"], "okinawa": ["47"]}
region_of = {c: r for r, cs in FIES_REGION.items() for c in cs}
spending["region"] = {r: {CAT[k]: round(RG["by_region"][r]["categories"][k] / RG["all"]["categories"][k], 3) for k in CAT} for r in FIES_REGION}
for pref, c in zip(population["prefectures"], codes):
    pref["spendRegion"] = region_of[c]

# 年金:国民生活基礎調査(年齢 × 性別の受給割合と、受給額の分布。万円/年)
PN = acc["kokumin_public_pension_receipt_by_age_sex_2025"]["data"]
def amount_range(k):
    if k.startswith("under"): return 0, int(k[5:])
    if k.endswith("+"): return int(k[:-1]), int(k[:-1]) + 100
    lo, hi = k.split("-"); return int(lo), int(hi)
pension = {"bands": []}
for key in ["60-64", "65-69", "70-74", "75-79", "80+"]:
    lo, hi = rng(key)
    row = {"min": lo, "max": hi}
    for sex in ("male", "female"):
        v = PN[sex][key]; tot = sum(v["amount_class"].values())
        row[sex] = {"rate": round(v["receiving_pct"] / 100, 3), "classes": [[*amount_range(k), round(x / tot, 4)] for k, x in v["amount_class"].items()]}
    pension["bands"].append(row)

# 貯蓄:家計調査 貯蓄・負債編(二人以上の世帯、世帯主の年齢別。保有世帯の分位、万円)
SV = acc["fies_savings_liabilities_by_head_age_2025"]["data"]["savings_quantiles"]["by_age_10yr"]
savings = {"bands": []}
for key, v in SV.items():
    lo, hi = (0, 29) if key == "under30" else rng(key)
    savings["bands"].append({"min": lo, "max": hi, "q": [v["p10"], v["p25"], v["median"], v["p75"], v["p90"]]})

# 検算用の公表値(生成に直接は使っていない合計値)
LT = LF["total"]["total"]
targets = [
    {"key": "workers", "label": "就業者数", "value": LT["employed"] * 1e4, "unit": "people", "source": "労働力調査 2025年平均"},
    {"key": "regular", "label": "正規雇用の人数", "value": LT["regular"] * 1e4, "unit": "people", "source": "労働力調査 2025年平均"},
    {"key": "nonRegular", "label": "非正規雇用の人数", "value": LT["non_regular"] * 1e4, "unit": "people", "source": "労働力調査 2025年平均"},
    {"key": "singles", "label": "一人暮らしの人数", "value": HT["male"]["total"]["single_person"] + HT["female"]["total"]["single_person"], "unit": "people", "source": "国勢調査 2020年(人口が今と異なる)"},
    {"key": "tokyo", "label": "東京都の人口", "value": PA["13"]["total"]["total"] * 1e3, "unit": "people", "source": "人口推計 2025年"},
    {"key": "internet", "label": "インターネット利用者の割合(6歳以上)", "value": cons["ict_usage_by_age"]["data"]["internet_use"]["both"]["all"]["internet_use_pct"] / 100, "unit": "rate", "source": "通信利用動向調査 2025年"},
    {"key": "spendTwoPlus", "label": "二人以上世帯の1人あたり月間支出", "value": round(K2["all"]["consumption_total"] / K2["all"]["avg_household_size"]), "unit": "yen", "source": "家計調査 2025年"},
    {"key": "spendSingle", "label": "単身世帯の月間支出", "value": cons["kakei_single_by_age_sex"]["data"]["single"]["both"]["all"]["consumption_total"], "unit": "yen", "source": "家計調査 2025年"},
    {"key": "married", "label": "配偶者のいる人の割合(15歳以上)", "value": M["total"]["total_15+"]["married_pct"] / 100, "unit": "rate", "source": "国勢調査 2020年"},
]

DIRECT, SEARCH = "一次資料のファイルから直接取得", "検索結果の抜粋から取得(原表と未照合)"
src = lambda use, obj, quality, name=None: {"use": use, "year": str(obj.get("year", "")), "name": name or obj["source_name"], "url": obj.get("source_url"), "quality": quality}
sources = [
    src("年齢・性別の人口", P, DIRECT), src("都道府県別の人口", demo["population_by_prefecture"], DIRECT),
    src("配偶関係", demo["marital_status_by_age_sex"], DIRECT), src("単身世帯の割合", demo["household_family_type"], DIRECT),
    src("年収(雇用形態・年齢・性別、賞与を含む)", acc["wage_by_employment_type_age_sex_2025"] | {"source_url": acc["wage_by_employment_type_age_sex_2025"]["source_url"]["regular"]}, DIRECT),
    src("都道府県別の賃金水準", acc["wage_by_prefecture_2025"], DIRECT), src("パート・アルバイトの時給", cons["wage_structure_by_age_sex"], DIRECT),
    src("居住地(都道府県×年齢×性別)", acc["population_by_prefecture_age_sex_2025"], DIRECT),
    src("就業の内訳(正規・非正規・自営・学生・家事など)", acc["labour_force_status_by_age_sex_2025"], DIRECT),
    src("世帯の種類(年齢×性別)", acc["household_family_type_members_by_age_sex_2020"], DIRECT),
    src("所得階層別の支出", acc["fies_two_plus_by_income_quintile_2025"], DIRECT),
    src("費目ごとの支出弾力性(年間収入18階級から推定)", acc["fies_two_plus_by_income_class_2025"], "一次資料の数値から、このツールで回帰計算"), src("地方別の支出", acc["fies_two_plus_by_region_2025"], DIRECT),
    src("年金の受給割合と受給額", acc["kokumin_public_pension_receipt_by_age_sex_2025"], DIRECT),
    src("貯蓄額(世帯主の年齢別)", acc["fies_savings_liabilities_by_head_age_2025"] | {"source_url": acc["fies_savings_liabilities_by_head_age_2025"]["source_url"]["means_table8_5"]}, DIRECT), src("家計の支出(二人以上世帯)", cons["kakei_two_plus_by_head_age"], DIRECT),
    src("家計の支出(単身世帯)", cons["kakei_single_by_age_sex"], DIRECT), src("ネット・SNS利用率", cons["ict_usage_by_age"], DIRECT),
    {"use": "将来推計人口(5歳階級×性別)", "year": "令和5年推計", "name": "国立社会保障・人口問題研究所「日本の将来推計人口」出生中位・死亡中位(厚生労働省「令和6年財政検証」の入力データとして公開されたファイルから取得。総数は日本統計年鑑の転載値と一致)",
     "url": fut["population_projection"]["five_year_source"]["source_url"], "quality": "公的機関のファイルから直接取得(社人研の原表とは未照合)"},
    src("年代別のテレビ・ネット利用時間", fut["media_usage_time"], DIRECT),
    src("産業別の売上", ind["economic_census_2021"], DIRECT), src("全産業の売上高", ind["corporate_statistics"], "財務省の発表資料(画像形式)を目視で確認"),
    src("小売の業種別・業態別販売額", ind["retail_trade_statistics"], DIRECT), src("家計最終消費支出", ind["national_accounts_household_consumption"], DIRECT),
    src("ネット通販の市場規模", ind["ecommerce_market_survey"], SEARCH),
    {"use": "採用者の5区分", "year": "2003", "name": fut["diffusion_models"]["data"]["rogers_adopter_categories"]["citation"], "url": None, "quality": "書誌情報を確認(比率は解説ページで確認)"},
    {"use": "普及モデルと係数 p・q", "year": "1969 / 1990", "name": fut["diffusion_models"]["data"]["bass_model"]["citation"] + " / Sultan, Farley & Lehmann (1990) Journal of Marketing Research 27, 70-77",
     "url": fut["diffusion_models"]["source_url"], "quality": "係数の平均値は引用している後続論文で確認"},
]

out = {
    "population": population, "marital": marital, "employment": employment, "wage": wage, "household": household,
    "labour": labour, "pension": pension, "savings": savings, "targets": targets,
    "spending": spending, "digital": digital, "media": media, "projection": proj, "industry": industry, "sources": sources,
    "dataAssumptions": [
        {"note": "パート・アルバイトの年収は、年齢・性別ごとの時給 × 年1,000時間とする(労働時間は仮定)", "value": "年1,000時間"},
        {"note": "自営業・家族従業者の年収は正規雇用の0.8倍、役員は1.5倍とする(該当する統計を未取得)", "value": "0.8倍 / 1.5倍"},
        {"note": "世帯の種類は年齢・性別ごとの統計に合わせつつ、既婚者は単身・ひとり親になりにくい、未婚者は夫婦のみ世帯になりにくい、と重みを付ける", "value": "重み 0.03〜0.1"},
        {"note": "2人以上の世帯の支出は、世帯人員で割って1人あたりにする。29歳以下の未婚で親と暮らす人は、親世代(30歳上)の世帯とみなす", "value": "家計調査の平均世帯人員"},
        {"note": "所得階層は、本人の年収に、配偶者や親の平均的な年収を足した見込み額の順位で5つに分ける(世帯単位の所得の統計と直接は結びつかないため)", "value": "五分位"},
        {"note": "貯蓄額は二人以上世帯の統計(貯蓄のある世帯の分布)を、単身の人にも当てはめる", "value": "世帯主の年齢別"},
        {"note": "広告の届きやすさは、年代別のテレビ・ネットの平日利用時間に比例させる(10歳未満は10代、80歳以上は70代の値)", "value": "全年代平均=1"},
        {"note": "将来の人口は、年齢5歳階級×性別の推計人数に合わせる", "value": "出生中位・死亡中位"},
        {"note": "将来の年でも、賃金・支出・ネット利用率は現在の値のまま", "value": "物価・賃金の変化は未反映"},
    ],
    "limits": [
        "ペルソナは統計の分布に合わせて乱数で組み立てた仮想の人で、実在の誰かを再現したものではありません。",
        "年齢・性別ごとの分布は統計に合わせていますが、「年収が高い人ほど都市部に多い」のような項目どうしの関係は、一部しか再現していません。",
        "価値観(価格への敏感さ、新しもの好きなど)は公的統計に無いため、仮定で付けています。",
        "AIインタビューは、AIがその人になりきって答えたものです。実際の人への調査の代わりにはならず、好意的な答えに偏る可能性があります。",
        "普及シミュレーションの係数は過去の耐久消費財などの平均値で、個別の商品に当てはまる保証はありません。",
        "ネット通販の市場規模は、検索結果の抜粋から取っており、原表との照合が済んでいません(「出典」の「確かさ」欄を参照)。",
        "結果は「桁の感覚」と「条件を変えたときの差」を見るためのものです。売上の予測値としてそのまま使わないでください。",
    ],
}
(ROOT / "data" / "japan.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
# ブラウザが通信なしで読めるよう、同じ内容をJSモジュールとしても出力する
(ROOT / "public" / "js" / "japan-data.js").write_text(
    "// scripts/build_data.py が自動生成したファイルです。直接編集しないでください。\nexport default " + json.dumps(out, ensure_ascii=False) + ";\n", encoding="utf-8")
print("data/japan.json を作成しました。総人口(千人):", population["total"], "/ 年齢階級の合計:", sum(g["male"] + g["female"] for g in groups))
