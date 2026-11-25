#!/usr/bin/env python3
"""労働市場の公的統計(data/raw/labor_stats.json)と、労働経済学の文献の値(data/raw/labor_literature.json があれば)を、
画面で使う形にまとめる。出力: public/js/labor-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/labor_stats.json").read_text())
S, T = d["series"], d["tables"]
src = {s["id"]: s.get("url") for s in d.get("sources", [])}
def ser(k, group=None):
    v = S[k]; vals = v["by_group"][group] if group else v["values"]
    return {kk: vv for kk, vv in sorted(vals.items()) if vv is not None}
out = {
    "unemp": ser("unemployment_rate_annual"), "jobs": ser("jobs_to_applicants_ratio_annual_jil"),
    "unempM": ser("unemployment_rate_monthly_sa"), "jobsM": ser("jobs_to_applicants_ratio_monthly_sa"),
    "vacancy": ser("vacancy_rate_quarterly_sa"), "empUnemp": ser("employee_unemployment_rate_quarterly_sa"),
    "structural": ser("structural_unemployment_rate_quarterly"),
    "realWage": ser("real_wage_index_annual", "5+_all") or ser("real_wage_index_annual"), "realWage30": ser("real_wage_index_annual", "30+_all"),
    "nomWage30": ser("nominal_wage_index_annual", "30+_all"), "hours": ser("annual_total_hours_worked", "5+_all"), "hoursGen": ser("annual_total_hours_worked", "5+_general"),
    "shunto": ser("shunto_wage_increase_rate"), "minWage": ser("minimum_wage_weighted_avg"),
    "minWagePref": {p: {y: v for y, v in sorted(vals.items()) if v is not None} for p, vals in S["minimum_wage_by_prefecture"]["by_group"].items()},
    "nonReg": {"total": ser("non_regular_share"), "male": ser("non_regular_share", "male"), "female": ser("non_regular_share", "female")},
    "old": {k: {"male": ser(f"employment_rate_age_{k}", "male"), "female": ser(f"employment_rate_age_{k}", "female")} for k in ("60_64", "65_69", "70_74")},
    "mcurve": T["female_lfpr_by_age_mcurve"]["data"],
    "projection": {sc: ser("jilpt_projected_employed_total", sc) for sc in S["jilpt_projected_employed_total"]["by_group"]},
    "projIndustry": T["jilpt_labor_projection_2024"]["data"]["employed_by_industry"],
    "wall": {"adjust": T["nenshu_kabe_part_survey_2021"]["data"]["t20_adjusting_hours_or_not"]["パート"],
             "reasons": T["nenshu_kabe_part_survey_2021"]["data"]["t21_reasons_for_adjustment_multi"]["パート"]["女"],
             "dist": T["nenshu_kabe_part_survey_2021"]["data"]["t16_annual_earnings_distribution"]["パート"]["女"] if "パート" in T["nenshu_kabe_part_survey_2021"]["data"]["t16_annual_earnings_distribution"] else T["nenshu_kabe_part_survey_2021"]["data"]["t16_annual_earnings_distribution"]["計"]["女"]},
    "foreign": ser("foreign_workers_total"), "foreignIndustry": T["foreign_workers_by_industry_2021_2025"]["data"], "foreignStatus": T["foreign_workers_by_status_2021_2025"]["data"],
    "notes": {k: S[k].get("notes") for k in ("unemployment_rate_annual", "real_wage_index_annual", "minimum_wage_weighted_avg", "non_regular_share", "foreign_workers_total") if k in S},
}
lit = root / "data/raw/labor_literature.json"
out["lit"] = json.loads(lit.read_text()).get("findings", []) if lit.exists() else []
(root / "public/js/labor-data.js").write_text("// scripts/build_labor.py が作るファイル(総務省 労働力調査、厚生労働省 一般職業紹介状況・毎月勤労統計・最低賃金・パートタイム・有期雇用労働者総合実態調査・外国人雇用状況、JILPT ユースフル労働統計・労働力需給の推計 ほか)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/labor-data.js").stat().st_size, "bytes; dist keys:", list(out["wall"]["dist"].keys())[:4], "proj:", list(out["projection"].keys()))
