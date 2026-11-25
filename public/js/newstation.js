// 新駅・リニアの試算:地図で場所を選ぶと、1kmメッシュの人口・事業所と、近くの既存駅の実績から、
// 新しい駅の周りに住む人、見込みの乗降客数、駅が近くなることでの地価の変化の目安を出す。リニア中央新幹線の駅も同じ方法で見る。
// 大きなデータ(約4MB)は、この画面を開いたときにだけ読み込む。
import GEO from "./geo-data.js";
import { esc } from "./charts.js";

export const NS_ASSUMPTIONS = {
  landRes: { value: -0.194, note: "住宅地の地価は、駅から1km遠いごとに約19.4%低い(駅から2km以内)。2026年の地価公示 全国25,565地点を、市区町村ごとの違いを除いて回帰した値(調査担当の推計)。関係を示すもので、駅ができれば必ずこれだけ上がるという意味ではない" },
  landCom: { value: -0.358, note: "商業地は、駅から1km遠いごとに約35.8%低い(駅から2km以内)。同上" },
  ratio: { value: "近くの駅の実績", note: "見込みの乗降客数 = 新しい駅がいちばん近くなる人の数 × 近く(15km以内)の既存駅の「1日の乗降客数 ÷ 駅から1km以内の人口」の中央値。幅は四分位(下位25%〜上位25%)。乗換駅や商業の集まる駅は人口だけでは決まらないので、目安にとどまる" },
  catchment: { value: "1km", note: "駅勢圏(駅を使う人の範囲)は半径1〜2kmとされる(国土交通省の駅勢圏法)。ここでは、新しい駅のほうが既存の駅より近くなる1kmメッシュの人を「新しく駅が最寄りになる人」とした" },
};
// 1kmメッシュのコード(8桁)から中心の緯度経度
export function meshCenter(code) {
  const s = String(code), p = +s.slice(0, 2), u = +s.slice(2, 4), q = +s[4], v = +s[5], r = +s[6], w = +s[7];
  return [p / 1.5 + q / 12 + (r + 0.5) / 120, 100 + u + v / 8 + (w + 0.5) / 80];
}
export const distKm = (la1, lo1, la2, lo2) => { const x = (lo2 - lo1) * 111.32 * Math.cos(((la1 + la2) / 2) * Math.PI / 180), y = (la2 - la1) * 110.57; return Math.hypot(x, y); };
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
const quant = (a, q) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * q))] : 0; };

// M = mesh-data。lat, lon の場所に駅ができたときの試算
export function analyzeSite(M, lat, lon) {
  if (!M.centers) M.centers = M.codes.map(meshCenter);
  const near = (la, lo, km) => { const out = []; for (let i = 0; i < M.codes.length; i++) { const [a, b] = M.centers[i]; if (Math.abs(a - la) > km / 110 || Math.abs(b - lo) > km / 85) continue; const d = distKm(la, lo, a, b); if (d <= km) out.push([i, d]); } return out; };
  const st = M.stations.filter(([lo, la]) => Math.abs(la - lat) < 0.2 && Math.abs(lo - lon) < 0.25); // 近くの駅だけ(約20km四方)
  const nearestOld = (la, lo) => st.reduce((m, [slo, sla]) => Math.min(m, distKm(la, lo, sla, slo)), Infinity);
  const sum = (cells, f, km) => cells.filter(([, d]) => d <= km).reduce((s, [i]) => s + M[f][i], 0);
  const c3 = near(lat, lon, 3), pop1 = sum(c3, "pop", 1), pop3 = sum(c3, "pop", 3), old1 = sum(c3, "old", 1), emp1 = sum(c3, "emp", 1), shop1 = sum(c3, "shop", 1);
  // 新しい駅がいちばん近くなる人(2km以内)
  let served = 0, lr = 0, lc = 0, lw = 0;
  const newly = c3.filter(([, d]) => d <= 2).map(([i, d]) => { const [a, b] = M.centers[i], old = nearestOld(a, b); return { i, d, old }; }).filter((x) => x.d < x.old - 0.2); // 既存の駅とほぼ同じ場所なら、新しく最寄りになったとは数えない(200m以上近くなる人だけ)
  for (const x of newly) { served += M.pop[x.i]; const dd = Math.min(x.old, 2) - Math.min(x.d, 2); lr += M.pop[x.i] * (Math.exp(-NS_ASSUMPTIONS.landRes.value * dd) - 1); lc += M.pop[x.i] * (Math.exp(-NS_ASSUMPTIONS.landCom.value * dd) - 1); lw += M.pop[x.i]; }
  // 近くの既存駅の「乗降客数 ÷ 1km以内の人口」
  const ratios = st.filter(([lo, la, r]) => r > 0 && distKm(lat, lon, la, lo) <= 15).slice(0, 60).map(([lo, la, r]) => { const p = sum(near(la, lo, 1), "pop", 1); return p > 500 ? r / p : null; }).filter((x) => x != null);
  const rm = median(ratios), rl = quant(ratios, 0.25), rh = quant(ratios, 0.75);
  const dOld = nearestOld(lat, lon);
  return { pop1, pop3, old1, emp1, shop1, served, ridersMid: served * rm, ridersLow: served * rl, ridersHigh: served * rh, nRatios: ratios.length, dOld,
    landRes: lw ? lr / lw : 0, landCom: lw ? lc / lw : 0 };
}

