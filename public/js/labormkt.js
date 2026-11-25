// 労働市場:失業率と求人倍率、欠員と失業の関係(ベバリッジ曲線)、賃金・春闘・最低賃金、女性の働き方(M字カーブ)、年収の壁、
// 2040年の働き手の見通し、外国人労働者を、公的統計の長い推移で見る。労働経済学の研究の値も並べる。
import LB from "./labor-data.js";
import { esc, multiLine, hbar, vbar } from "./charts.js";

const last = (o) => { const k = Object.keys(o).sort().at(-1); return [k, o[k]]; };
const pts = (o, k = 1, f = Number) => Object.entries(o).map(([x, y]) => ({ x: f(x), y: y / k }));
const SC = { "growth_participation (成長実現・労働参加進展)": "成長し、働く人が増える", "baseline_gradual (成長率ベースライン・労働参加漸進)": "ふつうの成長", "zero_growth_current (一人当たりゼロ成長・労働参加現状)": "成長せず、働き方も今のまま" };

// 年収の壁:パートで働く女性の年収の分布(統計)と、仮想の住民の分布を、同じ区切りで比べる
export const WALL_BINS = [["100万円未満", 0, 100], ["100～110万円未満", 100, 110], ["110～120万円未満", 110, 120], ["120～130万円未満", 120, 130], ["130～140万円未満", 130, 140], ["140～150万円未満", 140, 150], ["150～200万円未満", 150, 200], ["200万円以上", 200, 1e9]];
export function wallCompare(personas) {
  const D = LB.wall.dist, known = 100 - (D["昨年の現在の就業形態で得た年収なし"] ?? 0) - (D["不明"] ?? 0);
  const real = WALL_BINS.map(([k, lo]) => (lo >= 200 ? ["200～250万円未満", "250～300万円未満", "300～500万円未満", "500万円以上"].reduce((a, x) => a + (D[x] ?? 0), 0) : D[k] ?? 0) / known);
  const f = (personas ?? []).filter((p) => p.sex === "female" && p.work === "パート・アルバイト" && p.income > 0), W = f.reduce((a, p) => a + p.weight, 0);
  const model = WALL_BINS.map(([, lo, hi]) => (W ? f.filter((p) => p.income >= lo && p.income < hi).reduce((a, p) => a + p.weight, 0) / W : 0));
  return WALL_BINS.map(([k], i) => ({ label: k.replace(/～(\d+)万円未満/, "〜$1万円"), real: real[i], model: model[i] }));
}
// 欠員率と雇用失業率の点を、10年ごとに色を変えて結ぶ(ベバリッジ曲線)
function beveridge() {
  const qs = Object.keys(LB.vacancy).filter((q) => LB.empUnemp[q] != null).sort(), W = 640, H = 300, L = 48, R = 14, T = 16, B = 36;
  const xs = qs.map((q) => LB.empUnemp[q]), ys = qs.map((q) => LB.vacancy[q]), x0 = 0, x1 = Math.ceil(Math.max(...xs)), y0 = 0, y1 = Math.ceil(Math.max(...ys));
  const X = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - R), Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const dec = (q) => Math.floor(Number(q.slice(0, 4)) / 10) * 10, decs = [...new Set(qs.map(dec))], col = (d) => `hsl(${20 + ((d - decs[0]) / Math.max(10, decs.at(-1) - decs[0])) * 200},55%,45%)`;
  const path = decs.map((d) => { const s = qs.filter((q) => dec(q) === d); return `<path d="${s.map((q, i) => `${i ? "L" : "M"}${X(LB.empUnemp[q]).toFixed(1)},${Y(LB.vacancy[q]).toFixed(1)}`).join("")}" fill="none" stroke="${col(d)}" stroke-width="2"/><text x="${X(LB.empUnemp[s.at(-1)]) + 4}" y="${Y(LB.vacancy[s.at(-1)]) - 4}" class="sub" fill="${col(d)}">${d}年代</text>`; }).join("");
  const ticks = [...Array(x1 + 1).keys()].map((v) => `<text x="${X(v)}" y="${H - 18}" text-anchor="middle" class="sub">${v}%</text>`).join("") + [...Array(y1 + 1).keys()].map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="axis"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="sub">${v}%</text>`).join("");
  const lq = qs.at(-1);
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${ticks}${path}<circle cx="${X(LB.empUnemp[lq])}" cy="${Y(LB.vacancy[lq])}" r="5" fill="#b4473b"/><text x="${W - R}" y="${H - 2}" text-anchor="end" class="sub">横:雇用失業率 縦:欠員率(${esc(lq)}が赤い点)</text></svg>`;
}

