#!/usr/bin/env python3
"""企業の売上・利益(法人企業統計 1960〜2025年度)と、転職の流れ(雇用動向調査・就業構造基本調査・しょくばらぼ)を、
画面で使う小さな形にまとめる。出力: public/js/work-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
C = json.loads((root / "data/raw/corp_finance.json").read_text()); J = json.loads((root / "data/raw/job_mobility.json").read_text())
S = C["series"]
ser = lambda k, groups=(): {"name": S[k]["name_ja"], "unit": S[k]["unit"], "values": S[k]["values"], "groups": {g: S[k]["by_group"][g] for g in groups if g in (S[k].get("by_group") or {})}}
sizes = ["資本金10億円以上", "資本金1億円以上10億円未満", "資本金1千万円以上1億円未満", "資本金1千万円未満"]
corp = {"sales": ser("mof_sales", ["製造業", "非製造業"]), "ordinary": ser("mof_ordinary_profit", ["製造業", "非製造業"]), "net": ser("mof_net_income"),
        "margin": ser("mof_ordinary_margin_pct", ["製造業", "非製造業"] + [f"全産業(除く金融保険業)/{x}" for x in sizes]), "labor": ser("mof_labor_share_pct", sizes), "firms": ser("mof_corporations"), "employees": ser("mof_employees"),
        "source": S["mof_sales"].get("source"), "url": S["mof_sales"].get("url")}
M = J["matrices"]
mat = lambda k: {kk: M[k][kk] for kk in ("name_ja", "year", "unit", "rows", "cols", "values", "source", "url") if kk in M[k]}
work = {"industry": mat("industry_flow_2025_all"), "size": mat("size_flow_2025_all"), "type": mat("employment_type_flow_2025"),
        "wageByAge": J["series"]["wage_change_on_job_change_2025"], "entryByAge": J["series"]["job_changer_entry_rate_by_age"], "lfs": J["series"]["lfs_job_changers"],
        "sizeRates": J["series"]["entry_separation_rate_by_firm_size"],
        "companies": [{k: c.get(k) for k in ("name", "industry", "employees", "avg_tenure_male_years", "avg_tenure_female_years", "overtime_h", "midcareer_ratio_pct", "year", "source_url")} for c in J["companies"]]}
out = {"corp": corp, "work": work}
(root / "public/js/work-data.js").write_text("// scripts/build_work.py が作るファイル(財務省 法人企業統計、厚生労働省 雇用動向調査・しょくばらぼ ほか)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/work-data.js").stat().st_size, "bytes")
