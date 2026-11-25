#!/usr/bin/env python3
"""犯罪と消費者被害(data/raw/crime.json)を画面で使う形にまとめる。出力: public/js/crime-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/crime.json").read_text()); S = d["series"]
keep = ["jp_recog_total", "jp_clearance_rate_total", "jp_recog_theft", "jp_recog_fraud", "jp_recog_shoplift", "jp_arrestees_shoplift", "jp_recog_intrusion", "jp_recog_bicycle",
        "jp_offender_age_theft", "jp_offender_age_penal", "jp_elderly65_arrestees", "jp_victim65_penal", "jp_special_fraud", "jp_sns_invest_romance_fraud", "jp_fraud_victims_by_age",
        "jp_consumer_consultations", "jp_consumer_avg_amount", "jp_consumer_damage_estimate", "jp_consumer_victim_experience", "jp_reentry_rate_prison", "jp_new_inmates_unemployed", "jp_phishing_support_scam_consult"]
ser = {k: {"name": S[k].get("name"), "unit": S[k].get("unit"), "values": S[k].get("values"), "by_group": S[k].get("by_group"), "notes": S[k].get("notes"), "source": S[k].get("source")} for k in keep if k in S}
find = [{"id": f.get("id"), "topic": f.get("topic"), "cite": f.get("cite"), "numbers": f.get("numbers"), "ja": f.get("interpretation_ja"), "verified": f.get("verified", True)} for f in d["findings"]]
(root / "public/js/crime-data.js").write_text("// scripts/build_crime.py が作るファイル(警察庁 犯罪統計・法務省 矯正統計(e-Stat)、総務省 日本統計年鑑、内閣府 高齢社会白書、消費者庁 消費者白書 ほか)。手で書き換えない。\nexport default " + json.dumps({"s": ser, "find": find}, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/crime-data.js").stat().st_size)
