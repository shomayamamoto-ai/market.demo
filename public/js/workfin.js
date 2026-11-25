// 企業と転職:法人企業統計(1960〜2025年度)で企業の売上・利益の長い流れを見て、
// 雇用動向調査の「前の職場 → 今の職場」の表で、人がどの業種・規模からどこへ移るかを見る。
import WD from "./work-data.js";
import { esc, multiLine, hbar } from "./charts.js";

const C = WD.corp, J = WD.work;
const yrs = Object.keys(C.sales.values).map(Number).sort((a, b) => a - b);
// 前の業種を選んだときの、移った先の割合(%)
export function flowFrom(table, row) {
  const i = table.rows.indexOf(row); if (i < 0) return [];
  const v = table.values[i], tot = v.reduce((a, b) => a + (b ?? 0), 0);
  return table.cols.map((c, j) => ({ label: c, value: tot ? (100 * (v[j] ?? 0)) / tot : 0 })).sort((a, b) => b.value - a.value);
}
export function stayShare(table) { // 同じ区分に移った人の割合(行と列の名前が同じもの)
  let same = 0, all = 0; table.rows.forEach((r, i) => { const j = table.cols.indexOf(r); table.values[i].forEach((v, k) => { all += v ?? 0; if (k === j) same += v ?? 0; }); });
  return all ? same / all : 0;
}

