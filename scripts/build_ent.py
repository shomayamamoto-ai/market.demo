#!/usr/bin/env python3
"""エンタメ(data/raw/entertainment.json)を画面と住民の財布で使う形にまとめる。出力: public/js/ent-data.js"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
d = json.loads((root / "data/raw/entertainment.json").read_text()); S = d["series"]
V = lambda k: S[k]["values"] if k in S else None
ITEMS = {"movie": ["882", "映画・演劇"], "game": ["835", "ゲームソフトなど"], "console": ["836", "ゲーム機"], "book": ["854", "書籍"], "stream": ["889", "配信など(他の教養娯楽サービス)"], "tv": ["放送受信料", "放送受信料"]}
items = {}
for key, (code, label) in ITEMS.items():
    items[key] = {"label": label, "age": V(f"kakei2025_by_age_{code}"), "quintile": V(f"kakei2025_by_quintile_{code}"), "season": V(f"seasonal_kakei_{code}") or {str(m): 1 for m in range(1, 13)},
                  "series": V(f"kakei_{code}_annual") or V("kakei_RCV_annual")}
age = lambda k: V(k)
out = {"items": items,
       "meti": {k: V(f"meti_movie_{k}_annual") for k in ("visitors", "visitors_japanese", "visitors_foreign", "visitors_anime", "screens")},
       "season": {"movie": V("seasonal_movie_visitors"), "anime": V("seasonal_movie_visitors_anime"), "concert": V("seasonal_theater_troupe_music_visitors"), "fitness": V("seasonal_fitness_users")},
       "fitness": V("meti_fitness_members_annual"), "pachinko": V("meti_pachinko_sales_annual"),
       "svod": V("mic2025_svod_use_rate_by_age"), "share": V("mic2025_video_sharing_use_rate_by_age"), "tver": V("mic2025_broadcast_vod_use_rate_by_age"),
       "services": {k.replace("mic2025_service_use_", ""): V(k) for k in S if k.startswith("mic2025_service_use_")},
       "minutes": {k.replace("mic2025_minutes_", ""): V(k) for k in S if k.startswith("mic2025_minutes_")},
       "digitalAge": V("kss2025_digital_total_by_age_all"), "gameComplaints": V("caa_online_game_consultations"), "gameComplaintsU20": V("caa_online_game_consultations_under20"),
       "cpiMovie": V("cpi_映画観覧料"), "cpiTheme": V("cpi_テーマパーク入場料"),
       "find": [{"id": f.get("id"), "topic": f.get("topic"), "cite": f.get("cite"), "ja": f.get("interpretation_ja"), "numbers": f.get("numbers"), "verified": f.get("verified", True)} for f in d.get("findings", [])]}
(root / "public/js/ent-data.js").write_text("// scripts/build_ent.py が作るファイル(総務省 家計調査・家計消費状況調査・通信利用動向調査・情報通信メディアの利用時間と情報行動に関する調査、経済産業省 特定サービス産業動態統計 ほか)。手で書き換えない。\nexport default " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print((root / "public/js/ent-data.js").stat().st_size, {k: bool(v["age"] and v["quintile"]) for k, v in items.items()}, out["svod"])
