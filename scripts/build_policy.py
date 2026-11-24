#!/usr/bin/env python3
"""税・社会保険・消費税・投票率などの制度と統計の数字を、画面用の小さなファイルにまとめる。
入力: data/raw/political_economy.json  出力: public/js/policy-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/political_economy.json").read_text())
ds = {x["key"]: x for x in d["datasets"]}; st = {x["key"]: x for x in d["studies"]}
D = lambda k: ds[k]["data"]
si = D("social_insurance_rates"); nhi = D("national_health_insurance_average"); ct = D("consumption_tax"); bud = D("general_account_budget_fy2026")
t = D("turnout_by_age")
out = {
  "incomeTax": {"brackets": [[b["up_to"], b["rate"], b["quick_deduction_derived"]] for b in D("income_tax_brackets")["brackets"]], "surtax": D("income_tax_brackets")["reconstruction_special_income_tax_rate_on_base_tax"]},
  "basicDeduction": [[r.get("total_income_up_to"), r["deduction"]] for r in D("basic_deduction")["income_tax_basic_deduction_by_total_income"] if r.get("deduction")],
  "residentBasicDeduction": D("basic_deduction")["resident_tax_basic_deduction_max"],
  "employmentDeduction": {"min": D("employment_income_deduction")["minimum_guarantee"]["2026_effective_minimum"], "cap": D("employment_income_deduction")["cap"]},
  "residentTax": {"rate": D("resident_tax")["income_levy_rate"], "perCapita": D("resident_tax")["per_capita_levy_yen"] + D("resident_tax")["forest_environment_tax_yen"]},
  "social": {"pension": si["employees_pension"]["employee_share"], "health": si["health_insurance_kyokai_kenpo_national_average"]["employee_share"], "care": si["long_term_care_age_40_64"]["employee_share"],
             "child": si["child_support_levy_from_2026_04"]["employee_share"], "employment": si["employment_insurance_general_business"]["employee_share"], "nationalPension": si["national_pension_monthly_premium_yen"]["value"] * 12,
             "nhi": {"rate": nhi["national_average_fy2023_4method_medical_plus_support"]["income_levy_rate"], "perCapita": nhi["national_average_fy2023_4method_medical_plus_support"]["per_capita_yen"], "perHousehold": nhi["national_average_fy2023_4method_medical_plus_support"]["per_household_yen"], "cap": nhi["cap_fy2025_yen"]["total"]}},
  "consumptionTax": {"standard": ct["standard_rate"], "reduced": ct["reduced_rate"], "nationalShare": ct["standard_national"] / ct["standard_rate"], "pending": ct["pending_bill_2026_10"]["content"], "pendingStatus": ct["pending_bill_2026_10"]["status"],
                     "revenueNationalOku": bud["revenue"]["tax_and_stamp"]["consumption_tax"]["oku_yen"]},
  "burden": [{"label": r["income_class"], "income": r["annual_income_man_yen"], "total": r["burden_rate_non_consumption"], "tax": r["burden_rate_direct_tax"], "social": r["burden_rate_social_insurance"]} for r in D("fies_worker_households_burden_by_income_class")["rows"]],
  "nationalBurden": [{"year": r["fiscal_year"], "tax": r["tax_burden"], "social": r["social_security_burden"], "total": r["national_burden_ratio"]} for r in D("national_burden_ratio")["latest"]],
  "turnout": {"衆院選": [{"name": e["election"], "pct": e["turnout_pct"]} for e in t["house_of_representatives"]], "参院選": [{"name": e["election"], "pct": e["turnout_pct"]} for e in t["house_of_councillors"]]},
  "studies": {"vat2014": {"announce": st["vat2014_announcement_effect"]["value"], "implement": st["vat2014_implementation_effect"]["value"], "cite": "Cashin & Unayama (2016) RIETI DP 16-E-052"},
              "minWageTeen": {"value": st["minwage_teen_employment_2007reform"]["value"], "cite": "川口大司・森悠子 (2013) RIETI DP 13-J-009"}},
  "sources": [{"use": x["title"], "name": x["source_name"], "url": x["source_url"], "quality": {"high": "一次資料で確認", "medium": "一部は検索の抜粋で確認", "low": "検索の抜粋で確認"}[x["confidence"]]} for k, x in ds.items()
              if k in ("income_tax_brackets", "basic_deduction", "employment_income_deduction", "resident_tax", "social_insurance_rates", "national_health_insurance_average", "consumption_tax", "fies_worker_households_burden_by_income_class", "turnout_by_age", "general_account_budget_fy2026", "national_burden_ratio")],
}
(root / "public/js/policy-data.js").write_text("// scripts/build_policy.py が作るファイル。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/policy-data.js").stat().st_size, "bytes", out["nationalBurden"], out["basicDeduction"], out["turnout"]["衆院選"][-1])
print(json.dumps(D("national_burden_ratio"), ensure_ascii=False)[:500])
