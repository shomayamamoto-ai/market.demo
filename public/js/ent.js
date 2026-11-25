// エンタメ:映画・ゲーム・本・配信・放送受信料に、家計がいくら使っているか(家計調査 2025年)を、仮想の住民1人ずつの財布に割り当てる。
// あわせて、映画館の入場者と季節、動画配信の利用、オンラインゲームの相談など、エンタメの市場の姿を見る。
import ED from "./ent-data.js";
import LD from "./leisure-data.js";
import { esc, multiLine, hbar, vbar } from "./charts.js";

const KEYS = Object.keys(ED.items), Q = ["I", "II", "III", "IV", "V"];
const members = LD.kakei.age.members; // 世帯人員(家計調査 2025年、世帯主の年齢別:平均, 29歳以下, 30代 ...)
const AGE_COLS = ["29歳以下", "30～39歳", "40～49歳", "50～59歳", "60～69歳", "70歳以上"];
const headAge = (p) => (p.asChild ? p.age + 30 : Math.max(p.age, 25));
const ageIdx = (a) => (a < 30 ? 0 : a < 40 ? 1 : a < 50 ? 2 : a < 60 ? 3 : a < 70 ? 4 : 5);
// 年に使う額(円/人):世帯主の年齢の表 × 年収五分位の倍率 ÷ 世帯人員(年齢と年収の効果は独立と仮定)
function raw(p, key) {
  const it = ED.items[key], i = ageIdx(headAge(p)), q = Q[Math.max(0, Math.min(4, p.tier ?? 2))];
  return (it.age[AGE_COLS[i]] * (it.quintile[q] / it.quintile["平均"])) / members[i + 1];
}
export function attachEnt(personas) {
  if (!personas?.length) return personas;
  const W = personas.reduce((a, p) => a + p.weight, 0), scale = {};
  for (const k of KEYS) { const m = personas.reduce((a, p) => a + p.weight * raw(p, k), 0) / W; scale[k] = m > 0 ? ED.items[k].age["平均"] / members[0] / m : 1; }
  for (const p of personas) { const yen = {}; for (const k of KEYS) yen[k] = Math.round(raw(p, k) * scale[k]); p.ent = { yen, total: KEYS.reduce((a, k) => a + yen[k], 0) }; }
  return personas;
}
// 月ごとの支出(季節の波。家計調査の月ごとの値から作った季節指数。平均が1)
export const entMonthly = (p) => Array.from({ length: 12 }, (_, m) => KEYS.reduce((a, k) => { const s = ED.items[k].season, sum = Object.values(s).reduce((x, y) => x + y, 0); return a + ((p.ent?.yen[k] ?? 0) * (s[String(m + 1)] ?? 1)) / sum; }, 0));

