#!/usr/bin/env python3
"""文献調査の結果(data/raw/*.json)を、画面の「参考にした文献」の一覧用にまとめる。確かさが「高」「中」の値だけを載せる。
出力: public/js/literature-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
conf = {"high": "高", "medium": "中"}
out = []
d = json.loads((root / "data/raw/models_literature.json").read_text())
for m in d["models"]:
    b = [{"what": x["what"], "c": conf[x["confidence"]]} for x in m["benchmarks"] if x.get("confidence") in conf and "本調査で計算" not in x["what"]]
    out.append({"name": m["name_ja"], "citation": m["citation"], "url": m.get("url"), "benchmarks": b, "missing": len(m.get("not_confirmed") or [])})
def val(v):
    return "" if v is None or isinstance(v, (dict, list)) else f"({v})"
for fn, group in (("behavior_params.json", "行動"), ("marketing_params.json", "マーケティング"), ("psychology_params.json", "心理")):
    d = json.loads((root / "data/raw" / fn).read_text())
    for p in d["params"]:
        est = [e for e in p["estimates"] if e.get("confidence") in conf]
        if not est: continue
        cites = []
        for e in est:
            c = (e.get("citation") or "").strip()
            if c and c not in cites: cites.append(c)
        out.append({"name": f"{group}:{p['name_ja']}", "citation": " / ".join(cites[:3]) + (" ほか" if len(cites) > 3 else ""), "url": next((e.get("url") for e in est if e.get("url")), None),
                    "benchmarks": [{"what": f"{e['what']}{val(e.get('value'))}"[:220], "c": conf[e["confidence"]]} for e in est], "missing": len(p.get("not_confirmed") or [])})
(root / "public/js/literature-data.js").write_text("// scripts/build_literature.py が作るファイル(確かさが「高」「中」の文献値だけ)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(len(out), "entries", sum(len(o["benchmarks"]) for o in out), "values", (root / "public/js/literature-data.js").stat().st_size, "bytes")