export function mountWorkFin({ before }) {
  const el = document.createElement("section"); el.id = "tab-workfin"; el.className = "tab";
  const last = yrs.at(-1), s = (k, y) => C[k].values[String(y)];
  el.innerHTML = `<div class="page-head"><h1>企業と転職</h1><p>日本の企業全体の売上・利益を1960年度から見ます。あわせて、転職した人が、どの業種・規模の会社から、どこへ移ったかを見ます。</p></div>
    <div class="card"><div class="kpis">
      <div class="kpi"><small>売上高(${last}年度、金融保険業を除く)</small><b>${Math.round(s("sales", last) / 1e6).toLocaleString("ja-JP")}兆円</b><span>${yrs[0]}年度は${Math.round(s("sales", yrs[0]) / 1e6)}兆円</span></div>
      <div class="kpi"><small>経常利益(${last}年度)</small><b>${(s("ordinary", last) / 1e6).toFixed(1)}兆円</b><span>売上の${s("margin", last).toFixed(1)}%</span></div>
      <div class="kpi"><small>法人数(${last}年度)</small><b>${Math.round(s("firms", last) / 1e4).toLocaleString("ja-JP")}万社</b><span>従業員 ${Math.round(s("employees", last) / 1e4).toLocaleString("ja-JP")}万人</span></div></div>
      <h3>売上高に対する経常利益の割合(会社の大きさ別)</h3><div id="wf-margin"></div>
      <h3>労働分配率(稼いだ付加価値のうち、人件費に回した割合)</h3><div id="wf-labor"></div>
      <ul class="facts">
        <li>利益は一部の会社に集中しています。所得10億円を超える9,583社(全法人の0.32%)が、法人の申告所得の71.5%を占めます(国税庁 会社標本調査 2024年度分。税務上の所得で、会計の利益とは違います)。</li>
        <li>大・中堅企業の売上高経常利益率は、真ん中の会社で3.6%、上位10%で12.9%、下位10%で−0.8%(内閣府 日本経済2024-2025)。</li>
        <li>倒産する会社は、純利益が倒産の9年前、営業利益が6年前に赤字に転じています(同)。起業1年目の赤字は52.7%、4年目には32.5%に下がります。</li></ul>
      <p class="note">出典:財務省「法人企業統計調査」年次別調査(${esc(C.sales.source ?? "")})。単体決算で、母集団からの推計値。業種分類は2008年度から変わっています。上場企業の会社ごとの数字は、有価証券報告書のサイトが自動の取得を受け付けなかったため入れていません。</p></div>
    <div class="card"><h2>転職した人は、どこからどこへ移ったか(2025年)</h2>
      <div class="kpis"><div class="kpi"><small>同じ業種に移った人</small><b>${(stayShare(J.industry) * 100).toFixed(0)}%</b><span>残りは別の業種へ</span></div>
        <div class="kpi"><small>転職で賃金が増えた人</small><b>${J.wageByAge.values["2025"]["増加"]}%</b><span>減った人 ${J.wageByAge.values["2025"]["減少"]}%</span></div>
        <div class="kpi"><small>転職者数(労働力調査)</small><b id="wf-lfs"></b><span id="wf-lfs-sub"></span></div></div>
      <div class="form-grid"><label class="wide">前の職場の業種 <select id="wf-ind">${J.industry.rows.map((r) => `<option${r === "製造業" ? " selected" : ""}>${esc(r)}</option>`).join("")}</select></label></div>
      <div id="wf-ind-out"></div>
      <div class="form-grid"><label class="wide">前の職場の規模 <select id="wf-size">${J.size.rows.map((r) => `<option${r === "1000人以上" ? " selected" : ""}>${esc(r)}</option>`).join("")}</select></label></div>
      <div id="wf-size-out"></div>
      <h3>年齢ごとの、転職で賃金が増えた人と減った人</h3><div id="wf-age" class="table-scroll"></div>
      <p class="note">出典:厚生労働省「令和7年 雇用動向調査」転職入職者(前の職場が雇用で、入職前1年以内に離職した人)。今の職場は、5人以上の事業所(農林漁業と公務を除く)に限ります。会社ごとの転職元・転職先は公表されていないので、業種と規模の集計を使っています。</p></div>
    <div class="card"><details><summary><b>会社ごとの勤続年数と残業(代表46社)を見る</b></summary><div id="wf-co" class="table-scroll"></div></details>
      <p class="note">出典:厚生労働省「職場情報総合サイト(しょくばらぼ)」のデータを加工。各社の自己申告の値で、年度は会社ごとに違います。明らかにおかしい値(例:勤続年数が極端に短い)もそのまま載せています。</p></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  const pct = (v) => `${v.toFixed(1)}%`;
  const drawInd = () => { $("wf-ind-out").innerHTML = hbar(flowFrom(J.industry, $("wf-ind").value).slice(0, 8).map((r) => ({ label: r.label, value: r.value })), { fmt: pct, labelWidth: 190 }); };
  const drawSize = () => { $("wf-size-out").innerHTML = hbar(flowFrom(J.size, $("wf-size").value).map((r) => ({ label: `今の職場 ${r.label}`, value: r.value })), { fmt: pct, color: "var(--good)", labelWidth: 150 }); };
  $("wf-ind").onchange = drawInd; $("wf-size").onchange = drawSize;
  el.addEventListener("lab:open", () => { if ($("wf-margin").innerHTML) return;
    const colors = ["#b4473b", "#c9a45c", "#2f8f6b", "#4a7fb5"], groups = Object.keys(C.margin.groups).filter((g) => g.includes("資本金"));
    const L = (vals, name, color) => ({ name, color, points: Object.entries(vals).map(([y, v]) => ({ x: Number(y), y: v / 100 })) });
    // 利益率は数%なので、割合に直さず%のまま描く(縦軸が0〜100%だと線が底に張りつくため)
    const Lp = (vals, name, color) => ({ name, color, points: Object.entries(vals).map(([y, v]) => ({ x: Number(y), y: v })) });
    $("wf-margin").innerHTML = multiLine([Lp(C.margin.values, "全体", "#555"), ...groups.map((g, i) => Lp(C.margin.groups[g], g.replace(/.*資本金/, ""), colors[i]))], { xLabel: "年度", fmt: (v) => `${v.toFixed(0)}%` });
    $("wf-labor").innerHTML = multiLine([L(C.labor.values, "全体", "#555"), ...Object.keys(C.labor.groups).map((g, i) => L(C.labor.groups[g], g.replace("資本金", ""), colors[i]))], { xLabel: "年度", fmt: (v) => `${(v * 100).toFixed(0)}%` });
    drawInd(); drawSize();
    const lv = J.lfs.by_group ?? {}, lk = Object.keys(lv).find((k) => k.startsWith("転職者数(万人)|総数")), lr = Object.keys(lv).find((k) => k.startsWith("転職者比率(%)|総数"));
    if (lk) { const ys = Object.keys(lv[lk]).sort(); $("wf-lfs").textContent = `${lv[lk][ys.at(-1)]}万人`; $("wf-lfs-sub").textContent = `${ys.at(-1)}年。就業者の${lv[lr]?.[ys.at(-1)] ?? "―"}%`; }
    const A = J.wageByAge.by_age ?? {};
    $("wf-age").innerHTML = `<table class="verify"><tr><th>年齢</th><th class="num">増えた</th><th class="num">減った</th><th class="num">差</th></tr>${Object.entries(A).map(([age, v]) => `<tr><td>${esc(age)}</td><td class="num">${v["増加"] ?? "―"}%</td><td class="num">${v["減少"] ?? "―"}%</td><td class="num"><b>${v["増加"] != null && v["減少"] != null ? `${(v["増加"] - v["減少"] >= 0 ? "+" : "")}${(v["増加"] - v["減少"]).toFixed(1)}` : "―"}</b></td></tr>`).join("")}</table>`;
    $("wf-co").innerHTML = `<table class="verify"><tr><th>会社</th><th>業種</th><th class="num">勤続(男)</th><th class="num">勤続(女)</th><th class="num">月の残業</th></tr>${J.companies.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.industry ?? "")}</td><td class="num">${c.avg_tenure_male_years ?? "―"}年</td><td class="num">${c.avg_tenure_female_years ?? "―"}年</td><td class="num">${c.overtime_h ?? "―"}時間</td></tr>`).join("")}</table>`; });
  return { tabs: [["workfin", "企業と転職"]] };
}
