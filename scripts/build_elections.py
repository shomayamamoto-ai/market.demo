#!/usr/bin/env python3
"""衆議院議員総選挙の公式結果(総務省)を、画面用の小さなファイルにまとめる。
入力: data/raw/elections.json  出力: public/js/election-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/elections.json").read_text())
out = {"elections": [], "turnout": {}, "sources": []}
for e in d["house_of_representatives"]:
    out["elections"].append({
        "name": e["election"].split(" ")[0], "date": e["date"], "turnout": e["turnout_pct"],
        "smd": {"seats": e["smd"]["seats"], "parties": [[p["party"], round(p["vote_share_pct"], 3), p["seats"]] for p in e["smd"]["parties"]]},
        "pr": {"seats": e["pr"]["seats"], "parties": [[p["party"], round(p["vote_share_pct"], 3), p["seats"]] for p in e["pr"]["parties"]],
               "blocks": [{"name": b["block"], "seats": b["seats"], "parties": [[p["party"], round(p["votes"]), p["seats"]] for p in b["parties"]]} for b in e["pr"]["blocks"]]},
        "source": e["source_name"], "url": e["source_url"]})
t = d["turnout_series"]
out["turnout"] = {"衆院選": [[x["year"], x["turnout_pct"]] for x in t["house_of_representatives"] if x.get("confidence") != "medium"], "参院選": [[x["year"], x["turnout_pct"]] for x in t["house_of_councillors"] if x.get("confidence") != "medium"], "source": t["source_name"], "url": t["source_url"]}
(root / "public/js/election-data.js").write_text("// scripts/build_elections.py が作るファイル。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/election-data.js").stat().st_size, "bytes", len(out["elections"]), out["turnout"]["衆院選"][:2], out["turnout"]["衆院選"][-2:])
