#!/usr/bin/env python3
"""買う気持ち(data/raw/purchase_intent.json)を画面で使う形にまとめる。出力: public/js/purchase-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/purchase_intent.json").read_text()); S = d["series"]
cols = S["esri_cci_monthly_sa"]["columns"]
cci = {k: dict(zip(cols, v)) for k, v in sorted(S["esri_cci_monthly_sa"]["values"].items())}
boj = {k: {f: v.get(f) for f in ("living_DI", "spend_1y_increase", "spend_1y_decrease", "choose_low_price", "choose_safety", "choose_function", "discretionary_spend_down", "px_1y_median_pct")} for k, v in sorted(S["boj_seikatsu_ishiki_quarterly"]["values"].items())}
inc = {g: v["消費者態度指数"] for g, v in S["esri_cci_by_income_annual"]["by_group"].items()}
age = {g: v["消費者態度指数"] for g, v in S["esri_cci_by_age_annual"]["by_group"]["2013-04以降_10歳階級"].items()}
caa = S["caa_purchase_attitudes_by_age_2025"]["by_group"]
AGES = ["15～19歳", "20～29歳", "30～39歳", "40～49歳", "50～59歳", "60～69歳", "70～79歳", "80歳以上", "総数", "男性", "女性"]
bias = {k: {g: caa[k]["groups"][g]["agree_total"] for g in AGES if g in caa[k]["groups"]} for k in list(caa)[6:]}
find = {f["id"]: {"topic": f.get("topic"), "cite": f.get("cite"), "url": f.get("url"), "numbers": f.get("numbers"), "ja": f.get("interpretation_ja")} for f in d["findings"]}
out = {"cci": cci, "boj": boj, "cciIncome": inc, "cciAge": age, "bias": bias, "find": find,
       "sources": {"cci": S["esri_cci_monthly_sa"]["source"], "boj": S["boj_seikatsu_ishiki_quarterly"]["source"], "caa": S["caa_purchase_attitudes_by_age_2025"].get("source")}}
(root / "public/js/purchase-data.js").write_text("// scripts/build_purchase.py が作るファイル(内閣府 消費動向調査、日本銀行 生活意識に関するアンケート調査、消費者庁 消費者意識基本調査、給付金などの研究)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/purchase-data.js").stat().st_size, list(bias)[:2])
