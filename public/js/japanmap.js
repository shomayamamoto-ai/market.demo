// 日本地図の3D:都道府県の立体地図に、県ごとの数字を色で塗り、仮想の住民が実際の旅客の流れに沿って県から県へ移動する様子を見せる。
import GEO from "./geo-data.js";
import PANEL from "./panel-data.js";
import { createJapan3D } from "./japan3d.js";
import { esc } from "./charts.js";

const COLOR_KEYS = ["old65", "wage", "turnout2024", "eq2025", "wx_rain_days_1mm", "wx_winter_days", "spend_外食", "car2014", "rail2020"];
const colorOf = (k) => (k && PANEL.vars[k] ? { label: PANEL.vars[k].name, unit: PANEL.vars[k].unit, values: Object.fromEntries(PANEL.prefs.map((p, i) => [p, PANEL.vars[k].values[i]])) } : null);
const small = () => matchMedia("(max-width: 640px)").matches;
// 「3Dシミュレーション」の一覧に入れる項目
export function mapHub() {
  const presets = Object.fromEntries(COLOR_KEYS.filter((k) => PANEL.vars[k]).map((k) => [k, { label: `地図の色:${PANEL.vars[k].name}`, rules: { color: k } }]));
  return { key: "japanmap3d", initial: "old65", label: "日本地図:人の移動(都道府県)", presets,
    fixedN: true,
    play: ({ container, rules }) => createJapan3D(container, { ...GEO, color: colorOf(rules.color) }, { people: small() ? 700 : 1400 }),
    summary: (rules) => { const v = PANEL.vars[rules.color], rows = PANEL.prefs.map((p, i) => [p, v.values[i]]).filter((r) => r[1] != null).sort((a, b) => b[1] - a[1]);
      const f = (x) => `${Math.abs(x) >= 1000 ? Math.round(x).toLocaleString("ja-JP") : x.toFixed(1)}${v.unit === "%" ? "%" : ""}`;
      return { cards: [["いちばん高い県", rows[0][0], f(rows[0][1])], ["いちばん低い県", rows.at(-1)[0], f(rows.at(-1)[1])], ["移動の見本", `${small() ? 700 : 1400}人`, "全国幹線旅客純流動調査(2015年度)の県と県の流れに比例"]],
        advice: [`地図の色は「${v.name}」です(出典:${v.source})。`, "人の色は交通手段(鉄道=赤、飛行機=青、バス=緑、車=灰)です。下のボタンで手段ごとに絞り込めます。", "県の中の移動は入っていません。点の数は流れを表す見本で、実際の人数ではありません。"] }; } };
}
// はじめにの画面の上に置く、動く日本地図
export function mountHomeHero(container) {
  let stage = null;
  const go = () => { if (stage) return; stage = createJapan3D(container, { ...GEO, color: colorOf("old65") }, { people: small() ? 400 : 900, paused: matchMedia("(prefers-reduced-motion: reduce)").matches, compact: true }); };
  new IntersectionObserver(([e]) => { if (e.isIntersecting) go(); }).observe(container);
}
export function mountJapanMap({ before }) {
  const el = document.createElement("section"); el.id = "tab-japanmap"; el.className = "tab";
  const opts = COLOR_KEYS.filter((k) => PANEL.vars[k]);
  el.innerHTML = `<div class="page-head"><h1>日本地図で見る</h1><p>都道府県の立体の地図に、県ごとの数字を色で塗ります。仮想の住民が、実際の県と県の旅客の流れに沿って移動します(鉄道=赤、飛行機=青、バス=緑、車=灰)。</p></div>
    <div class="card"><div class="form-grid"><label class="wide">地図の色 <select id="jm-color"><option value="">塗らない</option>${opts.map((k) => `<option value="${k}"${k === "old65" ? " selected" : ""}>${esc(PANEL.vars[k].name)}</option>`).join("")}</select></label></div>
      <div id="jm-stage"></div>
      <p class="note">ドラッグで回す、ホイールや2本指で寄る。下のボタンで、交通手段ごとに絞り込めます。人の行き先と交通手段の割合は、国土交通省「全国幹線旅客純流動調査」(2015年度、県どうしの旅行。県の中の移動は入れていません)に比例させています。点の数は全体の流れを表す見本で、実際の人数ではありません。</p>
      <p class="note">出典:国土数値情報(行政区域 N03-2024、鉄道 N02-2025、駅別乗降客数 S12-2024)を加工して作成(CC BY 4.0)。新幹線は濃い青の線、JR幹線などは灰色の線。紫の柱は乗降客数の上位100駅(2024年度)。</p></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  let stage = null;
  const draw = () => { stage?.stop?.(); const k = $("jm-color").value, P = PANEL.prefs;
    const color = k ? { label: PANEL.vars[k].name, unit: PANEL.vars[k].unit, values: Object.fromEntries(P.map((p, i) => [p, PANEL.vars[k].values[i]])) } : null;
    stage = createJapan3D($("jm-stage"), { ...GEO, color }, { people: small() ? 700 : 1400 }); };
  $("jm-color").onchange = draw;
  el.addEventListener("lab:open", () => { if (!stage) draw(); });
  return { tabs: [["japanmap", "日本地図(人の移動)"]] };
}
