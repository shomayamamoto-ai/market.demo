#!/usr/bin/env python3
"""進学(専門学校・大学・大学院)のデータを、画面で使う形にまとめる。
入力: data/raw/vocational_params.json, data/raw/university_params.json。出力: public/js/education-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
V = json.loads((root / "data/raw/vocational_params.json").read_text())["series"]; Uall = json.loads((root / "data/raw/university_params.json").read_text()); U = Uall["series"]
pick = lambda s, keys=None: {"name": s["name_ja"], "unit": s.get("unit"), "values": s.get("values"), "groups": {k: v for k, v in (s.get("by_group") or {}).items() if keys is None or k in keys}, "source": s.get("source"), "url": s.get("url")}
out = {
  "univRate": pick(V["hs_grad_univ_etc_rate"]), "senmonRate": pick(V["hs_grad_senmon_rate"]), "jobRate": pick(V["hs_grad_employment_rate"]),
  "senmonField": pick(V["senmon_entrants_by_field"]), "senmonPref": pick(V["pref_hs_grad_senmon_rate"]),
  "wage": pick(U["wage_by_education_2025"], ["男女計_高校", "男女計_専門学校", "男女計_高専・短大", "男女計_大学", "男女計_大学院"]),
  "privateLong": pick(U["private_univ_long"], ["志願者数", "入学定員", "定員割れ校の割合%", "学校数"]),
  "gradUnder": pick(U["grad_undergrad_destination"]), "gradOrigin": pick(U["grad_school_entry_origin_2025"]), "entryFlow": pick(U["univ_entry_flow_pref_2025"]),
  "univs": [{k: x.get(k) for k in ("name", "type", "capacity", "applicants", "examinees", "admitted", "enrolled", "ratio", "real_ratio")} for x in Uall["universities"] if x.get("_tag") == "mext_kokkoritsu"],
}
(root / "public/js/education-data.js").write_text("// scripts/build_education.py が作るファイル(文部科学省 学校基本調査・国公立大学入学者選抜、日本私立学校振興・共済事業団、厚生労働省 賃金構造基本統計調査ほか)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/education-data.js").stat().st_size, "bytes", len(out["univs"]), "univs", list(out["wage"]["groups"].keys()))
