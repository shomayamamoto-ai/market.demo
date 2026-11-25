// 結婚と出生:出会い方の変化、交際・結婚の意思、夫婦の子ども数を見て、
// 出生率を「結婚する人の割合 × 夫婦の子どもの数」に分けて動かし、将来の出生数と人口を試算する。
import MD from "./marriage-data.js";
import { project } from "./future.js";
import { esc, multiLine, hbar } from "./charts.js";

const D = MD.decomp, MID = D["2005_mid"];
// 将来推計人口(令和5年推計)の式:出生率 = (1 − 50歳時の未婚割合) × 夫婦の完結出生児数 × 離死別などの係数 × 調整係数
export const tfrOf = (unmarried50, couple) => (1 - unmarried50 / 100) * couple * MID.divorce_coef * MID.adj;

export function mountMarriage({ before }) {
  const el = document.createElement("section"); el.id = "tab-marriage"; el.className = "tab";
  el.innerHTML = `<div class="page-head"><h1>結婚と出生</h1><p>出会い方・交際・結婚の意思・夫婦の子どもの数を見ます。出生率を「結婚する人の割合」と「夫婦の子どもの数」に分けて動かし、将来の出生数と人口を試算します。</p></div>
    <div class="card"><h2>出生率を2つに分けて動かす</h2>
      <p class="note">日本では、結婚していない親から生まれる子は約2.6%(2024年)です。このため出生率は、ほぼ「結婚する人の割合 × 夫婦の子どもの数」で決まります。式と係数は、国立社会保障・人口問題研究所の将来推計人口(令和5年推計)と同じです。</p>
      <div class="form-grid"><label>50歳時点で結婚していない人の割合(%) <input id="mr-u" type="number" min="5" max="40" step="0.5" value="${MID.unmarried50}"></label>
        <label>夫婦の子どもの数(完結出生児数) <input id="mr-c" type="number" min="1.2" max="2.6" step="0.05" value="${MID.couple}"></label></div>
      <p class="note">推計の幅:未婚 ${D["2005_high"].unmarried50}〜${D["2005_low"].unmarried50}%、夫婦の子ども ${D["2005_low"].couple}〜${D["2005_high"].couple}人(2005年生まれの女性の高位〜低位の仮定)。1970年生まれの実績は未婚 ${D["1970"].unmarried50}%、夫婦の子ども ${D["1970"].couple}人。</p>
      <div id="mr-out"></div></div>
    <div class="card"><h2>夫婦はどこで知り合ったか(初婚どうし、過去5年に結婚)</h2><div id="mr-meet"></div>
      <p class="note">出典:国立社会保障・人口問題研究所「出生動向基本調査」(第16回 2021年ほか)。2021年は「ネットで」を新しく分けて聞いた回(2021b)と、前回までと同じ分け方の回(2021a)があります。こども家庭庁のWeb調査では、既婚者が配偶者と出会った場所はアプリが25.1%でしたが、Webモニターの調査のため高めに出ると考えられます。</p></div>
    <div class="card"><h2>交際と結婚の意思、夫婦の子どもの数</h2><div class="kpis" id="mr-kpi"></div><div id="mr-fert"></div><h3>理想の数の子どもを持たない理由(夫婦)</h3><div id="mr-reason"></div></div>
    <div class="card"><h2>研究でわかっていること</h2><ul class="facts">
      <li>結婚の意欲がある人は、12年間で男性54.3%・女性65.1%が結婚した。意欲がない人は男性9.8%・女性21.0%(厚生労働省 21世紀成年者縦断調査)。</li>
      <li>男性の結婚のしやすさは、正社員を1とすると、パート0.45、派遣0.31、無職0.26。年収10万円ごとに約1%上がる(同)。</li>
      <li>夫が家事をする家庭ほど、第2子以降が生まれやすい(同)。</li>
      <li>保育所の定員を2倍にすると出生率が約0.14上がる(2010年代は約0.5)、保育所の整備で生涯未婚率が5.5ポイント下がる(RIETI DP 25-E-033、23-J-030)。</li>
      <li>仮想の選択の実験では、月1万円の支援で結婚を選ぶ確率が、児童手当で+1.2ポイント、住居費支援で+0.5〜0.6ポイント(内閣府 経済分析211号。実際の行動ではなく、答えた選択)。</li>
      <li>1970年生まれから2005年生まれへの出生率の低下のうち、約42%が結婚の減少、約58%が夫婦の子どもの減少による(将来推計の値からの計算。夫婦側には晩婚化の影響を含む)。</li>
      <li>確認できなかったこと:婚約の件数そのもの(公的統計なし)、アプリで出会った人が結婚に至る割合、日本の児童手当が出生を増やした効果の因果の推定。</li></ul></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  const base = project({ tfr: tfrOf(MID.unmarried50, MID.couple), migrants: 16.4, improve: 1 });
  const at = (rows, y) => rows.find((r) => r.x === y);
  const calc = () => {
    const u = Math.min(40, Math.max(5, Number($("mr-u").value) || MID.unmarried50)), c = Math.min(2.6, Math.max(1.2, Number($("mr-c").value) || MID.couple));
    const tfr = tfrOf(u, c), rows = project({ tfr, migrants: 16.4, improve: 1 });
    const b50 = at(rows, 2050), b70 = at(rows, 2070), m50 = at(base, 2050), m70 = at(base, 2070);
    // どちらの側で動かしたかの内訳(対数で分ける)
    const lu = Math.log((1 - u / 100) / (1 - MID.unmarried50 / 100)), lc = Math.log(c / MID.couple), tot = lu + lc;
    $("mr-out").innerHTML = `<div class="analysis"><div class="a-cards">
      <div class="a-card"><small>出生率(長い目で見た値)</small><b>${tfr.toFixed(2)}</b> <i>推計の中位の仮定は${tfrOf(MID.unmarried50, MID.couple).toFixed(2)}</i></div>
      <div class="a-card"><small>2050年の出生数</small><b>${Math.round(b50.births / 1e4)}万人</b> <i>中位の仮定では${Math.round(m50.births / 1e4)}万人</i></div>
      <div class="a-card"><small>2070年の総人口</small><b>${(b70.total / 1e8).toFixed(2)}億人</b> <i>中位の仮定では${(m70.total / 1e8).toFixed(2)}億人</i></div></div>
      <p class="a-headline">${Math.abs(tot) < 1e-6 ? "中位の仮定と同じです。" : `出生率の変化のうち、結婚の側が${Math.round((100 * lu) / tot)}%、夫婦の子どもの側が${Math.round((100 * lc) / tot)}%です。`}</p>
      <p class="a-note">出生率は2026年以降ずっとこの値が続くとして、外国人の入国超過は年16.4万人(推計の中位)、寿命は延びる前提で計算しています。結婚の割合や夫婦の子どもの数が実際に動くまでには年月がかかるため、すぐにこの値になるわけではありません。</p></div>`; };
  $("mr-u").oninput = $("mr-c").oninput = calc;
  el.addEventListener("lab:open", () => { if ($("mr-out").innerHTML) return; calc();
    const M = MD.nfs_meet_channel_first_marriage.by_group, colors = ["#b4473b", "#2f6fd0", "#2f8f6b", "#c9a45c", "#7a5ea8"];
    const pick = ["職場や仕事で", "友人・兄弟姉妹を通じて", "学校で", "見合い・結婚相談所で", "ネットで"].filter((k) => M[k]);
    const yr = (k) => (k === "2021a" ? 2020 : k === "2021b" ? 2021 : Number(k));
    $("mr-meet").innerHTML = multiLine(pick.map((k, i) => ({ name: k.replace("で", "").replace("を通じて", ""), color: colors[i], points: Object.entries(M[k]).filter(([y]) => y !== "2021a").map(([y, v]) => ({ x: yr(y), y: v / 100 })) })), { xLabel: "調査年" });
    const DS = MD.nfs_dating_status.by_group, LI = MD.nfs_lifetime_marriage_intention.by_group, last = (o) => o && o[Object.keys(o).sort().at(-1)];
    $("mr-kpi").innerHTML = [["男性", "恋人または婚約者がいる(18〜34歳の未婚、男性)"], ["女性", "恋人または婚約者がいる(18〜34歳の未婚、女性)"]].map(([s, label]) => `<div class="kpi"><small>${label}</small><b>${last(DS[`${s} / 18～34歳（総数） / 恋人または婚約者がいる（再掲）`]) ?? "―"}%</b><span>いずれ結婚するつもり ${last(LI[`${s} / いずれ結婚するつもり`]) ?? "―"}%</span></div>`).join("")
      + `<div class="kpi"><small>夫婦の子どもの数(完結出生児数)</small><b>${last(MD.nfs_completed_fertility.values)}人</b><span>2002年は2.23人</span></div>`;
    $("mr-fert").innerHTML = multiLine([{ name: "合計特殊出生率", color: "#b4473b", points: Object.entries(MD.tfr_japan.values).map(([y, v]) => ({ x: Number(y), y: v })) }], { xLabel: "年", fmt: (v) => v.toFixed(1) });
    const R = MD.nfs_reasons_fewer_than_ideal.by_group;
    $("mr-reason").innerHTML = hbar(Object.entries(R).map(([k, v]) => ({ label: k, value: last(v) ?? 0 })).sort((a, b) => b.value - a.value).slice(0, 6), { fmt: (v) => `${v.toFixed(1)}%`, labelWidth: 230 }); });
  return { tabs: [["marriage", "結婚と出生"]] };
}
