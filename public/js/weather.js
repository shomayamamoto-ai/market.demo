// 天気と暮らし:47都道府県の気象台の年ごとの値(1961〜2025年、気象庁)を見て、
// 天気・気候が家計の支出や移動にどう結びつくかを、文献の値と県ごとのデータで確かめる。
import WD from "./weather-data.js";
import PANEL from "./panel-data.js";
import { regress } from "./regress.js";
import { esc, multiLine } from "./charts.js";

const avgOf = (vals, from, to) => { const v = WD.years.map((y, i) => (y >= from && y <= to ? vals[i] : null)).filter((x) => x != null); return v.length >= Math.ceil((to - from + 1) * 0.7) ? v.reduce((a, b) => a + b, 0) / v.length : null; };
// 10年ごとの変化:1961〜70年の平均と、2016〜25年の平均の差
export function decadeChange(field) {
  return WD.stations.map((s) => ({ pref: s.pref, name: s.name, early: avgOf(s.v[field], 1961, 1970), late: avgOf(s.v[field], 2016, 2025) })).filter((r) => r.early != null && r.late != null).map((r) => ({ ...r, diff: r.late - r.early }));
}
const national = (field) => WD.years.map((y, i) => { const v = WD.stations.map((s) => s.v[field][i]).filter((x) => x != null); return v.length >= 40 ? v.reduce((a, b) => a + b, 0) / v.length : null; });

