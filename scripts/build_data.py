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
                             "ec": round(net * IS[key]["online_shopping_excl_digital_pct"] / 100, 4)})

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
industry = {
    "unit": "億円",
    "census": {"total": CS["total"]["sales"], "rows": census_rows, "yearNote": "経済センサス-活動調査 2021年調査、売上は2020年の1年間",
               "note": "売上が確認できた11産業のみ表示しています(全体の約93%)。"},
    "corporate": {"sales": CP["sales"]["value"],
                  "note": f"法人企業統計 2025年度の全産業(金融・保険を除く)売上高は約{CP['sales']['value'] / 10000:,.0f}兆円(二次情報のみで確認、要照合)。"},
    "retail": {"total": RT["retail_total"]["value"], "yearNote": "商業動態統計 2025年",
               "rows": [{"label": RT["by_format"][k]["label"].split("(")[0], "value": RT["by_format"][k]["value"]}
                        for k in ["supermarkets", "convenience_stores", "drugstores", "department_stores"]]},
    "ec": {"total": EC["btoc_total"]["value"], "yearNote": "電子商取引に関する市場調査 2025年", "rows": sorted(ec_rows, key=lambda r: -r["value"]),
           "note": f"物販のEC化率は{EC['btoc_physical_goods']['ec_ratio_pct']}%。BtoB-ECは約{EC['btob_ec']['value'] / 10000:,.0f}兆円。"},
    "householdConsumption": {
        "label": "2024年の名目個人消費(厚生労働省「労働経済の分析」の記述)",
        "value": ind["national_accounts_household_consumption"]["data"]["household_final_consumption_total"]["reference_candidate_okuyen"],
        "note": "国の統計は持ち家の家賃相当分なども含むため、家計調査をもとにしたこのモデルの合計より大きくなります。差が大きすぎないかの目安として見てください。",
    },
}

DIRECT, SEARCH = "一次資料のファイルから直接取得", "検索結果の抜粋から取得(原表と未照合)"
src = lambda use, obj, quality, name=None: {"use": use, "year": str(obj.get("year", "")), "name": name or obj["source_name"], "url": obj.get("source_url"), "quality": quality}
sources = [
    src("年齢・性別の人口", P, DIRECT), src("都道府県別の人口", demo["population_by_prefecture"], DIRECT),
    src("配偶関係", demo["marital_status_by_age_sex"], DIRECT), src("単身世帯の割合", demo["household_family_type"], DIRECT),
    src("就業率", demo["employment_rate_by_age_sex"], DIRECT), src("正規・非正規の割合", demo["employment_type_by_age_sex"], DIRECT),
    src("賃金", cons["wage_structure_by_age_sex"], DIRECT), src("家計の支出(二人以上世帯)", cons["kakei_two_plus_by_head_age"], DIRECT),
    src("家計の支出(単身世帯)", cons["kakei_single_by_age_sex"], DIRECT), src("ネット・SNS利用率", cons["ict_usage_by_age"], DIRECT),
    {"use": "将来推計人口(5歳階級×性別)", "year": "令和5年推計", "name": "国立社会保障・人口問題研究所「日本の将来推計人口」出生中位・死亡中位(厚生労働省「令和6年財政検証」の入力データとして公開されたファイルから取得。総数は日本統計年鑑の転載値と一致)",
     "url": fut["population_projection"]["five_year_source"]["source_url"], "quality": "公的機関のファイルから直接取得(社人研の原表とは未照合)"},
    src("年代別のテレビ・ネット利用時間", fut["media_usage_time"], DIRECT),
    src("産業別の売上", ind["economic_census_2021"], SEARCH), src("全産業の売上高", ind["corporate_statistics"], SEARCH),
    src("小売の業態別販売額", ind["retail_trade_statistics"], SEARCH), src("ネット通販の市場規模", ind["ecommerce_market_survey"], SEARCH),
    {"use": "採用者の5区分", "year": "2003", "name": fut["diffusion_models"]["data"]["rogers_adopter_categories"]["citation"], "url": None, "quality": "書誌情報を確認(比率は解説ページで確認)"},
    {"use": "普及モデルと係数 p・q", "year": "1969 / 1990", "name": fut["diffusion_models"]["data"]["bass_model"]["citation"] + " / Sultan, Farley & Lehmann (1990) Journal of Marketing Research 27, 70-77",
     "url": fut["diffusion_models"]["source_url"], "quality": "係数の平均値は引用している後続論文で確認"},
]

out = {
    "population": population, "marital": marital, "employment": employment, "wage": wage, "household": household,
    "spending": spending, "digital": digital, "media": media, "projection": proj, "industry": industry, "sources": sources,
    "dataAssumptions": [
        {"note": "賞与は所定内給与の何か月分か(統計を未取得のため仮定)", "value": "正規 3.0か月 / 非正規 0.5か月"},
        {"note": "自営業・役員は、雇用者の正規・非正規の比率で割り振る", "value": "労働力調査の比率を流用"},
        {"note": "55歳以上の雇用形態別賃金は、50〜54歳の「全体との比」を当てはめる", "value": "比率を流用"},
        {"note": "70歳以上の賃金は、65〜69歳の値を使う", "value": "公表値なし"},
        {"note": "2人以上の世帯の支出は、世帯人員で割って1人あたりにする。24歳以下で親と同居の人は40代後半の世帯とみなす", "value": "家計調査の平均世帯人員"},
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
        "産業別の売上など一部の数値は、検索結果の抜粋から取っており、原表との照合が済んでいません(「出典」の「確かさ」欄を参照)。",
        "結果は「桁の感覚」と「条件を変えたときの差」を見るためのものです。売上の予測値としてそのまま使わないでください。",
    ],
}
(ROOT / "data" / "japan.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
# ブラウザが通信なしで読めるよう、同じ内容をJSモジュールとしても出力する
(ROOT / "public" / "js" / "japan-data.js").write_text(
    "// scripts/build_data.py が自動生成したファイルです。直接編集しないでください。\nexport default " + json.dumps(out, ensure_ascii=False) + ";\n", encoding="utf-8")
print("data/japan.json を作成しました。総人口(千人):", population["total"], "/ 年齢階級の合計:", sum(g["male"] + g["female"] for g in groups))
