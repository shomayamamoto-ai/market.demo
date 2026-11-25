// コンビニの利用:家計がコンビニで使う額(全国家計構造調査 2004〜2024年)と、業界の販売額(商業動態統計 1998年〜)を見て、
// 仮想の住民1人ずつに「コンビニで使う額」を割り当てる。割合は、一人暮らしなら本人の性別×年齢、それ以外は世帯主の年齢の表から引く。
import CD from "./cvs-data.js";
import { esc, multiLine, hbar } from "./charts.js";

const band = (age) => (age < 30 ? "30歳未満" : age < 40 ? "30～39" : age < 50 ? "40～49" : age < 60 ? "50～59" : age < 70 ? "60～69" : age < 80 ? "70～79" : "80歳以上");
// その人の月の支出のうち、コンビニで使う割合(全国家計構造調査 2024年)
export function cvsShareOf(p) {
  if (p.single) return CD.single[p.sex === "male" ? "1_男" : "2_女"]?.[band(p.age)]?.share ?? 0.0205;
  const headAge = p.asChild ? p.age + 30 : Math.max(p.age, 25); // 親と暮らす子は、親を世帯主とみなす(人口とペルソナの支出と同じ考え方)
  return CD.two[band(headAge)]?.share ?? 0.0205;
}
export const cvsYenOf = (p) => (p.spendTotal ?? 0) * cvsShareOf(p);
export function cvsMarket(personas) {
  let w = 0, yen = 0; for (const p of personas) { w += p.weight; yen += p.weight * cvsYenOf(p); }
  return { perPerson: yen / w, yearTotal: yen * 12 };
}

