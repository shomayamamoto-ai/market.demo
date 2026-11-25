// 進学と学歴:高校卒業後の進路(大学・専門学校・就職)の推移、専門学校の人気分野、大学の倍率、
// 卒業後の就職・大学院進学、学歴ごとの賃金を、公的統計で見る。
import ED from "./education-data.js";
import { esc, multiLine, hbar } from "./charts.js";

const series = (o, name, color, scale = 1) => ({ name, color, points: Object.entries(o).map(([y, v]) => ({ x: Number(y), y: v / scale })) });
// 学歴別の賃金のカーブ(月の所定内給与、千円)
export function wageCurves() {
  return Object.entries(ED.wage.groups).map(([k, v]) => ({ label: k.replace("男女計_", ""), all: v["年齢計"], ages: Object.entries(v).filter(([a]) => a !== "年齢計") }));
}

export function mountEducation({ before }) {
  const el = document.createElement("section"); el.id = "tab-education"; el.className = "tab";
  const last = (o) => o[Object.keys(o).sort().at(-1)], ly = (o) => Object.keys(o).sort().at(-1);
  el.innerHTML = `<div class="page-head"><h1>進学と学歴</h1><p>高校を卒業した人がどこへ進むか、専門学校で人気の分野、大学の倍率、卒業後の就職と大学院への進学、学歴ごとの賃金を見ます。</p></div>
    <div class="card"><div class="kpis">
      <div class="kpi"><small>大学・短大などへの進学率</small><b>${last(ED.univRate.values)}%</b><span>${ly(ED.univRate.values)}年 高校卒業者(現役)</span></div>
      <div class="kpi"><small>専門学校への進学率</small><b>${last(ED.senmonRate.values)}%</b><span>男 ${last(ED.senmonRate.groups["男"])}%、女 ${last(ED.senmonRate.groups["女"])}%</span></div>
      <div class="kpi"><small>就職率</small><b>${last(ED.jobRate.values)}%</b><span>${ly(ED.jobRate.values)}年</span></div></div>
      <div id="ed-path"></div>
      <p class="note">分母は、その年に高校(全日制・定時制)を卒業した人です(過去に卒業した人は含みません)。専門学校は2006年の値が取れていません。18歳人口を分母にすると、社会人や留学生も入るため、専門学校は23.1%(2025年)と高く出ます。出典:文部科学省「学校基本調査」(e-Stat)。</p></div>
    <div class="card"><h2>専門学校で人気の分野(入学者数)</h2><div id="ed-field"></div>
      <h3>都道府県別の専門学校進学率(2025年)</h3><div id="ed-pref"></div>
      <p class="note">2025年の学科別の入学者は、看護22,759人、美容20,538人、情報処理15,936人が上位です。卒業者の81.7%が就職し(医療91.5%、文化・教養64.8%)、就職した人の92%は学んだ分野に関係する仕事についています(学校基本調査、2024年度間の卒業者)。中途退学は年5.7%(文部科学省、令和7年度)。</p></div>
    <div class="card"><h2>大学の倍率</h2><div id="ed-private"></div>
      <div class="form-grid"><label>国公立大学を探す <input id="ed-q" type="text" placeholder="例:東京、大阪、医科"></label><label>並べ方 <select id="ed-sort"><option value="ratio">志願倍率が高い順</option><option value="real_ratio">実質倍率が高い順</option><option value="applicants">志願者が多い順</option></select></label></div>
      <div id="ed-univ" class="table-scroll"></div>
      <p class="note">国公立179校、2025年度入学の全選抜区分(一般・学校推薦型・総合型など)の合計。志願倍率=志願者÷募集人員、実質倍率=受験者÷合格者。出典:文部科学省「国公立大学入学者選抜の実施状況」、日本私立学校振興・共済事業団「私立大学・短期大学等入学志願動向」。私立大学の大学ごとの値は取得できていません。予備校の偏差値は使っていません。</p></div>
    <div class="card"><h2>卒業後の進路と、学歴ごとの賃金</h2><div id="ed-grad"></div><div id="ed-wage"></div>
      <ul class="facts">
        <li>大学院(修士)の入学者の71.2%は、同じ大学の学部から進学(工学は87%)。博士は62.6%(学校基本調査 2025年度)。</li>
        <li>大学への入学者のうち、地元の県の大学に進んだ人は43.8%。東京圏以外の出身者の16.9%が東京圏の大学へ(2025年度)。県外に進学した人のうち、最初の就職で地元に戻ったのは39.0%(北海道・東北の出身は約25%)。</li>
        <li>定年まで正社員で働いたときの生涯賃金(男性):高卒2.16億円、専門卒2.07億円、大卒2.63億円、大学院卒3.24億円(JILPT ユースフル労働統計2025)。女性は専門卒1.76億円で、高卒1.58億円を上回る。</li>
        <li>大学院卒の賃金は、学部卒より約2〜3割高い(RIETI DP 13-J-046、11-J-072。要旨で確認)。</li></ul></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  const drawUniv = () => { const q = $("ed-q").value.trim(), k = $("ed-sort").value;
    const L = ED.univs.filter((u) => !q || u.name.includes(q)).sort((a, b) => (b[k] ?? 0) - (a[k] ?? 0)).slice(0, 30);
    $("ed-univ").innerHTML = `<table class="verify"><tr><th>大学</th><th>設置</th><th class="num">募集</th><th class="num">志願者</th><th class="num">志願倍率</th><th class="num">実質倍率</th><th class="num">入学者</th></tr>${L.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.type)}</td><td class="num">${(u.capacity ?? 0).toLocaleString("ja-JP")}</td><td class="num">${(u.applicants ?? 0).toLocaleString("ja-JP")}</td><td class="num"><b>${u.ratio?.toFixed(1) ?? "―"}</b></td><td class="num">${u.real_ratio?.toFixed(2) ?? "―"}</td><td class="num">${(u.enrolled ?? 0).toLocaleString("ja-JP")}</td></tr>`).join("") || `<tr><td colspan="7">見つかりません</td></tr>`}</table>`; };
  $("ed-q").oninput = drawUniv; $("ed-sort").onchange = drawUniv;
  el.addEventListener("lab:open", () => { if ($("ed-path").innerHTML) return;
    $("ed-path").innerHTML = multiLine([series(ED.univRate.values, "大学・短大など", "#2f6fd0", 100), series(ED.senmonRate.values, "専門学校", "#b4473b", 100), series(ED.jobRate.values, "就職", "#2f8f6b", 100)], { xLabel: "年" });
    const F = ED.senmonField.groups, cols = ["#b4473b", "#2f6fd0", "#2f8f6b", "#c9a45c", "#7a5ea8", "#8b93a7", "#d07a2f", "#3aa0a0"];
    $("ed-field").innerHTML = multiLine(Object.keys(F).filter((k) => !/合計|計$/.test(k)).map((k, i) => series(F[k], k.replace("関係", ""), cols[i % cols.length], 1e4)), { xLabel: "年(万人)", fmt: (v) => `${v.toFixed(1)}万` });
    const P = ED.senmonPref.groups;
    $("ed-pref").innerHTML = hbar(Object.entries(P).filter(([p]) => !p.includes("|")).map(([p, v]) => ({ label: p, value: v["2025"] ?? 0 })).sort((a, b) => b.value - a.value).filter((_, i, a) => i < 6 || i >= a.length - 4), { fmt: (v) => `${v.toFixed(1)}%`, labelWidth: 90 }) + `<p class="note">上位6県と下位4県。</p>`;
    const PL = ED.privateLong.groups, ratio = Object.fromEntries(Object.keys(PL["志願者数"] ?? {}).map((y) => [y, PL["志願者数"][y] / PL["入学定員"][y]]));
    $("ed-private").innerHTML = multiLine([series(ratio, "私立大学の志願倍率(倍)", "#b4473b"), series(PL["定員割れ校の割合%"] ?? {}, "定員割れの私立大学の割合(10%単位)", "#2f6fd0", 10)], { xLabel: "年度", fmt: (v) => v.toFixed(0) });
    const G = ED.gradUnder.groups, emp = Object.fromEntries(Object.keys(G["卒業者数"]).map((y) => [y, G["就職者数"][y] / G["卒業者数"][y]]));
    $("ed-grad").innerHTML = multiLine([{ name: "学部卒業者のうち就職した人", color: "#2f8f6b", points: Object.entries(emp).map(([y, v]) => ({ x: Number(y), y: v })) }, series(G["進学率%"] ?? {}, "大学院などへの進学率", "#7a5ea8", 100)], { xLabel: "卒業年" });
    const W = wageCurves(), ages = W[0].ages.map(([a]) => a);
    $("ed-wage").innerHTML = `<h3>学歴ごとの月給(所定内給与、千円、2025年)</h3><div class="table-scroll"><table class="verify"><tr><th>年齢</th>${W.map((w) => `<th class="num">${esc(w.label)}</th>`).join("")}</tr>${ages.map((a) => `<tr><td>${esc(a)}</td>${W.map((w) => `<td class="num">${w.ages.find(([x]) => x === a)?.[1] ?? "―"}</td>`).join("")}</tr>`).join("")}<tr><td><b>全体</b></td>${W.map((w) => `<td class="num"><b>${w.all}</b></td>`).join("")}</tr></table></div><p class="note">一般労働者(フルタイム)の6月の所定内給与。出典:厚生労働省「賃金構造基本統計調査」2025年。「専門学校」の区分は2020年から。</p>`;
    drawUniv(); });
  return { tabs: [["education", "進学と学歴"]] };
}
