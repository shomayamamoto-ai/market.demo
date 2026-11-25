// インバウンド:訪日外国人の数と消費を、国ごと(ISO 3166-1 alpha-3 の国コード)に見て、
// 円高・円安と相手の国の所得の伸びで、国ごとの訪日客と消費がどう変わるかを試算する。都道府県への配分は、国ごとの宿泊の分布で決める。
// 国コードを鍵にしているので、あとで各国の人口・所得・為替を足せば、海外の需要の試算に広げられる。
import IB from "./inbound-data.js";
import GEO from "./geo-data.js";
import { esc, multiLine, hbar } from "./charts.js";
import { createJapan3D } from "./japan3d.js";
import { WORLD } from "./japanmap.js";
import PG from "./pop-grid.js";

export const INBOUND_ASSUMPTIONS = {
  eFx: { value: 1.0, range: [0.5, 1.9], note: "円が1%高くなると、訪日客が何%減るか。外国人の延べ宿泊者で −1.89(RIETI DP 15-J-049)。国ごとのデータでの簡単な推計では0.4〜1.0と小さく、0.5〜1.9の幅で試すのがよい(収集担当の計算)" },
  eInc: { value: 1.0, note: "相手の国の1人あたり所得が1%伸びると、訪日客が何%増えるか。中国は約2.4(観光研究 2020)。ほかの国は、日本の研究が見つからないため1.0と仮定" },
  eIncCHN: { value: 2.4, note: "中国の所得弾力性(観光研究 2020)" },
  spendHome: { value: 1.0, note: "1人あたりの支出が、相手の国の通貨でどれだけ一定か(1=完全に一定。円高になると、円で見た支出がその分減る)。中国の研究で、元で見た支出がほぼ一定とされる。ほかの国にも当てはめるのは仮定" },
};
// 国ごとの試算:yen は円の価値の変化(+10 で10%の円高)、gdp は相手の国の1人あたり所得の伸び(%)
export function countryDemand(iso, { yen = 0, gdp = 0, eFx = INBOUND_ASSUMPTIONS.eFx.value, shock = null } = {}) {
  const c = IB.countries[iso]; if (!c?.total?.["2025"]) return null;
  const eInc = iso === "CHN" ? INBOUND_ASSUMPTIONS.eIncCHN.value : INBOUND_ASSUMPTIONS.eInc.value, y = 1 + yen / 100, g = 1 + gdp / 100;
  const visitors = y ** -eFx * g ** eInc * (shock?.iso === iso ? 1 + shock.pct / 100 : 1), perHead = y ** -INBOUND_ASSUMPTIONS.spendHome.value;
  return { iso, name: c.name, base: c.total["2025"].total, visitors, perHead, spend: c.total["2025"].total * visitors * perHead };
}
export function inboundScenario(opts = {}) {
  const rows = Object.keys(IB.countries).map((iso) => countryDemand(iso, opts)).filter(Boolean);
  const base = rows.reduce((a, r) => a + r.base, 0), spend = rows.reduce((a, r) => a + r.spend, 0);
  // 都道府県への配分:国ごとの延べ宿泊の分布(2025年、従業者10人以上の施設)で、その国の消費の変化を県に割り振る
  const pref = {};
  for (const r of rows) { const N = IB.countries[r.iso].nights; if (!N) continue; const tot = Object.values(N).reduce((a, b) => a + (b ?? 0), 0); if (!tot) continue;
    for (const [p, n] of Object.entries(N)) { const s = (n ?? 0) / tot; (pref[p] ??= { base: 0, spend: 0 }); pref[p].base += r.base * s; pref[p].spend += r.spend * s; } }
  return { rows: rows.sort((a, b) => b.base - a.base), base, spend, pref };
}

