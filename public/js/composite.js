// 複合要因の分析の画面:都道府県の表から、結果(投票・購買・保険)を1つ選び、要因(人口構成・所得・交通・災害など)を
// 組み合わせて重回帰する。「ほかの要因を同じにしたとき」の効き方と、当てはめに使っていない県での当たり方を必ず並べる。
import PANEL from "./panel-data.js";
import { regress } from "./regress.js";
import { twoWay } from "./panelfe.js";
import { esc } from "./charts.js";

const YEARS = ["2005", "2009", "2012", "2014", "2017", "2021", "2024", "2026"];
// 投票日の雨(log(1+雨量mm))で、投票率と得票率がどう動くか。雨は選挙の中身と関係なく投票率を動かすので、
// 「投票率が下がったこと」の効き方を、接戦かどうかなどの影響から切り分けて見られる(自然実験)
const lrain = () => { for (const k of Object.keys(PANEL.vars).filter((k) => k.startsWith("rain_"))) { const n = k.replace("rain_", "lrain_"); if (!PANEL.vars[n]) PANEL.vars[n] = { ...PANEL.vars[k], values: PANEL.vars[k].values.map((x) => (x == null ? null : Math.log1p(x))) }; } };
export function rainEffects() {
  lrain(); const U = ["2007", "2010", "2013", "2016", "2019", "2022", "2025"];
  const first = twoWay(PANEL, "turnout", "lrain_shu", YEARS), firstU = twoWay(PANEL, "sturnout", "lrain_san", U);
  const rows = [["pr_kome", "公明党(比例代表)"], ["pr_jcp", "共産党(比例代表)"], ["pr_ldp", "自民党(比例代表)"], ["ldp", "自民党(小選挙区)"]].map(([k, label]) => ({ label, ...twoWay(PANEL, k, "lrain_shu", YEARS) }));
  return { first, firstU, rows };
}
export function turnoutEffects() {
  return [["pr_org", "公明党+共産党(比例代表)"], ["pr_ldp", "自民党(比例代表)"], ["ldp", "自民党(小選挙区)"]].map(([k, label]) => ({ label, ...twoWay(PANEL, k, "turnout", YEARS) }));
}

