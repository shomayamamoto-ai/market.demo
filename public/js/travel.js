// 空と陸の移動:国内線の路線ごとの旅客数と座席利用率、空港の乗降客数、バスの利用の長い推移を見て、
// 「鉄道が速くなったら、飛行機からどれだけ移るか」を、交通の論文の選び方のモデル(ロジット)で試算する。
import TD from "./travel-data.js";
import { esc, multiLine, hbar } from "./charts.js";

// 航空と鉄道の選び方のモデルの係数(2005年の幹線旅客純流動調査のデータ。J-STAGE 交通学研究 61号)
export const MODE_COEF = { fare: -0.00029, time: -0.00345, freq: 0.0179, source: "交通学研究 61号(J-STAGE)、2005年の調査データによる航空と鉄道の選択モデル" };
// いまの鉄道の割合に合うように、鉄道側の定数を決めてから、条件を変えたときの鉄道の割合を出す
export function railShareAfter({ shareNow, railTime, railTime2, railFare = 0, railFare2 = 0, railFreq = 0, railFreq2 = 0 }) {
  const odds = shareNow / (1 - shareNow), C = MODE_COEF;
  const du = C.time * (railTime2 - railTime) + C.fare * (railFare2 - railFare) + C.freq * (railFreq2 - railFreq);
  const o2 = odds * Math.exp(du); return o2 / (1 + o2);
}
// 検算:北陸新幹線の開業(2015年)で、東京=金沢の鉄道の割合は42%→75%になった(国土交通省・JRの資料を引用した論文)。
// 東京=金沢の最速の所要時間は約3時間48分 → 約2時間28分(一般に知られている値)
export function hokurikuCheck() { return { model: railShareAfter({ shareNow: 0.42, railTime: 228, railTime2: 148 }), real: 0.75 }; }