export function mountCvs({ before, getPersonas }) {
  const el = document.createElement("section"); el.id = "tab-cvs"; el.className = "tab";
  const hy = Object.keys(CD.hh).sort(), sy = Object.keys(CD.sales).sort(), ty = Object.keys(CD.stores).sort();
  el.innerHTML = `<div class="page-head"><h1>コンビニの利用</h1><p>家計がコンビニで使う額と、業界の販売額の推移を見ます。仮想の住民1人ずつに、性別・年齢・一人暮らしかどうかに応じて、コンビニで使う額を割り当てます。</p></div>
    <div class="card"><div class="kpis">
      <div class="kpi"><small>1世帯が月にコンビニで使う額(総世帯)</small><b>${Math.round(CD.hh[hy.at(-1)]).toLocaleString("ja-JP")}円</b><span>${hy.at(-1)}年。${hy[0]}年は${Math.round(CD.hh[hy[0]]).toLocaleString("ja-JP")}円</span></div>
      <div class="kpi"><small>家計の支出に占める割合</small><b>${(CD.hhShare[hy.at(-1)] * 100).toFixed(2)}%</b><span>${hy[0]}年は${(CD.hhShare[hy[0]] * 100).toFixed(2)}%</span></div>
      <div class="kpi"><small>業界の販売額(年)</small><b>${(CD.sales[sy.at(-1)] / 1e6).toFixed(1)}兆円</b><span>${sy.at(-1)}年。店舗 ${Number(CD.stores[ty.at(-1)]).toLocaleString("ja-JP")}店</span></div></div>
      <div id="cv-trend"></div>
      <p class="note">家計の記入から計算した総額は、業界の販売額の約4分の1です(2024年)。家計調査には会社の経費・旅行者・外国人観光客などの買い物が入らず、記入もれもあるためです。仮想の住民の行動を確かめるときは家計の値を、業界の大きさを見るときは販売額を使います。</p></div>
    <div class="card"><h2>だれがコンビニで使うか(2024年、月の支出に占める割合)</h2><div id="cv-who"></div>
      <h3>費目のうち、コンビニで買う割合(総世帯、2024年)</h3><div id="cv-items"></div></div>
    <div class="card"><h2>仮想の日本で計算すると</h2><div id="cv-model"></div></div>
    <div class="card"><h2>研究でわかっていること</h2><ul class="facts">
      <li>週に何回もコンビニを使う人は全体の25%。男性20代64%、60代以上21%。女性20代43%、60代以上9.5%。男性・働いている人・喫煙者ほど多い(長崎・石田・横山 2007、全国調査 JGSS-2003)。いまの高齢者はこれより多く使っていると考えられる(70歳以上が世帯主の世帯のコンビニ支出は、20年で約2倍)。</li>
      <li>1回に払う額は、真ん中が約400円で、朝400円・昼550円・深夜750円が平均(Mizuno 2008、arXiv 0802.0105)。</li>
      <li>所得が高い世帯ほど多く使うが、支出全体に占める割合はどの所得でも約2%で変わらない(全国家計構造調査 2024年)。</li>
      <li>店の多さは地方で違い、北海道は人口1万人あたり約6.1店、近畿は約4.1店(商業動態統計と人口推計からの計算)。</li>
      <li>確認できなかったこと:2011年5月以降の来店客数と客単価(業界団体の資料を自動で取得できなかった)、店までの距離と来店回数の関係、ATM・公共料金の支払い・宅配の受け取りの件数。</li></ul>
      <p class="note">出典:総務省「全国家計構造調査」(旧 全国消費実態調査)購入先別支出 2004・2009・2014・2019・2024年、経済産業省「商業動態統計」(e-Stat)、日本フランチャイズチェーン協会 コンビニエンスストア統計調査(2004〜2011年)、論文は上記のとおり。</p></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  el.addEventListener("lab:open", () => { if ($("cv-trend").innerHTML) return;
    $("cv-trend").innerHTML = multiLine([{ name: "業界の販売額(兆円)", color: "#b4473b", points: sy.map((y) => ({ x: Number(y), y: CD.sales[y] / 1e6 })) }], { xLabel: "年", fmt: (v) => `${v.toFixed(0)}兆` });
    const rows = [];
    for (const [sx, label] of [["1_男", "一人暮らしの男性"], ["2_女", "一人暮らしの女性"]]) for (const [b, v] of Object.entries(CD.single[sx])) rows.push({ label: `${label} ${b}`, value: v.share * 100 });
    for (const [b, v] of Object.entries(CD.two)) rows.push({ label: `二人以上の世帯(世帯主 ${b})`, value: v.share * 100 });
    $("cv-who").innerHTML = hbar(rows, { fmt: (v) => `${v.toFixed(1)}%`, labelWidth: 220 });
    const it = Object.entries(CD.items).filter(([k]) => /調理食品|飲料|菓子|たばこ|酒類|外食|食料|書籍/.test(k)).map(([k, v]) => ({ label: k.replace(/^\d+_/, ""), value: (v.cvs_share ?? v) * 100 })).sort((a, b) => b.value - a.value);
    $("cv-items").innerHTML = hbar(it, { fmt: (v) => `${v.toFixed(1)}%`, color: "var(--good)", labelWidth: 150 });
    const P = getPersonas(), m = cvsMarket(P);
    $("cv-model").innerHTML = `<div class="analysis"><div class="a-cards"><div class="a-card"><small>1人が月にコンビニで使う額(仮想の日本の平均)</small><b>${Math.round(m.perPerson).toLocaleString("ja-JP")}円</b> <i>子どもも含めた1人あたり</i></div>
      <div class="a-card"><small>家計から見たコンビニ市場(年)</small><b>${(m.yearTotal / 1e12).toFixed(1)}兆円</b> <i>業界の販売額は${(CD.sales[sy.at(-1)] / 1e6).toFixed(1)}兆円</i></div></div>
      <p class="a-note">仮想の住民の月の支出(家計調査に合わせたもの)に、性別・年齢・世帯の種類ごとのコンビニの割合を掛けた値です。家計から見た額が業界の販売額より小さいのは、上の注記のとおりです。</p></div>`; });
  return { tabs: [["cvs", "コンビニの利用"]] };
}