export function mountComposite({ before }) {
  const V = PANEL.vars, keys = Object.keys(V);
  const outcomes = keys.filter((k) => V[k].group === "結果"), factors = keys.filter((k) => V[k].group === "要因" && !k.startsWith("ldp"));
  const el = document.createElement("section"); el.id = "tab-composite"; el.className = "tab";
  el.innerHTML = `<div class="page-head"><h1>複合要因の分析</h1><p>これまで集めた都道府県ごとのデータをつなぎ合わせ、人口構成・所得・交通・災害などが、投票や買い物にどう効いているかを、要因を同時に入れて調べます。</p></div>
    <div class="card"><h2>投票率が下がると、組織票の多い党は強くなるか</h2>
      <p class="note">同じ県を、衆院選8回(2005〜2026年)で比べます。県ごとの土地柄と、回ごとの全国の流れ(その年の風)は取り除き、「その県でいつもより投票率が低かった回に、得票率がどう動いたか」だけを見ます。</p>
      <div id="cp-turnout" class="table-scroll"></div>
      <div class="analysis"><ul class="facts" id="cp-turnout-facts"></ul></div></div>
    <div class="card"><h2>投票日に雨が降ると、どうなるか(自然実験)</h2>
      <p class="note">雨は選挙の中身と関係なく投票率を動かします。そのため、雨で投票率が下がったときの得票率の動きを見ると、「投票率が下がったこと」の効き方を、接戦かどうかなどの影響から切り分けて調べられます。投票日の雨量は、各県の気象台の値です(気象庁)。雨量は対数(雨量が倍になるごとに同じだけ効く形)で入れています。</p>
      <div id="cp-rain" class="table-scroll"></div>
      <div class="analysis"><ul class="facts" id="cp-rain-facts"></ul></div></div>
    <div class="card"><h2>要因を組み合わせて調べる</h2>
      <div class="form-grid"><label class="wide">調べる結果 <select id="cp-y">${outcomes.map((k) => `<option value="${k}"${k === "turnout2024" ? " selected" : ""}>${esc(V[k].name)}</option>`).join("")}</select></label></div>
      <p class="note">要因を選んでください(多くても4つまで。47県しかないので、入れすぎると偶然の当てはまりが増えます)。</p>
      <div id="cp-x" class="chips">${factors.map((k) => `<label class="chip"><input type="checkbox" value="${k}"${["old65", "wage", "car2014"].includes(k) ? " checked" : ""}> ${esc(V[k].name)}</label>`).join("")}</div>
      <div id="cp-out"></div></div>
    <div class="card"><h2>この分析の読み方と限界</h2><ul class="facts">
      <li><b>係数</b>:ほかの要因を同じにしたとき、その要因が「県どうしのふつうの違い(1標準偏差)」だけ違うと、結果が何標準偏差違うか。±0.3を超えると目立つ大きさです。</li>
      <li><b>確かさ</b>:t の絶対値が2を超えると、偶然では出にくい関係です。</li>
      <li><b>使っていない県での当たり方</b>:1県ずつ抜いて残りで式を作り、抜いた県を当てた結果です。当てはまりの良さ(決定係数)よりこちらが大きく下がるときは、偶然の当てはまりを疑ってください。</li>
      <li><b>単位</b>:県の平均どうしの関係です。県の中の1人ずつに同じ関係があるとは限りません。</li>
      <li><b>因果</b>:関連があっても、原因と結果とは限りません。ほかの要因(この表に無いもの)が両方を動かしている可能性があります。</li>
      <li>出典:${[...new Set(keys.map((k) => V[k].source))].map(esc).join("、")}</li></ul></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  const run = () => {
    const y = $("cp-y").value, xs = [...el.querySelectorAll("#cp-x input:checked")].map((i) => i.value).filter((k) => k !== y).slice(0, 4);
    if (!xs.length) { $("cp-out").innerHTML = `<p class="msg">要因を1つ以上選んでください。</p>`; return; }
    const r = regress(PANEL, y, xs); if (!r) { $("cp-out").innerHTML = `<p class="msg err">計算できませんでした(要因どうしがほぼ同じ動きをしている可能性があります)。</p>`; return; }
    const strong = r.coefs.filter((c) => Math.abs(c.t) >= 2).sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta));
    $("cp-out").innerHTML = `<div class="analysis"><h2>${esc(V[y].name)}</h2>
      <div class="a-cards"><div class="a-card"><small>当てはまり(決定係数)</small><b>${(r.r2 * 100).toFixed(0)}%</b> <i>調整済み ${(r.adj * 100).toFixed(0)}%</i></div>
        <div class="a-card"><small>使っていない県での当たり方</small><b>${(r.looR2 * 100).toFixed(0)}%</b> <i>${r.looR2 < r.r2 - 0.15 ? "大きく下がる:偶然の当てはまりに注意" : "大きくは下がらない"}</i></div>
        <div class="a-card"><small>県の数</small><b>${r.n}</b> <i>データのそろう県</i></div></div>
      <p class="a-headline">${strong.length ? `ほかの要因を同じにしても関係が見えるのは、${strong.map((c) => `「${esc(c.name)}」(${c.beta > 0 ? "多いほど高い" : "多いほど低い"})`).join("、")}です。` : "どの要因も、ほかを同じにすると、偶然と区別できるほどの関係は見えませんでした。"}</p></div>
      <div class="table-scroll"><table class="verify"><tr><th>要因</th><th class="num">係数</th><th class="num">確かさ(t)</th><th class="num">1単位あたり</th></tr>${r.coefs.map((c) => `<tr><td>${esc(c.name)}</td><td class="num"><b>${c.beta >= 0 ? "+" : ""}${c.beta.toFixed(2)}</b></td><td class="num">${c.t.toFixed(1)}</td><td class="num">${c.perUnit >= 0 ? "+" : ""}${Math.abs(c.perUnit) >= 100 ? Math.round(c.perUnit).toLocaleString("ja-JP") : c.perUnit.toFixed(2)}<small>${esc(c.unit)}あたり、${esc(r.unitY)}</small></td></tr>`).join("")}</table></div>
      <h3>式から外れた県(上位5つ)</h3><div class="table-scroll"><table class="verify"><tr><th>県</th><th class="num">実際</th><th class="num">式の値</th></tr>${r.residuals.slice(0, 5).map((x) => `<tr><td>${esc(x.pref)}</td><td class="num">${fmt(x.actual)}</td><td class="num">${fmt(x.fitted)}</td></tr>`).join("")}</table></div>
      <p class="note">式から大きく外れた県には、表に入っていない事情(気候・産業・選挙の顔ぶれなど)があると考えられます。</p>`;
  };
  const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("ja-JP") : v.toFixed(1));
  $("cp-y").onchange = run; $("cp-x").onchange = run;
  el.addEventListener("lab:open", () => { if ($("cp-out").innerHTML) return; run();
    const T = turnoutEffects();
    $("cp-turnout").innerHTML = `<table class="verify"><tr><th>得票率</th><th class="num">投票率が1ポイント上がると</th><th class="num">確かさ(t)</th></tr>${T.map((r) => `<tr><td>${esc(r.label)}</td><td class="num"><b>${r.beta >= 0 ? "+" : ""}${r.beta.toFixed(2)}ポイント</b></td><td class="num">${r.t.toFixed(1)}</td></tr>`).join("")}</table><p class="note">47県 × 8回 = ${T[0].n}組。標準誤差は県ごとにまとめて計算(同じ県の回どうしの似かよりを考える)。出典:総務省 衆議院議員総選挙結果調。</p>`;
    $("cp-turnout-facts").innerHTML = [
      `向きは「投票率が下がると、組織票の多い党と自民党の割合が上がる」で、しょーまさんの仮説と同じです。`,
      `ただし大きさは小さく、比例代表では偶然と区別できません(t の絶対値が1未満)。小選挙区の自民党は、投票率1ポイントあたり約${Math.abs(T[2].beta).toFixed(1)}ポイントで、ぎりぎりの確かさです。`,
      `注意:接戦の選挙区では投票率そのものが上がります。このため「投票率が原因で得票率が動いた」とは言い切れません。下の「投票日に雨が降ると」で、雨を使って確かめています。`,
    ].map((t) => `<li>${esc(t)}</li>`).join("");
    const R = rainEffects(), mm = (b) => `${b >= 0 ? "+" : ""}${(b * Math.log(2)).toFixed(2)}ポイント`;
    $("cp-rain").innerHTML = `<table class="verify"><tr><th>結果</th><th class="num">雨量が倍になると</th><th class="num">確かさ(t)</th></tr>
      <tr><td><b>衆院選の投票率</b></td><td class="num"><b>${mm(R.first.beta)}</b></td><td class="num">${R.first.t.toFixed(1)}</td></tr>
      <tr><td><b>参院選の投票率</b></td><td class="num"><b>${mm(R.firstU.beta)}</b></td><td class="num">${R.firstU.t.toFixed(1)}</td></tr>
      ${R.rows.map((r) => `<tr><td>${esc(r.label)}の得票率(衆院選)</td><td class="num">${mm(r.beta)}</td><td class="num">${r.t.toFixed(1)}</td></tr>`).join("")}</table>
      <p class="note">衆院選8回・参院選7回、47県。県ごとの土地柄と、回ごとの全国の流れは取り除いています。標準誤差は県ごとにまとめて計算。出典:気象庁 過去の気象データ(日ごとの値)、総務省 選挙結果調。</p>`;
    const kome = R.rows[0], jcp = R.rows[1];
    $("cp-rain-facts").innerHTML = [
      `雨が降ると投票率は確かに下がります(衆院選で t=${R.first.t.toFixed(1)}、参院選でも下がる)。たとえば雨量が1mmから10mmに増えると、衆院選の投票率は約${Math.abs(R.first.beta * Math.log(11 / 2)).toFixed(1)}ポイント下がる計算です。`,
      `一方で、組織票が固いとされる公明党(t=${kome.t.toFixed(1)})と共産党(t=${jcp.t.toFixed(1)})の得票率は、雨の日に上がるのではなく、わずかに下がりました。自民党は、比例代表でも小選挙区でも、はっきりした動きは見えません。`,
      `つまりこのデータでは、「雨で投票率が下がると、組織票の党が相対的に強くなる」という説は確かめられませんでした。台風の2017年や大雪の2026年を除いても、同じ向きです。`,
      `考えられる理由(推測です):組織票の多い党は期日前投票を早めに済ませる人が多く、投票日の雨で減る人の中には、もともと組織とつながりの薄い支持者も含まれる、など。また、県単位の平均なので、市町村や選挙区ごとに見ると違う結果になる可能性があります。`,
    ].map((t) => `<li>${esc(t)}</li>`).join(""); });
  return { tabs: [["composite", "複合要因の分析"]] };
}
