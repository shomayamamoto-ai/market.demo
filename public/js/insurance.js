// 保険と災害:地震保険の加入率(都道府県別・1966年〜)と大きな災害を重ね、
// 「災害のあと、被災した県で加入がどれだけ増え、それがどのくらい続くか」を、ほかの県と比べて測る(差の差)。
import ID from "./insurance-data.js";
import { esc, multiLine } from "./charts.js";

// 主な地震と、強く揺れた県。year は「直前の値」の次の年(加入率の表の年。2012年度までは年度末、2013年からは暦年末)
export const QUAKES = [
  { name: "阪神・淡路大震災", when: "1995年1月", year: 1994, prefs: ["兵庫県"], size: "大" },
  { name: "新潟県中越地震", when: "2004年10月", year: 2004, prefs: ["新潟県"], size: "中" },
  { name: "東日本大震災", when: "2011年3月", year: 2010, prefs: ["宮城県", "岩手県", "福島県"], size: "大" },
  { name: "熊本地震", when: "2016年4月", year: 2016, prefs: ["熊本県"], size: "大" },
  { name: "大阪府北部地震", when: "2018年6月", year: 2018, prefs: ["大阪府"], size: "中" },
  { name: "北海道胆振東部地震", when: "2018年9月", year: 2018, prefs: ["北海道"], size: "中" },
  { name: "能登半島地震", when: "2024年1月", year: 2024, prefs: ["石川県"], size: "大" },
];
const R = ID.eqRate.byPref, avg = (ps, y) => { const v = ps.map((p) => R[p]?.[String(y)]); return v.every((x) => x != null) ? v.reduce((a, b) => a + b, 0) / v.length : null; };
// 被災した県の増え方 − ほかの県の増え方(ポイント)。k 年後
export function quakeEffect(q, k) {
  const rest = Object.keys(R).filter((p) => !q.prefs.includes(p)), b = q.year - 1;
  const a1 = avg(q.prefs, q.year + k), a0 = avg(q.prefs, b), r1 = avg(rest, q.year + k), r0 = avg(rest, b);
  return [a1, a0, r1, r0].includes(null) ? null : { diff: a1 - a0 - (r1 - r0), before: a0, restBefore: r0, after: a1 };
}
export const quakeTable = () => QUAKES.map((q) => ({ ...q, k: [1, 3, 5, 10].map((k) => quakeEffect(q, k)) }));