export function mountInbound({ before }) {
  const el = document.createElement("section"); el.id = "tab-inbound"; el.className = "tab";
  const T = IB.total.data ?? IB.total, ty = Object.keys(T).sort().at(-1), top = Object.entries(IB.countries).filter(([, c]) => c.total?.["2025"]).sort((a, b) => b[1].total["2025"].total - a[1].total["2025"].total);
  const share5 = top.slice(0, 5).reduce((a, [, c]) => a + c.total["2025"].total, 0) / top.reduce((a, [, c]) => a + c.total["2025"].total, 0);
  el.innerHTML = `<div class="page-head"><h1>インバウンド(訪日外国人)</h1><p>訪日外国人の数と消費を国ごとに見て、円高・円安や相手の国の所得の伸びで、どの国の客と、どの県の消費がどう変わるかを試算します。国は国際的な国コードで区別しているので、あとで海外の需要の試算に広げられます。</p></div>
    <div class="card"><div class="kpis">
      <div class="kpi"><small>訪日外国人の消費</small><b>${(T[ty] / 1e4).toFixed(2)}兆円</b><span>${ty}年。2019年は${(T["2019"] / 1e4).toFixed(2)}兆円</span></div>
      <div class="kpi"><small>上位5か国・地域の割合</small><b>${(share5 * 100).toFixed(0)}%</b><span>${top.slice(0, 5).map(([, c]) => esc(c.name)).join("・")}</span></div>
      <div class="kpi"><small>3大都市圏の宿泊の割合</small><b>${IB.metro?.data?.["2025"] ?? IB.metro?.["2025"] ?? "―"}%</b><span>2025年。地方への広がりは限られる</span></div></div>
      <h3>国・地域ごとの消費(2025年)</h3><div id="ib-top"></div>
      <h3>主な国の入国者の推移</h3><div id="ib-trend"></div>
      <p class="note">出典:観光庁「インバウンド消費動向調査」、法務省「出入国管理統計」(e-Stat)。法務省の入国者は、日本に住む外国人の再入国も含み、日本政府観光局の「訪日外客数」とは定義が違います(2025年:法務省 4,243万人、政府観光局 4,268万人)。推移のグラフは、新しく入国した短期滞在の人(観光客に近い)です。</p></div>
    <div class="card"><h2>訪日外国人の需要が多い県と地域</h2>
      <p class="note">金色の人が訪日外国人です(頭の上にピンクの目印)。国際線の多い空港とクルーズ船の港から入り、外国人の泊数が多い地域へ向かい、滞在して、また空港から帰ります。茶色の点は住んでいる人です。</p>
      <div id="ib-world" class="ls-map"></div>
      <div class="form-grid"><label class="wide">県の並べ方 <select id="ib-sort"><option value="n">外国人の延べ宿泊者数</option><option value="pc">人口1人あたり</option><option value="g">2019年からの伸び</option></select></label></div>
      <div id="ib-prefs" class="table-scroll"></div><h3>外国人の泊数が多い地域(推計、上位15)</h3><div id="ib-areas" class="table-scroll"></div>
      <p class="note">県の値:観光庁「宿泊旅行統計調査」(2025年、外国人延べ宿泊者数)。地域の値は推計です。県の値を、県の中の約10km四方のます目に、「宿泊業・飲食サービス業の従業者のうち、地元の人口では説明できない分」(総務省・経済産業省 経済センサス2021)に比例して配りました。この指標の県ごとの合計は、実際の外国人の泊数と相関0.97(対数では0.86)で、よく一致します。地域の名前は、そのます目で乗降客数が最も多い駅です。市区町村ごとの公式の値ではありません。</p></div>
    <div class="card"><h2>円高・円安、相手の国の所得、特定の国の増減で、どう変わるか</h2><p class="note">最初は「中国からの客が40%減る」場合です(2025年12月〜2026年9月に実際に38〜54%減っています)。</p>
      <div class="form-grid"><label>円の価値の変化(%、プラスが円高) <input id="ib-yen" type="number" min="-50" max="50" step="5" value="0"></label>
        <label>相手の国の所得の伸び(%) <input id="ib-gdp" type="number" min="-20" max="30" step="1" value="0"></label>
        <label>特定の国・地域の客の増減 <select id="ib-siso">${top.slice(0, 15).map(([iso, c]) => `<option value="${iso}"${iso === "CHN" ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
        <label>その増減(%) <input id="ib-spct" type="number" min="-100" max="200" step="10" value="-40"></label>
        <label>為替への反応(弾力性) <select id="ib-efx"><option value="0.5">0.5(小さめ)</option><option value="1" selected>1.0(中間)</option><option value="1.9">1.9(大きめ、宿泊者の研究)</option></select></label></div>
      <div id="ib-out"></div><div id="ib-map" class="ls-map"></div><div id="ib-pref"></div></div>
    <div class="card"><h2>研究と、過去の出来事</h2><ul class="facts">
      <li>円が1%高くなると、外国人の延べ宿泊者は約1.9%減る(旅館は2.5%減)。日本人の宿泊は0.26%減で、ほとんど変わらない(RIETI DP 15-J-049)。</li>
      <li>中国からの訪日客は、中国の所得が1%伸びると約2.4%増える。1人あたりの支出は元で見てほぼ一定なので、円で見た支出は元と円の為替で動く(観光研究 2020)。</li>
      <li>2019年の日韓関係の悪化:韓国からの入国者は年で24.8%減。8月 −45%、9月 −54%、10〜12月は約 −62%。</li>
      <li>2011年の東日本大震災:入国者は年で24.4%減、4月の外国人の宿泊は2月より76%少なかった。翌年は28.5%回復。</li>
      <li>2013年7月のタイ・マレーシアのビザ免除:その年、タイは+68%、マレーシアは+35%(全体は+23%)。同じ年に円安も進んだため、ビザの効果だけを取り出した値ではありません。</li>
      <li>2025年12月から2026年9月まで、中国からの入国者は毎月前年より38〜54%少ない。原因は、許可されたサイトの資料では確認できていません。</li>
      <li>1人あたりの支出(2025年):韓国 約10.5万円、台湾 約18.4万円、中国 約24.7万円、米国 約34.0万円、英国・ドイツ 約39万円。滞在日数が長い国ほど多い(米国12.0泊、オーストラリア13.5泊、韓国4.0泊)。</li>
      <li>確認できなかったこと:日本政府観光局の国別・月別の訪日客数、世界銀行・IMFの各国の所得の長い推移と見通し、免税店の売上。まだ接続を許可していないサイトにあります。</li></ul>
      <p class="note">試算の前提:${Object.values(INBOUND_ASSUMPTIONS).map((a) => esc(a.note)).join(" / ")}。新しい感染症・外交関係・災害などの急な変化は入っていません。</p></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  const oku = (v) => (Math.abs(v) >= 1e4 ? `${(v / 1e4).toFixed(2)}兆円` : `${Math.round(v).toLocaleString("ja-JP")}億円`);
  const draw = () => {
    const yen = Number($("ib-yen").value) || 0, gdp = Number($("ib-gdp").value) || 0, eFx = Number($("ib-efx").value), r = inboundScenario({ yen, gdp, eFx, shock: { iso: $("ib-siso").value, pct: Number($("ib-spct").value) || 0 } });
    $("ib-out").innerHTML = `<div class="analysis"><div class="a-cards"><div class="a-card"><small>訪日外国人の消費(2025年を基準)</small><b>${oku(r.base)} → ${oku(r.spend)}</b> <i>${r.spend >= r.base ? "+" : ""}${(((r.spend - r.base) / r.base) * 100).toFixed(1)}%</i></div></div>
      <div class="table-scroll"><table class="verify"><tr><th>国・地域</th><th class="num">2025年の消費</th><th class="num">試算</th><th class="num">訪日客</th></tr>${r.rows.slice(0, 12).map((x) => `<tr><td>${esc(x.name)} <small>${x.iso}</small></td><td class="num">${oku(x.base)}</td><td class="num">${oku(x.spend)}</td><td class="num">${x.visitors >= 1 ? "+" : ""}${((x.visitors - 1) * 100).toFixed(1)}%</td></tr>`).join("")}</table></div></div>`;
    const P = Object.entries(r.pref).map(([p, v]) => ({ p, d: v.spend - v.base, base: v.base })).sort((a, b) => a.d - b.d);
    $("ib-pref").innerHTML = `<h3>県ごとの消費の変化(大きい順)</h3>` + hbar(P.slice(0, 10).map((x) => ({ label: x.p, value: Math.abs(x.d) })), { fmt: (v) => `${(r.spend >= r.base ? "+" : "−")}${oku(v)}`, labelWidth: 110 }) + `<p class="note">地図の色:県ごとの消費の変化率。国ごとの宿泊の分布で、国ごとの変化を県に割り振っています(日帰りの消費や、宿泊の分布と消費の分布の違いは入っていません)。</p>`;
    createJapan3D($("ib-map"), { ...GEO, color: { label: "訪日外国人の消費の変化率", unit: "%", values: Object.fromEntries(Object.entries(r.pref).map(([p, v]) => [p, v.base ? ((v.spend - v.base) / v.base) * 100 : 0])) } }, { people: matchMedia("(max-width: 640px)").matches ? 400 : 800 });
  };
  ["ib-yen", "ib-gdp", "ib-efx", "ib-siso", "ib-spct"].forEach((id) => ($(id).onchange = draw));
  const popOf = Object.fromEntries(GEO.prefs.map((p) => [p.name, p.pop]));
  const drawPrefs = () => {
    const rows = Object.entries(IB.prefs).map(([p, v]) => ({ p, n: v.nights?.["2025"] ?? 0, n19: v.nights?.["2019"] ?? 0, spend: v.spend?.["2025"] })).filter((r) => r.n > 0).map((r) => ({ ...r, pc: r.n / (popOf[r.p] || 1), g: r.n19 ? r.n / r.n19 - 1 : null }));
    const k = $("ib-sort").value, sorted = rows.sort((a, b) => (b[k] ?? -9) - (a[k] ?? -9)).slice(0, 15), tot = rows.reduce((a, r) => a + r.n, 0);
    $("ib-prefs").innerHTML = `<table class="verify"><tr><th>県</th><th class="num">延べ宿泊者(2025年)</th><th class="num">全国に占める割合</th><th class="num">人口1人あたり</th><th class="num">2019年から</th><th class="num">消費(2025年)</th></tr>${sorted.map((r) => `<tr><td>${esc(r.p)}</td><td class="num">${(r.n / 1e4).toLocaleString("ja-JP", { maximumFractionDigits: 0 })}万泊</td><td class="num">${((r.n / tot) * 100).toFixed(1)}%</td><td class="num">${r.pc.toFixed(2)}泊</td><td class="num">${r.g == null ? "―" : `${r.g >= 0 ? "+" : ""}${(r.g * 100).toFixed(0)}%`}</td><td class="num">${r.spend == null ? "―" : `${Math.round(r.spend).toLocaleString("ja-JP")}億円`}</td></tr>`).join("")}</table>`;
  };
  const drawAreas = () => { const m = new Map(); for (const a of PG.areas) { const key = `${a.name}|${a.pref}`; m.set(key, (m.get(key) ?? 0) + a.foreign); }
    const tot = PG.cells.reduce((a, c) => a + c[4], 0), rows = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    $("ib-areas").innerHTML = `<table class="verify"><tr><th>地域(近くの主な駅)</th><th>県</th><th class="num">外国人の泊数(推計)</th><th class="num">全国に占める割合</th></tr>${rows.map(([k, v]) => { const [n, p] = k.split("|"); return `<tr><td>${esc(n)}駅の周辺</td><td>${esc(p)}</td><td class="num">${(v / 1e4).toLocaleString("ja-JP", { maximumFractionDigits: 0 })}万泊</td><td class="num">${((v / tot) * 100).toFixed(1)}%</td></tr>`; }).join("")}</table>`; };
  el.addEventListener("lab:open", () => {
    if ($("ib-top").innerHTML) return;
    $("ib-sort").onchange = drawPrefs; drawPrefs(); drawAreas();
    const pcColor = { label: "外国人の延べ宿泊者(人口1人あたり、2025年)", unit: "泊", values: Object.fromEntries(Object.entries(IB.prefs).map(([p, v]) => [p, (v.nights?.["2025"] ?? 0) / (popOf[p] || 1)])) };
    createJapan3D($("ib-world"), { ...WORLD(), color: pcColor }, { people: matchMedia("(max-width: 640px)").matches ? 400 : 800, foreign: matchMedia("(max-width: 640px)").matches ? 260 : 520 });
    $("ib-top").innerHTML = hbar(top.slice(0, 12).map(([iso, c]) => ({ label: `${c.name}`, value: c.total["2025"].total })), { fmt: oku, labelWidth: 130 });
    const colors = ["#b4473b", "#2f6fd0", "#c9a45c", "#2f8f6b", "#7a2fb0", "#888"];
    $("ib-trend").innerHTML = multiLine(["CHN", "KOR", "TWN", "USA", "HKG", "THA"].map((iso, i) => ({ name: IB.countries[iso].name, color: colors[i], points: Object.entries(IB.countries[iso].tourists ?? {}).map(([y, v]) => ({ x: Number(y), y: v / 1e6 })) })), { xLabel: "年", fmt: (v) => `${v.toFixed(1)}百万` });
    draw();
  });
  return { tabs: [["inbound", "インバウンド"]] };
}