export function mountWeather({ before }) {
  const el = document.createElement("section"); el.id = "tab-weather"; el.className = "tab";
  const F = Object.keys(WD.fields);
  el.innerHTML = `<div class="page-head"><h1>天気と暮らし</h1><p>47都道府県の気象台の、1961〜2025年の65年分の天気を見ます。雨や晴れ、暑さ寒さが、家計の支出や移動とどう結びついているかを、研究の値と県ごとのデータで確かめます。</p></div>
    <div class="card"><div class="form-grid"><label>見る項目 <select id="wx-f">${F.map((f) => `<option value="${f}"${f === "rain_days_1mm" ? " selected" : ""}>${esc(WD.fields[f])}</option>`).join("")}</select></label>
      <label>県 <select id="wx-p">${WD.stations.map((s) => `<option${s.pref === "東京都" ? " selected" : ""}>${esc(s.pref)}</option>`).join("")}</select></label>
      <label>比べる県 <select id="wx-p2"><option value="">選ばない</option>${WD.stations.map((s) => `<option${s.pref === "新潟県" ? " selected" : ""}>${esc(s.pref)}</option>`).join("")}</select></label></div>
      <div id="wx-chart"></div><p class="note" id="wx-note"></p></div>
    <div class="card"><h2>この65年で、どれだけ変わったか</h2><p class="note">1961〜70年の平均と、2016〜25年の平均の差です。</p><div id="wx-change"></div></div>
    <div class="card"><h2>天気・気候と、家計の支出</h2><p class="note">県庁所在市の家計の支出(二人以上の世帯、2023〜25年の平均)と、その県の気候(2016〜25年の平均)を比べます。所得の違いは同時に入れて取り除いています。</p><div id="wx-spend"></div></div>
    <div class="card"><h2>研究でわかっていること</h2><ul class="facts">
      <li>全国の月ごとの消費は、雨が多いと減り、夏が暑いと増え、冬が暖かいと減る。雨が平年より1標準偏差多いと、外食 −0.35%、衣料 −0.41%、旅行 −0.61%、タクシー +0.60%(日本銀行 2019年、前月比のポイント)。</li>
      <li>商品ごとに、売れ方が急に変わる気温がある。例:アイス・スポーツドリンクは25〜30℃から、鍋つゆは12〜15℃を下回ると急に売れる。虫さされ薬は18℃から、気温が5℃上がると2.6倍(気象庁の調査、2014〜2016年)。</li>
      <li>昼間の雨が5時間以下なら、来店への影響は小さい(気象庁 2015年)。小売企業の62.7%が「天気は来客数に影響する」と答えている。</li>
      <li>大雨の日の鉄道通勤者は約6割が出発時刻を変えた(2008年8月の東海豪雨)。時間50mmの雨で約3割が行動を変え、代わりの手段の78%は車だった(高知の調査)。</li>
      <li>大雪のあと四輪駆動車がよく売れるが、その約半分は数週間後の売れ残りで打ち消される(米国の研究、Busse ほか)。晴れると株価が上がる、晴れるとチップが増える、といった説は再現が弱く、このツールでは使っていない。</li>
      <li>出典:日本銀行 調査論文 rev19j01、気象庁「気候リスク管理」の調査報告、J-STAGE の論文(詳しくは「出典と仮定」の文献一覧)。雨の日にお店の来店が何%減るかの、日本の業態別の数値は見つかっていない。</li></ul></div>
    <div class="card"><h2>出典と注意</h2><ul class="facts"><li>出典:気象庁ホームページ「過去の気象データ検索」(年ごとの値)を加工して作成。各県の県庁所在地の気象台(埼玉は熊谷、千葉は銚子、滋賀は彦根、山口は下関)。</li>
      <li>観測所の移転や測器の変更で、前後を比べられない年がある(例:日照時間は1986〜87年に全国で変更)。資料不足の年は空けています。</li>
      <li>快晴日数は、目で見る観測が2019〜2024年に多くの気象台で終わったため、最近の年は空いています。雪の量は前年8月〜当年7月の合計です。</li></ul></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  const fmt = (f) => (v) => (f === "temp_mean" ? `${v.toFixed(1)}℃` : `${Math.round(v).toLocaleString("ja-JP")}`);
  const draw = () => {
    const f = $("wx-f").value, a = WD.stations.find((s) => s.pref === $("wx-p").value), b = WD.stations.find((s) => s.pref === $("wx-p2").value), N = national(f);
    const S = [{ name: "47県の平均", color: "#888", points: WD.years.map((y, i) => ({ x: y, y: N[i] })) }, { name: a.pref, color: "#b4473b", points: WD.years.map((y, i) => ({ x: y, y: a.v[f][i] })) }];
    if (b) S.push({ name: b.pref, color: "#2f6fd0", points: WD.years.map((y, i) => ({ x: y, y: b.v[f][i] })) });
    $("wx-chart").innerHTML = multiLine(S, { xLabel: `年(${WD.units[f]})`, fmt: fmt(f) });
    const e = avgOf(a.v[f], 1961, 1970), l = avgOf(a.v[f], 2016, 2025);
    $("wx-note").textContent = e != null && l != null ? `${a.pref}(${a.name}):1961〜70年の平均 ${fmt(f)(e)} → 2016〜25年の平均 ${fmt(f)(l)}(${WD.units[f]})。` : `${a.pref}:この項目は一部の年が空いているため、65年の比較は出していません。`;
    const C = decadeChange(f), nat = C.reduce((s, r) => s + r.diff, 0) / C.length, top = [...C].sort((x, y) => y.diff - x.diff);
    $("wx-change").innerHTML = `<p class="a-headline">${esc(WD.fields[f])}:47県の平均で ${nat >= 0 ? "+" : ""}${f === "temp_mean" ? nat.toFixed(2) : nat.toFixed(1)}${esc(WD.units[f])}(${C.length}県で比較)。</p>
      <div class="table-scroll"><table class="verify"><tr><th>増えた県</th><th class="num">差</th><th>減った県</th><th class="num">差</th></tr>${[0, 1, 2, 3, 4].map((i) => { const u = top[i], d = top[top.length - 1 - i]; return `<tr><td>${esc(u.pref)}</td><td class="num">${u.diff >= 0 ? "+" : ""}${u.diff.toFixed(1)}</td><td>${esc(d.pref)}</td><td class="num">${d.diff >= 0 ? "+" : ""}${d.diff.toFixed(1)}</td></tr>`; }).join("")}</table></div>`;
  };
  ["wx-f", "wx-p", "wx-p2"].forEach((id) => ($(id).onchange = draw));
  el.addEventListener("lab:open", () => { if ($("wx-chart").innerHTML) return; draw();
    const rows = [["spend_灯油", "wx_winter_days", "灯油"], ["spend_外食", "wx_rain_days_1mm", "外食"], ["spend_被服及び履物", "wx_winter_days", "衣料"], ["spend_自動車等関係費", "wx_snowfall_cm", "車の費用"]].map(([y, x, label]) => ({ label, x, r: regress(PANEL, y, [x, "wage"]) })).filter((o) => o.r);
    $("wx-spend").innerHTML = `<div class="table-scroll"><table class="verify"><tr><th>支出</th><th>気候</th><th class="num">係数</th><th class="num">確かさ(t)</th><th class="num">1日・1cmあたり</th></tr>${rows.map((o) => { const c = o.r.coefs[0]; return `<tr><td>${esc(o.label)}</td><td>${esc(PANEL.vars[o.x].name)}</td><td class="num"><b>${c.beta >= 0 ? "+" : ""}${c.beta.toFixed(2)}</b></td><td class="num">${c.t.toFixed(1)}</td><td class="num">${c.perUnit >= 0 ? "+" : ""}${Math.round(c.perUnit).toLocaleString("ja-JP")}円</td></tr>`; }).join("")}</table></div>
      <p class="note">係数は「所得を同じにしたとき、その気候が県どうしのふつうの違いだけ違うと、支出が何標準偏差違うか」です。t の絶対値が2を超えると、偶然では出にくい関係です。県の平均どうしの関係なので、1世帯ずつに同じ関係があるとは限りません。もっと要因を組み合わせるときは「複合要因の分析」の画面を使ってください。</p>`; });
  return { tabs: [["weather", "天気と暮らし"]] };
}
