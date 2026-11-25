#!/usr/bin/env python3
"""インバウンド(data/raw/inbound.json)を、国ごと(ISO 3166-1 alpha-3 の国コード)に画面と試算で使う形にまとめる。
あとで海外の需要(国ごとの人口・所得・為替)を足せるよう、国コードを鍵にしている。出力: public/js/inbound-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/inbound.json").read_text())
C = {}
for iso, c in d["countries"].items():
    a = c.get("attributes") or {}
    C[iso] = {"name": {"TWN": "台湾", "HKG": "香港"}.get(iso, c["name_ja"]),  # 観光庁の表記に合わせる
               "region": c.get("region"), "arrivals": c.get("arrivals"), "tourists": c.get("arrivals_new_short_stay"),
              "spend": {y: v for y, v in (c.get("spend_per_visitor") or {}).items()}, "total": c.get("spend_total_oku_yen"),
              "profile": (c.get("trip_profile") or {}).get("2025") or (c.get("trip_profile") or {}).get("2024"),
              "nights": c.get("guest_nights_by_pref"), "pop": a.get("population"), "gdppc": a.get("gdp_per_capita_usd"), "gdppcHist": a.get("gdp_per_capita_hist_usd")}
S = d["series"]; sv = lambda k: S[k]["values"] if k in S and "values" in S[k] else S.get(k)
P = {k: {"nights": v.get("foreign_guest_nights"), "spend": v.get("inbound_consumption_oku_yen"), "visitors": v.get("visitors_10k")} for k, v in d["prefectures"].items() if isinstance(v, dict) and "foreign_guest_nights" in v}
out = {"countries": C, "prefs": P, "total": sv("inbound_consumption_total_oku_yen"), "season": sv("foreign_guest_nights_seasonality_index_2023_2025"),
       "metro": sv("three_metro_share_foreign_guest_nights_pct"), "nightsNat": sv("foreign_guest_nights_national_annual"), "entries": sv("moj_foreign_entries_total_annual"),
       "fx": d["fx"].get("JPY_per_unit"), "defs": d.get("definitions"),
       "find": [{"id": f.get("id"), "topic": f.get("topic"), "cite": f.get("cite"), "ja": f.get("interpretation_ja"), "numbers": f.get("numbers")} for f in d["findings"]]}
(root / "public/js/inbound-data.js").write_text("// scripts/build_inbound.py が作るファイル(法務省 出入国管理統計(e-Stat)、観光庁 インバウンド消費動向調査・宿泊旅行統計調査、総務省 世界の統計、財務省 国際収支 ほか)。国は ISO 3166-1 alpha-3 の国コードで区別する。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/inbound-data.js").stat().st_size, out["total"] if not isinstance(out["total"], dict) else list(out["total"].items())[-3:], type(out["season"]), list(out["fx"].items())[:2] if isinstance(out["fx"], dict) else None)
