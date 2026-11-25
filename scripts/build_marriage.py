#!/usr/bin/env python3
"""結婚・出会い・出生のデータ(data/raw/marriage_params.json)を、画面で使う小さな形にまとめる。出力: public/js/marriage-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/marriage_params.json").read_text()); S = d["series"]
keep = ["nfs_meet_channel_first_marriage", "nfs_love_vs_arranged_by_marriage_year", "nfs_dating_status", "nfs_lifetime_marriage_intention", "nfs_completed_fertility",
        "nfs_ideal_planned_children", "nfs_reasons_fewer_than_ideal", "nfs_marriage_obstacles", "tfr_japan", "births_japan", "tfr_international_latest", "nonmarital_birth_share", "ipss_projection_fertility_components"]
out = {k: {kk: S[k].get(kk) for kk in ("name_ja", "unit", "values", "by_group", "source", "url", "definition")} for k in keep if k in S}
dec = next(p for p in d["params"] if p["key"] == "marriage_vs_marital_fertility_decomposition")
out["decomp"] = dec["estimates"][0]["value"]; out["decompSource"] = dec["estimates"][0].get("citation")
out["facts"] = [{"what": e["what"], "value": e["value"], "citation": e.get("citation"), "url": e.get("url"), "confidence": e.get("confidence")} for p in d["params"] for e in p["estimates"] if e.get("confidence") in ("high", "medium")][:60]
(root / "public/js/marriage-data.js").write_text("// scripts/build_marriage.py が作るファイル(国立社会保障・人口問題研究所 出生動向基本調査・将来推計人口、厚生労働省 人口動態統計ほか)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/marriage-data.js").stat().st_size, "bytes", list(out["decomp"].keys()))
