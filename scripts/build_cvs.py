#!/usr/bin/env python3
"""コンビニの利用(data/raw/cvs_params.json)を、画面と仮想の住民で使う形にまとめる。出力: public/js/cvs-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/cvs_params.json").read_text()); S = d["series"]; P = {p["key"]: p for p in d["params"]}
persona = P["cvs_share_of_consumption_by_persona"]["estimates"]
single = next(e["value"] for e in persona if e["what"].startswith("単身世帯 2024")); two = next(e["value"] for e in persona if e["what"].startswith("二人以上の世帯 2024"))
items = next(e["value"] for e in P["cvs_share_within_item"]["estimates"] if e["what"].startswith("総世帯 2024"))
freq = P["cvs_visit_frequency"]["estimates"][0]["value"]
out = {"hh": S["hh_cvs_spend_total_households"]["values"], "hhShare": S["hh_cvs_spend_total_households"]["by_group"].get("cvs_share_of_consumption_total_households"),
       "sales": S["meti_cvs_sales_annual"]["values"], "salesMix": {k: v for k, v in S["meti_cvs_sales_annual"]["by_group"].items()}, "stores": S["meti_cvs_stores_yearend"]["values"],
       "single": single, "two": two, "items": items, "freq": freq,
       "sources": {"hh": S["hh_cvs_spend_total_households"].get("source"), "sales": S["meti_cvs_sales_annual"].get("source")}}
(root / "public/js/cvs-data.js").write_text("// scripts/build_cvs.py が作るファイル(総務省 全国家計構造調査、経済産業省 商業動態統計(e-Stat)ほか)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/cvs-data.js").stat().st_size, "bytes", list(single.keys()), list(two.keys())[:3])
