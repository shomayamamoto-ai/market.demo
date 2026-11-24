#!/usr/bin/env python3
"""衆院小選挙区の選挙区別の結果(data/raw/smd_districts.json、総務省 結果調「候補者別得票数(小選挙区)」)を、
画面で使う小さな形にまとめる。得票率は小数1桁、2%未満の候補は省く(当落の計算にほぼ影響しないため)。党派の表記は全国集計(election-data.js)にそろえる。
出力: public/js/smd-data.js  {elections:[{name, parties:[党...], districts:[[選挙区名, [党の番号, 得票率%, ...]], ...]}]}"""
import json, pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/smd_districts.json").read_text())
nat = re.search(r"export default (.*);\s*$", (root / "public/js/election-data.js").read_text(), re.S).group(1)
names = [{p[0] for p in e["smd"]["parties"]} for e in json.loads(nat)["elections"]]
out = []
for i, e in enumerate(d["elections"]):
    known = names[i]
    def label(n):
        if n == "（無所属）": return "無所属"
        m = re.fullmatch(r"（(.*)）.?", n)  # 例:「（新党フリーウェイクラブ）新」のように後ろに1文字付くものがある
        if m: return m.group(1) if m.group(1) in known else "諸派"
        if n.startswith("（"): return "諸派"  # 第48回の表で途中で切れている団体名(本人届出・推薦届出)
        for k in known:
            if n.startswith(k) and n != k: return k  # 例:「ＮＨＫと裁判してる党弁護士法７２条違反で」→ 全国集計の短い表記
        return n
    ds = []
    for dist in e["districts"]:
        tot = sum(c[1] for c in dist["cands"])
        ds.append([dist["name"], [[label(c[0]), round(100 * c[1] / tot, 1)] for c in sorted(dist["cands"], key=lambda c: -c[1]) if 100 * c[1] / tot >= 2]])
    unknown = {c[0] for _, cs in ds for c in cs} - known
    assert not unknown, (e["election"], unknown)
    parties = sorted({c[0] for _, cs in ds for c in cs})
    # 小さくするため、党は parties の番号、候補は [番号, 得票率, 番号, 得票率, ...] の平たい並びにする
    out.append({"name": e["election"], "parties": parties, "districts": [[n, [x for c in cs for x in (parties.index(c[0]), c[1])]] for n, cs in ds]})
src = [{"election": s["election"], "url": s["url"]} for s in d["source"]]
(root / "public/js/smd-data.js").write_text("// scripts/build_smd.py が作るファイル(総務省 衆議院議員総選挙結果調 候補者別得票数(小選挙区))。手で書き換えない。\nexport default " + json.dumps({"elections": out, "sources": src}, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(len(out), "elections", sum(len(e["districts"]) for e in out), "districts", (root / "public/js/smd-data.js").stat().st_size, "bytes")
