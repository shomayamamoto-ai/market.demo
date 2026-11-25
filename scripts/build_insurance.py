#!/usr/bin/env python3
"""保険と災害のデータ(data/raw/insurance_disaster.json)を、画面で使う小さな形にまとめる。
出力: public/js/insurance-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/insurance_disaster.json").read_text())
S = d["series"]
num = lambda m: {k: v for k, v in (m or {}).items() if isinstance(v, (int, float))}
pick = lambda key, pref=True: {"name": S[key]["name_ja"], "unit": S[key].get("unit"), "definition": S[key].get("definition"), "source": S[key].get("source"), "url": S[key].get("url"),
                              "national": num(S[key].get("national")), **({"byPref": {p: num(v) for p, v in (S[key].get("by_pref") or {}).items()}} if pref else {})}
out = {
  "eqRate": pick("eq_household_rate"), "eqAttach": pick("eq_attach_rate"),
  "lifeRateOld": pick("life_hh_rate_all_oldbasis", False), "lifeRate": pick("life_hh_rate_all", False),
  "deaths": pick("disaster_deaths_missing", False),
  "disasters": [{k: x.get(k) for k in ("year", "date", "name", "type", "region", "deaths_missing", "houses_destroyed", "insured_paid_oku_yen")} for x in d["disasters"]],
  "notes": d.get("notes", [])[:12],
}
(root / "public/js/insurance-data.js").write_text("// scripts/build_insurance.py が作るファイル(損害保険料率算出機構・生命保険文化センター・防災白書ほか)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/insurance-data.js").stat().st_size, "bytes", len(out["eqRate"]["byPref"]), "prefs", len(out["disasters"]), "disasters")
