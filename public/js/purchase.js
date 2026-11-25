// 買う気持ち:消費者の気分(消費者態度指数、日銀の生活意識アンケート)、買うときのクセ(消費者庁)と、
// 「給付金を配ったら、いくら使われるか」を、実際の給付金の研究の値と仮想の住民で試算する。
import PD from "./purchase-data.js";
import { esc, multiLine, hbar } from "./charts.js";

// 一時的な給付のうち、16週ほどで使われる割合(限界消費性向)。2020年の特別定額給付金:全体で約22%、所得の低い3分の1は32%、
// それ以外は統計的にはっきりしない。全体の22%に合うよう、それ以外を17%とした(仮定)
export const MPC = { low: 0.32, other: 0.17, durables: 0.36, source: "内閣府(家計簿アプリのデータ)による2020年の特別定額給付金の分析。耐久財の割合は2009年の定額給付金(家計調査の個票)" };
// 世帯の年収の低い3分の1かどうか(仮想の住民の中での順位)
export function lowTercile(personas) {
  const s = [...personas].sort((a, b) => (a.householdIncome ?? 0) - (b.householdIncome ?? 0)), W = s.reduce((a, p) => a + p.weight, 0), set = new Set();
  let acc = 0; for (const p of s) { if (acc >= W / 3) break; set.add(p); acc += p.weight; }
  return set;
}
// target: "all" | "low"(年収の低い3分の1) | "kids"(18歳以下)| "old"(65歳以上)
export function handout(personas, { yen = 100000, target = "all" } = {}) {
  const low = lowTercile(personas), take = (p) => (target === "low" ? low.has(p) : target === "kids" ? p.age <= 18 : target === "old" ? p.age >= 65 : true);
  let cost = 0, spent = 0, spentLow = 0, n = 0;
  for (const p of personas) { if (!take(p)) continue; const m = low.has(p) ? MPC.low : MPC.other; cost += p.weight * yen; spent += p.weight * yen * m; if (low.has(p)) spentLow += p.weight * yen * m; n += p.weight; }
  return { people: n, cost, spent, share: cost ? spent / cost : 0, durables: spent * MPC.durables, lowShareOfSpent: spent ? spentLow / spent : 0 };
}