// リニア中央新幹線:駅の位置(町丁目の代表点で近似)と、研究の値
export const LINEAR = [
  { name: "品川(リニア)", pref: "東京都", lat: 35.632106, lon: 139.737307, region: "東京" },
  { name: "神奈川県駅(相模原市 橋本付近)", pref: "神奈川県", lat: 35.5946, lon: 139.3452, region: "大都市圏" },
  { name: "山梨県駅(甲府市 大津町付近)", pref: "山梨県", lat: 35.6123, lon: 138.5694, region: "地方都市" },
  { name: "長野県駅(飯田市 上郷飯沼付近)", pref: "長野県", lat: 35.5275, lon: 137.8524, region: "地方都市" },
  { name: "岐阜県駅(中津川市 千旦林付近)", pref: "岐阜県", lat: 35.4595, lon: 137.4583, region: "地方都市" },
  { name: "名古屋(リニア)", pref: "愛知県", lat: 35.1709, lon: 136.8815, region: "大都市圏" },
];

export function mountNewStation({ before }) {
  const el = document.createElement("section"); el.id = "tab-newstation"; el.className = "tab";
  const prefs = GEO.prefs.map((p) => p.name);
  el.innerHTML = `<div class="page-head"><h1>新駅・リニアの試算</h1><p>地図で場所を選ぶと、そこに駅ができたときに、周りに住む人、新しく駅が最寄りになる人、見込みの乗降客数、地価の変化の目安を出します。リニア中央新幹線の駅も選べます。</p></div>
    <div class="card"><div class="form-grid"><label>リニアの駅から選ぶ <select id="ns-linear"><option value="">選ばない</option>${LINEAR.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join("")}</select></label>
      <label>都道府県の地図 <select id="ns-pref">${prefs.map((p) => `<option${p === "神奈川県" ? " selected" : ""}>${esc(p)}</option>`).join("")}</select></label>
      <label>緯度 <input id="ns-lat" type="number" step="0.0001" value="35.5946"></label><label>経度 <input id="ns-lon" type="number" step="0.0001" value="139.3452"></label></div>
      <p class="note">地図をタップ(クリック)すると、その場所を候補にします。灰色の点は既存の駅、赤い点が候補の場所です。</p>
      <div id="ns-map" class="ns-map"></div><div class="form-row"><button id="ns-run" class="primary">この場所で試算する</button></div><p id="ns-msg" class="msg"></p>
      <div id="ns-out"></div></div>
    <div class="card"><h2>リニア中央新幹線について(公表されていること)</h2><ul class="facts">
      <li>所要時間:品川〜名古屋 約40分(286km)、東京〜大阪 約67分。最高速度 時速505km(国土交通省 資料)。</li>
      <li>開業時期:国の資料では品川〜名古屋が「2027年以降」。JR東海は2024年3月に「2027年の開業は実現できず、新しい時期も見通せない」と説明し、静岡工区はまだ着工していません(2026年5月15日時点の国土交通省の資料)。</li>
      <li>研究の試算(RIETI DP 22-E-060):リニアで地価は全国平均 +0.743%、東京 +1.342%、地方都市 −0.197%。行ける範囲(市場アクセス)が1%広がると、地価 +0.176%、所得 +0.425%。</li>
      <li>山梨県駅の試算(土木学会論文集):地価 約+0.3%、県内の総生産 約+73億円、働く人 約+1,500人。</li>
      <li>過去の新幹線の例:九州新幹線の全線開業で博多の都市圏の地価 +10.7%。金沢開業で石川県の観光客 +15.8%(首都圏から +87.8%)。九州新幹線の駅のある地域で、取引先の数が約4割増えた業種がある(NBER w21082)。</li>
      <li><b>ストロー効果</b>:地方の新幹線の駅の周りでは、人口の社会増減がマイナスの例があり、北陸新幹線の金沢延伸の後は東京圏への転出が増えた(J-STAGE の論文。符号のみ)。新幹線が無ければ東京は6.3%、大阪は4.4%大きかった(RIETI DP 21-E-003)。地方の駅の近くで商売を始める場合は、来る人が増える一方で、地元の人が大都市で買い物をするようになる面もある。</li></ul>
      <p class="note">駅の位置は、町丁目の代表点で近似しています(誤差は数百m〜1km)。JR東海・県・市のサイトは許可外のため、正確な位置は確認できていません。</p></div>
    <div class="card"><h2>この試算はどれくらい当たるか(検算)</h2>
      <p>乗降客数が公表されている既存の駅を60駅選び、その駅が「無いもの」として同じ方法で試算し、実際の乗降客数と比べました(ほかの駅に近すぎて試算できなかった19駅を除く41駅)。</p>
      <ul class="facts"><li>予測は実際の約0.72倍で、やや少なめに出ます。</li><li>ずれは、ふつう2.7倍くらいあります(半分の駅で、予測と実際の差が2.7倍以内)。</li><li>実際の値が、画面に出す幅(下位25%〜上位25%)に入ったのは39%でした。</li></ul>
      <p class="note">人口だけで乗降客数を当てるのは難しく、桁の目安(数百人か、数千人か、数万人か)として使ってください。大学・病院・大きな商業施設・乗換の有無を入れると良くなると考えられます(推測です)。</p></div>
    <div class="card"><h2>この試算の前提</h2><ul class="facts">${Object.values(NS_ASSUMPTIONS).map((a) => `<li>${esc(a.note)}</li>`).join("")}
      <li>出典:総務省「国勢調査」(2020年)・「経済センサス」(2021年)の1kmメッシュ統計、国土数値情報(駅別乗降客数 S12・行政区域 N03)を加工して作成。乗降客数が公表されていない駅(JR東日本・JR北海道の無人駅など)は、距離の計算にだけ使っています。</li></ul></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  let M = null;
  const load = async () => { if (M) return M; $("ns-msg").textContent = "1kmメッシュの人口と駅のデータを読み込んでいます…(約4MB)"; M = (await import("./mesh-data.js")).default; $("ns-msg").textContent = ""; return M; };
  // 県の地図(SVG):緯度経度をそのまま平面に。クリックで候補地を決める
  const drawMap = () => { const p = GEO.prefs.find((x) => x.name === $("ns-pref").value); if (!p) return;
    const pts = p.polys.flat(), lo0 = Math.min(...pts.map((c) => c[0])), lo1 = Math.max(...pts.map((c) => c[0])), la0 = Math.min(...pts.map((c) => c[1])), la1 = Math.max(...pts.map((c) => c[1]));
    const k = Math.cos(((la0 + la1) / 2) * Math.PI / 180), W = 600, H = Math.max(260, Math.min(600, (W * (la1 - la0)) / ((lo1 - lo0) * k)));
    const X = (lo) => ((lo - lo0) / (lo1 - lo0)) * (W - 20) + 10, Y = (la) => ((la1 - la) / (la1 - la0)) * (H - 20) + 10;
    const sts = M ? M.stations.filter(([lo, la]) => lo >= lo0 && lo <= lo1 && la >= la0 && la <= la1) : [];
    const lat = Number($("ns-lat").value), lon = Number($("ns-lon").value);
    $("ns-map").innerHTML = `<svg viewBox="0 0 ${W} ${H}" data-lo0="${lo0}" data-lo1="${lo1}" data-la0="${la0}" data-la1="${la1}">${p.polys.map((r) => `<path d="${r.map((c, i) => `${i ? "L" : "M"}${X(c[0]).toFixed(1)},${Y(c[1]).toFixed(1)}`).join("")}Z" fill="#efe6d2" stroke="#9a8a70" stroke-width="1"/>`).join("")}
      ${sts.map(([lo, la, r]) => `<circle cx="${X(lo).toFixed(1)}" cy="${Y(la).toFixed(1)}" r="${r > 100000 ? 3.5 : 2}" fill="#666" opacity=".6"/>`).join("")}
      ${lon >= lo0 && lon <= lo1 && lat >= la0 && lat <= la1 ? `<circle cx="${X(lon)}" cy="${Y(lat)}" r="7" fill="#c0392b" stroke="#fff" stroke-width="2"/>` : ""}</svg>`;
    $("ns-map").querySelector("svg").onclick = (e) => { const svg = e.currentTarget, rc = svg.getBoundingClientRect(), x = ((e.clientX - rc.left) / rc.width) * W, y = ((e.clientY - rc.top) / rc.height) * H;
      $("ns-lon").value = (lo0 + ((x - 10) / (W - 20)) * (lo1 - lo0)).toFixed(4); $("ns-lat").value = (la1 - ((y - 10) / (H - 20)) * (la1 - la0)).toFixed(4); $("ns-linear").value = ""; drawMap(); run(); }; };
  const fmtN = (v) => Math.round(v).toLocaleString("ja-JP");
  const run = async () => { await load(); const lat = Number($("ns-lat").value), lon = Number($("ns-lon").value);
    if (!(lat > 20 && lat < 46 && lon > 122 && lon < 154)) { $("ns-msg").textContent = "日本の中の場所を選んでください。"; return; }
    const r = analyzeSite(M, lat, lon), L = LINEAR[Number($("ns-linear").value)] ?? null;
    $("ns-out").innerHTML = `<div class="analysis"><h2>${L ? esc(L.name) : `北緯${lat.toFixed(3)}・東経${lon.toFixed(3)}`} の試算</h2>
      <div class="a-cards"><div class="a-card"><small>半径1km・3kmに住む人</small><b>${fmtN(r.pop1)}人</b> <i>3kmでは${fmtN(r.pop3)}人。1km以内の65歳以上 ${r.pop1 ? Math.round((100 * r.old1) / r.pop1) : 0}%</i></div>
        <div class="a-card"><small>いちばん近い既存の駅まで</small><b>${r.dOld === Infinity ? "―" : `${r.dOld.toFixed(1)}km`}</b> <i>近いほど、新駅の意味は小さい</i></div>
        <div class="a-card"><small>新しく駅が最寄りになる人</small><b>${fmtN(r.served)}人</b> <i>2km以内で、既存の駅より近くなる人</i></div>
        <div class="a-card"><small>見込みの乗降客数(1日)</small><b>${fmtN(r.ridersMid)}人</b> <i>幅 ${fmtN(r.ridersLow)}〜${fmtN(r.ridersHigh)}人(近くの${r.nRatios}駅の実績から)</i></div>
        <div class="a-card"><small>1km以内で働く人</small><b>${fmtN(r.emp1)}人</b> <i>うち小売・飲食・宿泊 ${fmtN(r.shop1)}人</i></div>
        <div class="a-card"><small>駅が近くなる人の地価の変化(目安)</small><b>住宅地 +${(r.landRes * 100).toFixed(0)}%</b> <i>商業地 +${(r.landCom * 100).toFixed(0)}%(駅からの距離と地価の関係から)</i></div></div>
      <p class="a-headline">${r.dOld < 0.3 ? `既存の駅(約${Math.round(r.dOld * 1000)}m)とほぼ同じ場所です。地元で新しく駅が最寄りになる人は増えません。${L ? "リニアの駅の効果は、遠くとの行き来が速くなることが中心です(下の研究の値を参照)。" : ""}` : r.served < 2000 ? "新しく駅が最寄りになる人が少ない場所です。既存の駅に近いか、人が少ないため、新駅の利用は限られそうです。" : r.dOld < 1.2 ? "既存の駅に近いため、新しい利用者の多くは近くの駅から移る人になりそうです。" : "既存の駅から離れていて、新しく駅が最寄りになる人が一定数いる場所です。"}</p>
      ${L ? `<p class="a-note">リニアの駅の場合、地元の人だけでなく、遠くから来る人(と出ていく人)が大きく変わります。上の数字は「地元の人の数」の目安で、リニアの利用者数そのものではありません。研究では、${L.region === "東京" ? "東京の地価は+1.3%程度" : L.region === "大都市圏" ? "大都市の地価は上がる方向" : "地方都市の地価は全体で−0.2%程度(ストロー効果を含む)、ただし駅のすぐ近くは別に動きうる"}という試算があります(RIETI DP 22-E-060)。</p>` : ""}
      <p class="a-note">乗降客数は、近くの駅の「人口あたりの乗降」をそのまま当てはめた目安です。乗換駅・大学・大きな商業施設がある駅は、人口だけでは決まりません。地価は「駅に近い土地ほど高い」という関係を当てはめた値で、新駅ができても同じだけ上がるとは限りません(因果ではなく関係)。</p></div>`;
    drawMap(); };
  $("ns-run").onclick = run; $("ns-pref").onchange = drawMap;
  $("ns-linear").onchange = () => { const s = LINEAR[Number($("ns-linear").value)]; if (!s) return; $("ns-lat").value = s.lat; $("ns-lon").value = s.lon; $("ns-pref").value = s.pref; run(); };
  el.addEventListener("lab:open", async () => { if ($("ns-out").innerHTML) return; await load(); $("ns-linear").value = "1"; drawMap(); run(); });
  return { tabs: [["newstation", "新駅・リニアの試算"]] };
}