export function mountLaborMarket({ before, getPersonas }) {
  const el = document.createElement("section"); el.id = "tab-labormkt"; el.className = "tab";
  const [uy, u] = last(LB.unemp), [jy, j] = last(LB.jobs), [sy, s] = last(LB.shunto), [my, mw] = last(LB.minWage), [fy, fw] = last(LB.foreign);
  const prefMW = Object.entries(LB.minWagePref).map(([p, v]) => ({ p, now: v[my] ?? last(v)[1], first: v["2002"] }));
  const hiP = [...prefMW].sort((a, b) => b.now - a.now)[0], loP = [...prefMW].sort((a, b) => a.now - b.now)[0];
  const proj = Object.entries(LB.projection).map(([k, v]) => [SC[k] ?? k, v["2040"]]);
  el.innerHTML = `<div class="page-head"><h1>労働市場</h1><p>失業率と求人倍率、賃金と最低賃金、女性と高齢者の働き方、年収の壁、2040年の働き手の見通しを、公的統計の長い推移で見ます。労働経済学の研究でわかっていることも並べます。</p></div>
    <div class="card"><div class="kpis">
      <div class="kpi"><small>完全失業率</small><b>${u}%</b><span>${uy}年。最も高かったのは2002年の${LB.unemp["2002"]}%</span></div>
      <div class="kpi"><small>有効求人倍率</small><b>${j}倍</b><span>${jy}年。求職者1人に対する求人の数</span></div>
      <div class="kpi"><small>春の賃上げ率(主要企業)</small><b>${s}%</b><span>${sy}年。定期昇給を含む</span></div>
      <div class="kpi"><small>最低賃金(全国の加重平均)</small><b>${Math.round(mw).toLocaleString("ja-JP")}円</b><span>${my}年度。${esc(hiP.p)} ${hiP.now}円〜${esc(loP.p)} ${loP.now}円</span></div>
      <div class="kpi"><small>外国人労働者</small><b>${(fw / 1e4).toFixed(0)}万人</b><span>${fy}年10月末。2008年は${(LB.foreign["2008"] / 1e4).toFixed(0)}万人</span></div></div>
      <h3>失業率と求人倍率</h3><div id="lm-u"></div>
      <h3>欠員と失業の関係(ベバリッジ曲線)</h3><div id="lm-bev"></div>
      <p class="note">求人が埋まらない割合(欠員率)と、働きたいのに仕事がない割合(雇用失業率)を、四半期ごとに結んだ線です。左上に行くほど人手不足です。線が右にずれると、求人も失業者もあるのに結びつかない「ミスマッチ」が増えたことを表します。出典:JILPT「ユースフル労働統計2025」(労働力調査・職業安定業務統計から推計)。</p></div>
    <div class="card"><h2>賃金</h2><h3>実質賃金と名目賃金(従業員30人以上、2020年=100)</h3><div id="lm-wage"></div>
      <h3>春の賃上げ率</h3><div id="lm-shunto"></div>
      <h3>最低賃金(全国の加重平均、時給)</h3><div id="lm-mw"></div>
      <p class="note">出典:厚生労働省「毎月勤労統計調査」(調査産業計、現金給与総額)、「民間主要企業春季賃上げ要求・妥結状況」、「地域別最低賃金」。実質賃金は、名目賃金を物価で割ったもので、買えるものの量を表します。毎月勤労統計は、調査対象の入れ替えで段差があるため、金額ではなく指数で比べています。</p></div>
    <div class="card"><h2>だれが働いているか</h2><h3>女性の年齢ごとの労働力率(M字カーブ)</h3><div id="lm-m"></div>
      <h3>非正規で働く人の割合</h3><div id="lm-nonreg"></div><h3>高齢者の就業率</h3><div id="lm-old"></div>
      <p class="note">出典:総務省「労働力調査」。M字カーブは、結婚・出産の年代で働く女性が減り、その後また増える形のことです。1975年には30歳前後で大きくへこんでいましたが、2025年にはほぼ台形になりました。</p></div>
    <div class="card"><h2>年収の壁</h2><div id="lm-wall"></div></div>
    <div class="card"><h2>2040年の働き手の見通し</h2><div id="lm-proj"></div><div id="lm-ind" class="table-scroll"></div>
      <p class="note">出典:労働政策研究・研修機構(JILPT)「労働力需給の推計」(2024年3月)。3つの筋書きは、経済が成長するか、女性・高齢者の働く人がどれだけ増えるかの組み合わせです。予測ではなく、条件ごとの試算です。</p></div>
    <div class="card"><h2>外国人労働者</h2><div id="lm-foreign"></div><div id="lm-find"></div>
      <p class="note">出典:厚生労働省「外国人雇用状況」の届出状況(各年10月末)。2020年以前は、公表資料のグラフの値(千人単位で丸め)です。</p></div>
    <div class="card"><h2>研究でわかっていること</h2><div id="lm-lit"></div></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  el.addEventListener("lab:open", () => {
    if ($("lm-u").innerHTML) return;
    $("lm-u").innerHTML = multiLine([{ name: "完全失業率(%)", color: "#b4473b", points: pts(LB.unemp) }, { name: "有効求人倍率(倍)", color: "#2f6fd0", points: pts(LB.jobs) }], { xLabel: "年", fmt: (v) => v.toFixed(1) });
    $("lm-bev").innerHTML = beveridge();
    $("lm-wage").innerHTML = multiLine([{ name: "名目賃金", color: "#c9a45c", points: pts(LB.nomWage30) }, { name: "実質賃金", color: "#b4473b", points: pts(LB.realWage30) }], { xLabel: "年", fmt: (v) => v.toFixed(0) });
    $("lm-shunto").innerHTML = multiLine([{ name: "春の賃上げ率(%)", color: "#2f8f6b", points: pts(LB.shunto) }], { xLabel: "年", fmt: (v) => `${v.toFixed(1)}%` });
    $("lm-mw").innerHTML = multiLine([{ name: "最低賃金(円/時)", color: "#7a2fb0", points: pts(LB.minWage) }], { xLabel: "年度", fmt: (v) => `${Math.round(v)}円` });
    const ages = ["15-19", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65-69"], mid = (a) => Number(a.split("-")[0]) + 2;
    $("lm-m").innerHTML = multiLine(Object.entries(LB.mcurve).map(([y, v], i, arr) => ({ name: `${y}年`, color: `hsl(${20 + (i / (arr.length - 1)) * 200},55%,45%)`, points: ages.filter((a) => v[a] != null).map((a) => ({ x: mid(a), y: v[a] / 100 })) })), { xLabel: "年齢" });
    $("lm-nonreg").innerHTML = multiLine([["total", "全体", "#555"], ["male", "男性", "#2f6fd0"], ["female", "女性", "#b4473b"]].map(([k, n, c]) => ({ name: n, color: c, points: pts(LB.nonReg[k], 100) })), { xLabel: "年" });
    $("lm-old").innerHTML = multiLine([["60_64", "60〜64歳"], ["65_69", "65〜69歳"], ["70_74", "70〜74歳"]].flatMap(([k, n], i) => [{ name: `${n}男`, color: ["#2f6fd0", "#2f8f6b", "#7a2fb0"][i], points: pts(LB.old[k].male, 100) }]), { xLabel: "年" });
    // 年収の壁
    const W = LB.wall, cmp = wallCompare(getPersonas?.()), R = W.reasons;
    const reason = (re) => Object.entries(R).find(([k]) => re.test(k))?.[1];
    $("lm-wall").innerHTML = `<div class="kpis"><div class="kpi"><small>就業調整をしているパートの女性</small><b>${W.adjust["女"]["調整をしている"]}%</b><span>男性は${W.adjust["男"]["調整をしている"]}%</span></div>
        <div class="kpi"><small>理由:130万円(扶養から外れる)</small><b>${reason(/130万円/)}%</b><span>複数回答</span></div>
        <div class="kpi"><small>理由:103万円(所得税)</small><b>${reason(/103万円/)}%</b><span>配偶者控除 ${reason(/配偶者控除/)}%</span></div></div>
      <h3>パートで働く女性の年収の分布:統計と仮想の住民</h3><div class="table-scroll"><table class="verify"><tr><th>年収</th><th class="num">統計</th><th class="num">仮想の住民</th></tr>${cmp.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${(r.real * 100).toFixed(1)}%</td><td class="num">${(r.model * 100).toFixed(1)}%</td></tr>`).join("")}</table></div>
      <p class="note">出典:厚生労働省「パートタイム・有期雇用労働者総合実態調査」2021年(第16表・第20表・第21表。年収なし・不明を除いて割合を計算)。仮想の住民では、既婚の女性のパート(65歳未満)で賃金が103〜200万円になる人の61%が、年収を90〜103万円に抑えるようにしています(就業調整をしている人18.0%に合わせた値。仮定)。100万円の前後に人が集まるのは、この調整の結果です。</p>
      <p class="a-note">ずれ:仮想の住民は、年収200万円以上の人が統計の約2倍いて、110万円未満の人が少なめです。住民の年収は「賃金構造基本統計調査」のパートの賃金から作っていますが、この調査は「今の働き方で得た年収」だけを聞いているため、比べ方の違いもあります。原因はまだ特定できていません。</p>`;
    // 2040年
    const pY = ["2022", "2025", "2030", "2035", "2040"];
    $("lm-proj").innerHTML = multiLine(Object.entries(LB.projection).map(([k, v], i) => ({ name: SC[k] ?? k, color: ["#2f8f6b", "#c9a45c", "#b4473b"][i], points: Object.entries(v).filter(([y]) => Number(y) >= 2000).map(([y, x]) => ({ x: Number(y), y: x / 100 })) })), { xLabel: "年", fmt: (v) => `${(v * 100).toFixed(0)}万` })
      + `<p class="a-headline">2040年の就業者:${proj.map(([n, v]) => `${esc(n)} ${Math.round(v).toLocaleString("ja-JP")}万人`).join("、")}。</p>`;
    const I = LB.projIndustry, k0 = Object.keys(I)[1] ?? Object.keys(I)[0], rows = Object.entries(I[k0]).filter(([n]) => !/製造業$/.test(n) || n === "製造業").map(([n, v]) => ({ n, now: v["2022"], end: v["2040"] })).filter((r) => r.now > 0).sort((a, b) => (b.end - b.now) / b.now - (a.end - a.now) / a.now);
    $("lm-ind").innerHTML = `<h3>業種ごとの増減(${esc(SC[k0] ?? k0)}、2022→2040年)</h3><table class="verify"><tr><th>業種</th><th class="num">2022年</th><th class="num">2040年</th><th class="num">増減</th></tr>${rows.map((r) => `<tr><td>${esc(r.n)}</td><td class="num">${Math.round(r.now)}万人</td><td class="num">${Math.round(r.end)}万人</td><td class="num"><b>${r.end >= r.now ? "+" : ""}${(((r.end - r.now) / r.now) * 100).toFixed(0)}%</b></td></tr>`).join("")}</table>`;
    $("lm-foreign").innerHTML = multiLine([{ name: "外国人労働者(万人)", color: "#2f6fd0", points: pts(LB.foreign, 1e4) }], { xLabel: "年", fmt: (v) => `${v.toFixed(0)}万` });
    const FI = LB.foreignIndustry, fyK = Object.keys(FI["外国人労働者総数"]).sort().at(-1);
    $("lm-find").innerHTML = hbar(Object.entries(FI).filter(([n]) => n !== "外国人労働者総数" && !n.startsWith("うち")).map(([n, v]) => ({ label: n, value: v[fyK] ?? 0 })).sort((a, b) => b.value - a.value).slice(0, 8), { fmt: (v) => `${(v / 1e4).toFixed(1)}万人`, labelWidth: 200 });
    const L = LB.lit ?? [];
    $("lm-lit").innerHTML = L.length ? `<ul class="facts">${L.filter((f) => f.interpretation_ja && !f.unverified).slice(0, 24).map((f) => `<li>${esc(f.interpretation_ja)}<small>(${esc(f.cite ?? "")})</small></li>`).join("")}</ul>` : `<p class="note">文献の値は準備中です。</p>`;
  });
  return { tabs: [["labormkt", "労働市場"]] };
}