const cut = (o, from) => Object.entries(o).filter(([k]) => k >= from);
export function mountPurchase({ before, getPersonas }) {
  const el = document.createElement("section"); el.id = "tab-purchase"; el.className = "tab";
  const ck = Object.keys(PD.cci).at(-1), c = PD.cci[ck], bk = Object.keys(PD.boj).at(-1), b = PD.boj[bk];
  const F = PD.find, n = (id, k) => F[id]?.numbers?.[k];
  el.innerHTML = `<div class="page-head"><h1>買う気持ち</h1><p>消費者の気分の長い推移、買うときのクセ、「給付金を配ったら、どれだけ使われるか」を、統計と研究の値で見ます。</p></div>
    <div class="card"><div class="kpis">
      <div class="kpi"><small>消費者態度指数(50が中立)</small><b>${c.cci}</b><span>${esc(ck)}。2004年以降の平均は約39</span></div>
      <div class="kpi"><small>1年後に支出を減らすつもりの人</small><b>${b.spend_1y_decrease}%</b><span>${esc(bk)}。増やす人は${b.spend_1y_increase}%</span></div>
      <div class="kpi"><small>商品選びで「価格の安さ」を重視</small><b>${b.choose_low_price}%</b><span>安全性 ${b.choose_safety}%、機能 ${b.choose_function}%</span></div></div>
      <h3>消費者態度指数と、その中身</h3><div id="pu-cci"></div>
      <h3>世帯の年収ごとの消費者態度指数</h3><div id="pu-inc"></div>
      <p class="note">出典:内閣府「消費動向調査」(二人以上の世帯、季節調整値。2013年4月に調査方法が変わり、前後で段差があります)、日本銀行「生活意識に関するアンケート調査」。消費者態度指数は「暮らし向き」「収入の増え方」「雇用環境」「耐久消費財の買い時」の4つの平均です。</p></div>
    <div class="card"><h2>1年後の支出の予定と、選び方の変化</h2><div id="pu-boj"></div></div>
    <div class="card"><h2>買うときのクセ(自分で当てはまると答えた人)</h2><div id="pu-bias" class="table-scroll"></div>
      <p class="note">出典:消費者庁「令和7年度 消費者意識基本調査」(5,473人)。本人が「当てはまる」と思うかどうかの答えで、実際の行動を測ったものではありません。</p></div>
    <div class="card"><h2>給付金を配ったら、どれだけ使われるか</h2>
      <div class="form-grid"><label>1人あたりの額(円) <input id="pu-yen" type="number" min="1000" step="1000" value="100000"></label>
        <label>配る相手 <select id="pu-target"><option value="all">全員</option><option value="low">世帯の年収が低い3分の1</option><option value="kids">18歳以下</option><option value="old">65歳以上</option></select></label></div>
      <div id="pu-hand"></div></div>
    <div class="card"><h2>研究でわかっていること</h2><ul class="facts">
      <li>2020年の10万円の給付金:16週ほどで使われたのは約22%(家計調査では17%)。所得の低い3分の1は32%で、それ以外ははっきりした効果が出ていない(内閣府の分析)。</li>
      <li>2009年の定額給付金:受け取った月に8%、前後3か月で25%(95%の範囲 14〜36%)。耐久財では36%、子どもがいる世帯は40%(家計調査の個票)。アンケートで聞くと32.8%と、実際より高めに出る。</li>
      <li>1999年の地域振興券:実際に増えた消費は10〜20%(アンケートでは32%)。</li>
      <li>年金の支給月には、食品などの支出が4〜8%、支出全体が6〜12%増える。支給が3か月ごとから2か月ごとになると、この波は75%以上小さくなった(Stephens & Unayama、NBER w16342)。</li>
      <li>消費税の引き上げ:2014年の駆け込み需要は2.5〜3兆円(消費の0.8〜1.0%)で、約4分の3が耐久財。引き上げ後の四半期の消費の落ち込みは、2014年 −4.8%、2019年 −2.9%(内閣府 経済財政白書)。</li>
      <li>1年後の物価が1ポイント上がると予想すると、支出が1.0〜1.4%、耐久財は6.3〜8.4%増えるが、数四半期で元に戻る(新関、ESRI DP364)。</li>
      <li>スーパーの加工食品では、特売は日数の17〜20%、値引きは平均11〜14%で、売上の25〜30%を占める。特売の時の売れ方だけで価格弾力性を測ると、買いだめのため約30%大きく出る(Hendel & Nevo)。</li>
      <li>値上げのあと、お客さんの「ふつうの値段」の感覚の更新は遅く(最大0.6〜0.7)、値下げのあとは速い(0.8以上)。</li>
      <li>確認できなかったこと:日本の給料日の前後の支出の波、消費者態度指数で消費をどれだけ早く当てられるかの数値、クーポンの利用率。</li></ul></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  const drawHand = () => {
    const P = getPersonas?.() ?? []; if (!P.length) { $("pu-hand").innerHTML = `<p class="note">仮想の住民を作ってから試せます。</p>`; return; }
    const r = handout(P, { yen: Math.max(0, Number($("pu-yen").value) || 0), target: $("pu-target").value }), cho = (v) => `${(v / 1e12).toFixed(2)}兆円`;
    $("pu-hand").innerHTML = `<div class="analysis"><div class="a-cards">
        <div class="a-card"><small>配る総額</small><b>${cho(r.cost)}</b> <i>${(r.people / 1e4).toLocaleString("ja-JP", { maximumFractionDigits: 0 })}万人</i></div>
        <div class="a-card"><small>16週ほどで使われる額</small><b>${cho(r.spent)}</b> <i>配った額の${(r.share * 100).toFixed(0)}%</i></div>
        <div class="a-card"><small>うち耐久財(家電・車など)</small><b>${cho(r.durables)}</b> <i>使われた額の36%(2009年の値)</i></div></div>
      <p class="a-headline">使われた額のうち${(r.lowShareOfSpent * 100).toFixed(0)}%は、年収の低い3分の1の世帯からです。</p>
      <p class="a-note">年収の低い3分の1の世帯は受け取った額の32%、それ以外は17%を使うとしています(2020年の分析の値。それ以外の17%は、全体の22%に合わせた仮定)。残りは貯金や、もともと予定していた支出の置き換えになります。景気への効果(使われたお金が、さらに誰かの収入になる効果)は入れていません。</p></div>`;
  };
  ["pu-yen", "pu-target"].forEach((id) => ($(id).oninput = drawHand));
  el.addEventListener("lab:open", () => {
    drawHand();
    if ($("pu-cci").innerHTML) return;
    const ym = (k) => Number(k.slice(0, 4)) + (Number(k.slice(5, 7)) - 1) / 12, L = (key, name, color) => ({ name, color, points: Object.entries(PD.cci).filter(([, v]) => v[key] != null).map(([k, v]) => ({ x: ym(k), y: v[key] })) });
    $("pu-cci").innerHTML = multiLine([L("cci", "消費者態度指数", "#555"), L("livelihood", "暮らし向き", "#b4473b"), L("employment", "雇用環境", "#2f6fd0"), L("durables_buy_time", "耐久消費財の買い時", "#c9a45c")], { xLabel: "年", fmt: (v) => v.toFixed(0) });
    const iy = Object.keys(Object.values(PD.cciIncome)[0]).sort().at(-1);
    $("pu-inc").innerHTML = hbar(Object.entries(PD.cciIncome).map(([g, v]) => ({ label: g, value: v[iy] ?? 0 })), { fmt: (v) => v.toFixed(1), labelWidth: 170 }) + `<p class="note">${esc(iy)}年の平均。年収が高いほど気分が明るい。</p>`;
    const q = (k) => Number(k.slice(0, 4)) + (Number(k.slice(5, 7)) - 1) / 12, B = (key, name, color) => ({ name, color, points: Object.entries(PD.boj).filter(([, v]) => v[key] != null).map(([k, v]) => ({ x: q(k), y: v[key] / 100 })) });
    $("pu-boj").innerHTML = multiLine([B("spend_1y_decrease", "1年後に支出を減らす", "#b4473b"), B("spend_1y_increase", "1年後に支出を増やす", "#2f8f6b"), B("choose_low_price", "価格の安さを重視", "#c9a45c")], { xLabel: "年" }) + `<p class="note">出典:日本銀行「生活意識に関するアンケート調査」(2006年6月から四半期ごと。それ以前とは調査の仕方が違います)。</p>`;
    const AG = ["15～19歳", "20～29歳", "30～39歳", "40～49歳", "50～59歳", "60～69歳", "70～79歳", "80歳以上"];
    $("pu-bias").innerHTML = `<table class="verify"><tr><th>クセ</th><th class="num">全体</th>${AG.map((a) => `<th class="num">${a.replace("～", "〜").replace("歳", "")}</th>`).join("")}</tr>${Object.entries(PD.bias).map(([k, v]) => `<tr><td>${esc(k.replace(/^（.）/, ""))}</td><td class="num"><b>${v["総数"]}%</b></td>${AG.map((a) => `<td class="num">${v[a] ?? "―"}</td>`).join("")}</tr>`).join("")}</table>`;
  });
  return { tabs: [["purchase", "買う気持ち"]] };
}
