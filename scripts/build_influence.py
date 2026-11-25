#!/usr/bin/env python3
"""人と情報の影響(data/raw/media_psych.json, social_psych.json)を画面で使う形にまとめる。出力: public/js/influence-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
M = json.loads((root / "data/raw/media_psych.json").read_text()); S = json.loads((root / "data/raw/social_psych.json").read_text())
pick = lambda F: [{"id": f.get("id"), "topic": f.get("topic"), "cite": f.get("cite"), "country": f.get("country"), "ja": f.get("interpretation_ja"), "verified": not f.get("unverified", False) and f.get("verified", True) is not False} for f in F]
out = {"tables": M["tables"], "media": pick(M["findings"]), "social": pick(S["findings"])}
(root / "public/js/influence-data.js").write_text("// scripts/build_influence.py が作るファイル(総務省 情報通信メディアの利用時間と情報行動に関する調査、こども家庭庁、消費者庁、NBER・J-STAGE などの論文)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/influence-data.js").stat().st_size, sum(f["verified"] for f in out["media"]), sum(f["verified"] for f in out["social"]))
