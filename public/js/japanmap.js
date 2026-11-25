// 日本地図の3D:都道府県の立体地図に、県ごとの数字を色で塗り、仮想の住民が実際の旅客の流れに沿って県から県へ移動する様子を見せる。
import GEO from "./geo-data.js";
import PANEL from "./panel-data.js";
import { createJapan3D } from "./japan3d.js";
import { esc } from "./charts.js";

const COLOR_KEYS = ["old65", "wage", "turnout2024", "eq2025", "wx_rain_days_1mm", "wx_winter_days", "spend_外食", "car2014", "rail2020"];
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
    stage = createJapan3D($("jm-stage"), { ...GEO, color }, { people: matchMedia("(max-width: 640px)").matches ? 700 : 1400 }); };
  $("jm-color").onchange = draw;
  el.addEventListener("lab:open", () => { if (!stage) draw(); });
  return { tabs: [["japanmap", "日本地図で見る"]] };
}