export function mountInsurance({ before }) {
  const el = document.createElement("section"); el.id = "tab-insurance"; el.className = "tab";
  const nat = ID.eqRate.national, years = Object.keys(nat).map(Number).sort((a, b) => a - b), first = years[0], last = years.at(-1);
  el.innerHTML = `<div class="page-head"><h1>保険と災害</h1><p>地震保険に入っている世帯の割合を、都道府県ごとに大きな地震と重ねます。地震のあと、被災した県で加入がどれだけ増え、どのくらい続いたかを、ほかの県と比べて測ります。</p></div>
    <div class="card"><div class="kpis">
      <div class="kpi"><small>地震保険の世帯加入率(全国)</small><b>${nat[last]}%</b><span>${last}年。${first}年は${nat[first]}%</span></div>
      <div class="kpi"><small>いちばん高い県</small><b id="ins-top"></b><span id="ins-top-sub"></span></div>
      <div class="kpi"><small>いちばん低い県</small><b id="ins-low"></b><span id="ins-low-sub"></span></div></div>
      <div class="form-grid"><label class="wide">比べる県 <select id="ins-pref" multiple size="6">${Object.keys(R).map((p) => `<option${["宮城県", "熊本県", "兵庫県", "東京都"].includes(p) ? " selected" : ""}>${esc(p)}</option>`).join("")}</select></label></div>
      <p class="note">複数の県を選べます(パソコンは Ctrl キーを押しながら、スマホは長押し)。</p>
      <div id="ins-chart"></div></div>
    <div class="card"><h2>地震のあと、被災した県で加入はどれだけ増えたか</h2>
      <p class="note">「被災した県の増え方 − ほかの県の増え方」です(ポイント)。全国でもともと上がっている分を差し引き、地震による上乗せだけを見ます。</p>
      <div id="ins-table" class="table-scroll"></div>
      <div class="analysis"><p class="a-headline" id="ins-head"></p><ul class="facts" id="ins-facts"></ul></div></div>
    <div class="card"><h2>生命保険に入っている世帯の割合(全国)</h2><div id="ins-life"></div>
      <p class="note">生命保険文化センター「生命保険に関する全国実態調査」(約4,000世帯、ほぼ3年ごと)。2003年から県民共済・生協などを含む定義に変わったので、線を分けています。都道府県別は公表されていません。</p></div>
    <div class="card"><h2>出典と注意</h2><ul class="facts">
      <li>地震保険:${esc(ID.eqRate.source)}(<a href="${esc(ID.eqRate.url)}" target="_blank" rel="noopener">表</a>)。都道府県別は1991年から、全国は1966年から。</li>
      <li>損害保険会社の地震保険だけで、JA共済(建物更生共済)などの共済は含みません。共済の多い農村部では、実際に備えている世帯はこれより多いと考えられます。</li>
      <li>加入率は、契約が積み上がった量(ストック)です。長期契約が多いので、一度増えると下がりにくい性質があります。</li>
      <li>年は、2012年度までは年度末、2013年からは暦年末の値です。</li>
      <li>この比べ方は、被災した県とほかの県の差を見る「差の差」です。同じ時期に起きたほかの出来事(保険料の改定など)の影響を、完全には取り除けません。</li></ul></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  const latest = Object.entries(R).map(([p, v]) => [p, v[String(last)]]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
  $("ins-top").textContent = latest[0][0]; $("ins-top-sub").textContent = `${latest[0][1]}%`; $("ins-low").textContent = latest.at(-1)[0]; $("ins-low-sub").textContent = `${latest.at(-1)[1]}%`;
  const colors = ["#b4473b", "#2f8f6b", "#4a7fb5", "#c9a45c", "#7a5ea8", "#8b93a7"];
  const draw = () => { const ps = [...$("ins-pref").selectedOptions].map((o) => o.value).slice(0, 5);
    $("ins-chart").innerHTML = multiLine([{ name: "全国", color: "#555", points: years.map((y) => ({ x: y, y: nat[y] / 100 })) },
      ...ps.map((p, i) => ({ name: p, color: colors[i], points: Object.entries(R[p]).map(([y, v]) => ({ x: Number(y), y: v / 100 })) }))], { xLabel: "年" }); };
  $("ins-pref").onchange = draw;
  el.addEventListener("lab:open", () => { if ($("ins-chart").innerHTML) return; draw();
    const T = quakeTable(), f = (x) => (x == null ? "―" : `${x.diff >= 0 ? "+" : ""}${x.diff.toFixed(1)}`);
    $("ins-table").innerHTML = `<table class="verify"><tr><th>地震</th><th>強く揺れた県</th><th class="num">直前の加入率</th><th class="num">1年後</th><th class="num">3年後</th><th class="num">5年後</th><th class="num">10年後</th></tr>${T.map((q) => `<tr><td>${esc(q.name)}<small>${esc(q.when)}</small></td><td>${esc(q.prefs.join("・"))}</td><td class="num">${q.k[0] ? `${q.k[0].before.toFixed(1)}%<small>ほかの県 ${q.k[0].restBefore.toFixed(1)}%</small>` : "―"}</td>${q.k.map((x) => `<td class="num">${f(x)}</td>`).join("")}</tr>`).join("")}</table>`;
    const big = T.filter((q) => ["東日本大震災", "熊本地震"].includes(q.name)), b5 = big.map((q) => q.k[2]?.diff).filter((v) => v != null);
    $("ins-head").textContent = `被害の大きかった地震(東日本大震災・熊本地震)のあとは、被災した県の加入率が、ほかの県より1年で5〜7ポイント、5年で約${(b5.reduce((a, b) => a + b, 0) / b5.length).toFixed(0)}ポイント多く上がりました。`;
    const tohoku10 = T.find((q) => q.name === "東日本大震災").k[3]?.diff, chuetsu = T.find((q) => q.name === "新潟県中越地震").k[2]?.diff;
    $("ins-facts").innerHTML = [
      `上乗せは消えにくい:東日本大震災の10年後でも+${tohoku10?.toFixed(1)}ポイント残っています。米国の洪水保険では、増えた分が5〜10年で元に戻ると報告されています(Gallagher 2014 を引用した研究で確認)。日本の地震保険は長期契約が多く、加入率は積み上がった量なので、そのまま比べられない点に注意が必要です。`,
      `被害の小さめの地震(大阪府北部・北海道胆振東部)では、上乗せは1〜2ポイントにとどまりました。`,
      `新潟県中越地震のあとは、ほかの県より増えませんでした(5年後 ${chuetsu?.toFixed(1)}ポイント)。この数字は損害保険会社の地震保険だけで、新潟のように共済が多い地域では、共済で備えた分が数えられていない可能性があります(推測です)。`,
      `阪神・淡路大震災のあと、被災地から遠い東京都でも加入率は16.1%(1993年度)から20.7%(1995年度)に上がりました。大きな災害は、被災地以外の備えも動かします。`,
      `地震の危険の大きさと加入はあまり結びついていない、という日本の研究もあります(川脇 2011、計画行政)。`].map((t) => `<li>${esc(t)}</li>`).join("");
    const L = (s, name, color) => ({ name, color, points: Object.entries(s.national).map(([y, v]) => ({ x: Number(y), y: v / 100 })) });
    $("ins-life").innerHTML = multiLine([L(ID.lifeRateOld, "従来の定義(民保+簡保+JA)", "#4a7fb5"), L(ID.lifeRate, "現行の定義(共済なども含む)", "#b4473b")], { xLabel: "年" }); });
  return { tabs: [["insurance", "保険と災害"]] };
}
