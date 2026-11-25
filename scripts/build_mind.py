#!/usr/bin/env python3
"""心の状態(data/raw/psychology2.json)を、仮想の住民に付ける形にまとめる。出力: public/js/mind-data.js
・性格(ビッグファイブ、TIPI-J):川本ほか 2015 発達心理学研究 26(2) 表3
・生活満足度:内閣府「満足度・生活の質に関する調査」2026年・2025年
・孤独感:内閣官房「人々のつながりに関する基礎調査」2025年(e-Stat)
・心理的苦痛(K6):厚生労働省「国民生活基礎調査」2025年"""
import json, pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/psychology2.json").read_text())
F = {f["id"]: f for f in d["findings"]}
B = d["big5_norms"]
TR = {"Extraversion": "E", "Agreeableness": "A", "Conscientiousness": "C", "Neuroticism": "N", "Openness": "O"}
big5 = {TR[t]: {sex: {band: [v["mean"], v["sd"]] for band, v in B[t][sex].items()} for sex in ("male", "female")} for t in TR}
corr = B["_meta"]["trait_correlations_N4588_Table2"]
swb = F["swb_manzoku2026_sex_age"]["numbers"]["by_sex_age"]
life = {"male": {}, "female": {}}
for k, v in swb.items():
    m = re.match(r"(男性|女性) (\d+)歳", k)
    if m: life["male" if m.group(1) == "男性" else "female"][int(m.group(2))] = v["mean"]
inc = F["swb_manzoku2025_income"]["numbers"]
L = F["lonely_tsunagari_2025"]["numbers"]
k6 = F["k6_kokumin_2025"]["numbers"]["by_sex_age"]
z2h = str.maketrans("０１２３４５６７８９", "0123456789")
def k6band(t):
    out = {}
    for k, v in t.items():
        m = re.match(r"(\d+)", k.translate(z2h))
        if m and "総数" not in k: out[int(m.group(1))] = v["pct_10plus"]
    return out
out = {"big5": big5, "corr": corr, "life": life, "lifeOverall": swb["全体"]["mean"], "lifeSd": swb["全体"]["sd"],
       "lifeIncome": inc["life_satisfaction_by_household_income"], "lifeSpouse": inc["life_satisfaction_by_spouse_employment_age_le64"],
       "lonely": L["direct_often_always_by_sex_age"], "lonelyMarital": L["direct_by_sex_marital"], "lonelyHousehold": L["direct_by_household"],
       "lonelyIncome": L["direct_by_household_income"], "lonelyAll": L["direct_often_always_pct_trend"]["2025"],
       "k6": {"male": k6band(k6["male"]), "female": k6band(k6["female"])}, "k6All": k6["all"]["総数"]["pct_10plus"],
       "sources": {"big5": B["_meta"]["source"], "big5url": B["_meta"]["url"]}}
(root / "public/js/mind-data.js").write_text("// scripts/build_mind.py が作るファイル(川本ほか 2015、内閣府 満足度・生活の質に関する調査、人々のつながりに関する基礎調査、国民生活基礎調査)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/mind-data.js").stat().st_size, out["life"], list(out["k6"]["male"].items())[:4])