export function mountTravel({ before }) {
  const el = document.createElement("section"); el.id = "tab-travel"; el.className = "tab";
  const S = TD.series, last = (o) => o[Object.keys(o).sort().at(-1)], ly = (o) => Object.keys(o).sort().at(-1);
  el.innerHTML = `<div class="page-head"><h1>空と陸の移動</h1><p>国内線の路線ごとの利用、空港の乗降客数、バスの利用の長い推移を見ます。鉄道が速くなったときに、飛行機からどれだけ移るかも試算します。</p></div>
    <div class="card"><div class="kpis">
      <div class="kpi"><small>国内線の旅客数(${ly(S.air_dom_pax_cy.values)}年)</small><b>${(last(S.air_dom_pax_cy.values) / 1e4).toLocaleString("ja-JP", { maximumFractionDigits: 0 })}万人</b><span>座席の埋まり方 ${last(S.air_dom_lf_cy.values)}%</span></div>
      <div class="kpi"><small>LCC(格安航空)の割合</small><b>${last(S.lcc_dom_share_cy.values)}%</b><span>${ly(S.lcc_dom_share_cy.values)}年、国内線</span></div>
      <div class="kpi"><small>路線バス(乗合バス)の利用者</small><b>${(last(S.bus_noriai_pax_fy.values) / 1e8).toFixed(1)}億人</b><span>${ly(S.bus_noriai_pax_fy.values)}年度。1970年度は100.7億人</span></div></div>
      <h3>利用の多い国内線(${TD.latest}年度)</h3><div id="tr-routes"></div>
      <div class="form-grid"><label class="wide">路線を選んで推移を見る <select id="tr-route">${TD.routes.slice(0, 40).map((r, i) => `<option value="${i}">${esc(r.name)}</option>`).join("")}</select></label></div><div id="tr-route-chart"></div>
      <h3>バスの利用の推移</h3><div id="tr-bus"></div>
      <p class="note">出典:国土交通省「航空輸送統計調査」(e-Stat)、「空港管理状況調書」、自動車局の資料(乗合バス・貸切バス・路線の廃止)。路線の旅客数は片道ずつの合計、座席の埋まり方=人キロ÷座席キロ。高速バスは2019年度までと2020年度からで集計方法が違うため、線をつなげていません。</p></div>
    <div class="card"><h2>鉄道が速くなったら、飛行機からどれだけ移るか</h2>
      <p class="note">交通の論文の選び方のモデル(2005年のデータ)を使います。いまの鉄道の割合に合うように土台をそろえ、所要時間・運賃・本数を変えたときの鉄道の割合を出します。</p>
      <div class="form-grid"><label>いまの鉄道の割合(%) <input id="tr-share" type="number" min="1" max="99" value="42"></label>
        <label>いまの鉄道の所要時間(分) <input id="tr-t0" type="number" min="10" value="228"></label><label>新しい所要時間(分) <input id="tr-t1" type="number" min="10" value="148"></label>
        <label>運賃の変化(円、高くなるならプラス) <input id="tr-fare" type="number" step="500" value="0"></label><label>1日の本数の変化(本) <input id="tr-freq" type="number" value="0"></label></div>
      <div id="tr-mode"></div>
      <ul class="facts">
        <li>距離ごとの分担(2015年度):100〜200kmは車86%・鉄道11%、500〜700kmは鉄道64%・航空12%、700〜1,000kmは航空43%・鉄道42%、1,000km以上は航空87%(国土交通省 全国幹線旅客純流動調査)。</li>
        <li>鉄道でおよそ4時間が、飛行機と鉄道の割合が入れ替わる目安とされる(「4時間の壁」。国土交通省・JRの資料を引用した論文)。</li>
        <li>新幹線の開業後の飛行機の旅客(航空輸送統計からの計算):北陸新幹線(2015年)で羽田=小松 −37%、羽田=富山 −41%。北海道新幹線(2016年)で羽田=函館 −5.8%。</li>
        <li>LCCが参入した路線の旅客は1.7〜2.4倍に。LCCの利用者の16%は「LCCが無ければ旅行しなかった」(国土交通政策研究所 2013年の調査)。平均年齢は高速バス38.8歳、LCC 43.1歳、従来の航空会社48.7歳、鉄道49.0歳。</li></ul></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  const drawMode = () => { const share = Math.min(0.99, Math.max(0.01, Number($("tr-share").value) / 100));
    const after = railShareAfter({ shareNow: share, railTime: Number($("tr-t0").value), railTime2: Number($("tr-t1").value), railFare2: Number($("tr-fare").value), railFreq2: Number($("tr-freq").value) }), H = hokurikuCheck();
    $("tr-mode").innerHTML = `<div class="analysis"><div class="a-cards"><div class="a-card"><small>鉄道の割合</small><b>${(share * 100).toFixed(0)}% → ${(after * 100).toFixed(0)}%</b> <i>飛行機は ${((1 - share) * 100).toFixed(0)}% → ${((1 - after) * 100).toFixed(0)}%</i></div></div>
      <p class="a-headline">検算:北陸新幹線(東京=金沢、3時間48分→2時間28分)では、このモデルは鉄道の割合を42%→${(H.model * 100).toFixed(0)}%と出しますが、実際は75%になりました。</p>
      <p class="a-note">このモデルは、時間が短くなる効果をかなり小さく見積もります。2005年のデータで作られた式で、乗り換えの手間や駅までの時間、所要時間が4時間を切ったときに急に乗り換えが進む動きなどを入れていないためと考えられます(推測です)。結果は「控えめな下限」として見てください。</p></div>`; };
  ["tr-share", "tr-t0", "tr-t1", "tr-fare", "tr-freq"].forEach((id) => ($(id).oninput = drawMode));
  const drawRoute = () => { const r = TD.routes[Number($("tr-route").value)];
    $("tr-route-chart").innerHTML = multiLine([{ name: `${r.name}(万人)`, color: "#2f6fd0", points: Object.entries(r.series).map(([y, v]) => ({ x: Number(y), y: v / 1e4 })) }], { xLabel: "年度", fmt: (v) => `${v.toFixed(0)}万` }); };
  $("tr-route").onchange = drawRoute;
  el.addEventListener("lab:open", () => { if ($("tr-routes").innerHTML) return;
    $("tr-routes").innerHTML = hbar(TD.routes.slice(0, 12).map((r) => ({ label: r.name.replace(/線$/, ""), value: r.pax / 1e4 })), { fmt: (v) => `${Math.round(v).toLocaleString("ja-JP")}万人`, labelWidth: 210 });
    drawRoute(); drawMode();
    const L = (o, name, color, k = 1e8) => ({ name, color, points: Object.entries(o).map(([y, v]) => ({ x: Number(y), y: v / k })) });
    $("tr-bus").innerHTML = multiLine([L(S.bus_noriai_pax_fy.values, "路線バス(億人)", "#b4473b"), L(S.bus_kashikiri_pax_fy.values, "貸切バス(億人)", "#2f8f6b")], { xLabel: "年度", fmt: (v) => `${v.toFixed(0)}億` }); });
  return { tabs: [["travel", "空と陸の移動"]] };
}