export function mountEnt({ before, getPersonas }) {
  const el = document.createElement("section"); el.id = "tab-ent"; el.className = "tab";
  const mv = ED.items.movie.series, y0 = "2019", yl = Object.keys(mv).sort().at(-1);
  el.innerHTML = `<div class="page-head"><h1>エンタメ</h1><p>映画・ゲーム・本・動画配信・放送受信料に家計がいくら使っているかを、仮想の住民1人ずつの財布に割り当てます。映画館の季節の波や、動画配信の利用も見ます。</p></div>
    <div class="card"><div class="kpis">
      <div class="kpi"><small>動画配信(有料)を使う人</small><b>${ED.svod["全年代"]}%</b><span>2025年度。20代 ${ED.svod["20代"]}%、70代 ${ED.svod["70代"]}%</span></div>
      <div class="kpi"><small>映画・演劇の入場料(1世帯・年)</small><b>${mv[yl].toLocaleString("ja-JP")}円</b><span>${yl}年。2019年は${mv[y0].toLocaleString("ja-JP")}円、2020年は${mv["2020"].toLocaleString("ja-JP")}円</span></div>
      <div class="kpi"><small>配信などの支出(1世帯・年)</small><b>${ED.items.stream.series[yl].toLocaleString("ja-JP")}円</b><span>2020年は${ED.items.stream.series["2020"].toLocaleString("ja-JP")}円(「他の教養娯楽サービス」。配信の料金が入ると考えられる項目)</span></div></div>
      <h3>家計の支出の推移(二人以上の世帯、1世帯あたり年額)</h3><div id="en-trend"></div>
      <h3>年収ごとの支出(2025年)</h3><div id="en-inc" class="table-scroll"></div>
      <p class="note">出典:総務省「家計調査」(二人以上の世帯)。動画・音楽の配信の料金は、家計調査に独立した項目がないため、「他の教養娯楽サービスのその他」で見ています(推測です)。</p></div>
    <div class="card"><h2>財布への反映:この人なら、いくら使うか</h2>
      <div class="form-grid"><label>年齢 <input id="en-age" type="number" min="0" max="100" value="30"></label>
        <label>世帯の年収 <select id="en-tier">${Q.map((q, i) => `<option value="${i}"${i === 2 ? " selected" : ""}>五分位${i + 1}${i === 0 ? "(低い)" : i === 4 ? "(高い)" : ""}</option>`).join("")}</select></label></div>
      <div id="en-wallet"></div></div>
    <div class="card"><h2>映画館と季節</h2><div id="en-movie"></div><h3>月ごとの入場者(年の平均=1)</h3><div id="en-season"></div>
      <p class="note">出典:経済産業省「特定サービス産業動態統計調査」(e-Stat)。売上の大きい映画館の標本の合計で、全国の合計ではありません。映画館は2014年で調査から外れています。アニメは8月が平均の2.56倍、6月が0.16倍と、季節の波がとても大きい。</p></div>
    <div class="card"><h2>動画と配信</h2><h3>年代ごとの利用率(2025年度)</h3><div id="en-vod"></div>
      <p class="note">出典:総務省 情報通信政策研究所「情報通信メディアの利用時間と情報行動に関する調査」令和7年度。サービス別の利用率(全年代):YouTube ${ED.services.YouTube?.["全年代"] ?? "―"}%、Amazonプライムビデオ ${ED.services["Amazonプライムビデオ"]?.["全年代"] ?? "―"}%、TVer ${ED.services.TVer?.["全年代"] ?? "―"}%、Netflix ${ED.services.Netflix?.["全年代"] ?? "―"}%。</p></div>
    <div class="card"><h2>研究でわかっていること</h2><ul class="facts">
      <li>口コミの効果:公開前の予想より出だしが良かった映画では、売上の38%が「観た人の評判が広がったこと」によるもの(Moretti 2011、NBER。米国)。</li>
      <li>一部のスターへの集中:米国のコンサートの売上のうち、上位1%のアーティストの取り分は1982年の26%から2003年の56%へ(Connolly & Krueger「Rockonomics」)。</li>
      <li>ゲームの課金は一部に集中する:オーストリアの若者では、上位10%が全体の支出の61.4%を使っている(欧州の研究)。オンラインゲームの消費生活相談は年6,400〜8,200件で、約6割が20歳未満(消費者庁)。</li>
      <li>配信と売上:音楽配信の137回の再生が、曲の購入1回の代わりになる(Aguiar & Waldfogel)。</li>
      <li>違法ダウンロード:大学生に直接聞くと29.1%が「したことがある」と答えるが、本人が特定されない聞き方で推定すると57.0%(日本の研究)。直接の質問では少なく出る。</li>
      <li>確認できなかったこと:「推し活」に使う額の公的な統計、カラオケ・ゲームセンターの利用、国内の映画の興行収入の全体(映画製作者連盟)、音楽配信の売上(日本レコード協会)。業界団体の統計は、まだ接続を許可していないサイトにあります。</li></ul></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  const drawWallet = () => {
    const all = getPersonas?.() ?? [], age = Math.max(0, Math.min(100, Number($("en-age").value) || 0)), tier = Number($("en-tier").value);
    const p = { age, tier, asChild: false, weight: 1 };
    // 全体の平均に合わせる倍率は、仮想の住民から求める
    const W = all.reduce((a, q) => a + q.weight, 0), yen = {};
    for (const k of KEYS) { const m = W ? all.reduce((a, q) => a + q.weight * raw(q, k), 0) / W : 0, s = m > 0 ? ED.items[k].age["平均"] / members[0] / m : 1; yen[k] = Math.round(raw(p, k) * s); }
    p.ent = { yen }; const m = entMonthly(p), tot = KEYS.reduce((a, k) => a + yen[k], 0), pk = m.indexOf(Math.max(...m));
    $("en-wallet").innerHTML = `<div class="analysis"><div class="a-cards"><div class="a-card"><small>エンタメに使うお金(1人・年)</small><b>${tot.toLocaleString("ja-JP")}円</b> <i>多い月は${pk + 1}月</i></div></div>
      ${hbar(KEYS.map((k) => ({ label: ED.items[k].label, value: yen[k] })), { fmt: (v) => `${Math.round(v).toLocaleString("ja-JP")}円`, labelWidth: 200 })}
      <h3>月ごとの支出</h3>${vbar(m.map((v, i) => ({ label: `${i + 1}`, value: v, on: i === pk })), { fmt: (v) => `${Math.round(v)}` })}
      <p class="a-note">家計調査(2025年)の世帯主の年齢の表に、年収五分位による違いを掛けて、世帯の人数で割った値です(年齢と年収の効果は独立と仮定)。ゲーム機は2025年にSwitch 2の発売で例年の約3倍になっているため、ふつうの年より多めです。</p></div>`;
  };
  ["en-age", "en-tier"].forEach((id) => ($(id).oninput = drawWallet));
  el.addEventListener("lab:open", () => {
    drawWallet();
    if ($("en-trend").innerHTML) return;
    const colors = { movie: "#b4473b", game: "#2f6fd0", book: "#c9a45c", stream: "#2f8f6b", tv: "#7a2fb0" };
    $("en-trend").innerHTML = multiLine(Object.entries(colors).map(([k, c]) => ({ name: ED.items[k].label.replace(/\(.*\)/, ""), color: c, points: Object.entries(ED.items[k].series).map(([y, v]) => ({ x: Number(y), y: v / 1000 })) })), { xLabel: "年", fmt: (v) => `${v.toFixed(0)}千円` });
    $("en-inc").innerHTML = `<table class="verify"><tr><th>項目(円/年)</th>${Q.map((q) => `<th class="num">五分位${q}</th>`).join("")}<th class="num">高÷低</th></tr>${KEYS.map((k) => { const v = ED.items[k].quintile; return `<tr><td>${esc(ED.items[k].label)}</td>${Q.map((q) => `<td class="num">${Math.round(v[q]).toLocaleString("ja-JP")}</td>`).join("")}<td class="num"><b>×${(v.V / Math.max(1, v.I)).toFixed(1)}</b></td></tr>`; }).join("")}</table>`;
    const M = ED.meti, yrs = Object.keys(M.visitors).sort();
    $("en-movie").innerHTML = multiLine([["visitors_japanese", "邦画", "#b4473b"], ["visitors_foreign", "洋画", "#2f6fd0"], ["visitors_anime", "アニメ", "#c9a45c"]].map(([k, n, c]) => ({ name: n, color: c, points: yrs.map((y) => ({ x: Number(y), y: M[k][y] / M.visitors[y] })) })), { xLabel: "年" }) + `<p class="note">入場者に占める割合。アニメは2000年の17%から2014年の35%へ、洋画は63%から28%へ。</p>`;
    $("en-season").innerHTML = multiLine([["movie", "映画館の入場者", "#b4473b"], ["anime", "うちアニメ", "#c9a45c"], ["concert", "コンサート", "#2f6fd0"]].map(([k, n, c]) => ({ name: n, color: c, points: Object.entries(ED.season[k] ?? {}).map(([m, v]) => ({ x: Number(m), y: v })).sort((a, b) => a.x - b.x) })), { xLabel: "月", fmt: (v) => v.toFixed(1) });
    const ages = ["10代", "20代", "30代", "40代", "50代", "60代", "70代"], mid = (a) => Number(a.replace("代", "")) + 5;
    $("en-vod").innerHTML = multiLine([[ED.share, "動画共有(YouTubeなど)", "#b4473b"], [ED.svod, "有料の動画配信", "#2f6fd0"], [ED.tver, "放送番組の配信(TVerなど)", "#2f8f6b"]].map(([o, n, c]) => ({ name: n, color: c, points: ages.filter((a) => o?.[a] != null).map((a) => ({ x: mid(a), y: o[a] / 100 })) })), { xLabel: "年齢" });
  });
  return { tabs: [["ent", "エンタメ"]] };
}
