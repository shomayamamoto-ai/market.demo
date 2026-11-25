// 犯罪と消費者被害:刑法犯・万引き・特殊詐欺・消費者被害の推移、再犯、犯罪と景気・抑止の研究を見る。
// 仮想の住民からは、「詐欺の注意を届けたい人」(65歳以上で一人暮らし、孤独を感じやすい人)の数を数える。
import CR from "./crime-data.js";
import { esc, multiLine } from "./charts.js";

const S = CR.s, pts = (o, k = 1) => Object.entries(o ?? {}).filter(([, v]) => v != null).map(([x, y]) => ({ x: Number(x), y: y / k }));
const lastOf = (o) => { const k = Object.keys(o).sort().at(-1); return [k, o[k]]; };
// 詐欺の注意を届けたい人の数(研究で、孤独を感じる人は被害の見込みが1.44倍、と出ている。ここでは人数の目安だけを出す)
export function fraudOutreach(personas) {
  const old = personas.filter((p) => p.age >= 65), W = (l) => l.reduce((a, p) => a + p.weight, 0);
  const alone = old.filter((p) => p.householdType === "single");
  const lonelyAlone = alone.reduce((a, p) => a + p.weight * (p.mind?.lonely ?? 0), 0);
  return { old: W(old), alone: W(alone), lonelyAlone };
}

export function mountCrime({ before, getPersonas }) {
  const el = document.createElement("section"); el.id = "tab-crime"; el.className = "tab";
  const [ry, rv] = lastOf(S.jp_recog_total.values), [fy, fv] = lastOf(S.jp_special_fraud.values), loss = S.jp_special_fraud.by_group["被害総額_億円"][fy];
  const [dy, dv] = lastOf(S.jp_consumer_damage_estimate.values), [sy, sv] = lastOf(S.jp_recog_shoplift.values);
  el.innerHTML = `<div class="page-head"><h1>犯罪と消費者被害</h1><p>犯罪の件数の推移、万引き、特殊詐欺、消費者被害の大きさ、再犯を、公的統計で見ます。犯罪と景気、取り締まりの効果、詐欺にだまされやすい心理の研究も並べます。</p></div>
    <div class="card"><div class="kpis">
      <div class="kpi"><small>刑法犯の認知件数</small><b>${(rv / 1e4).toFixed(1)}万件</b><span>${ry}年。2000年は${(S.jp_recog_total.values["2000"] / 1e4).toFixed(0)}万件。2022年から増加</span></div>
      <div class="kpi"><small>特殊詐欺の被害額</small><b>${Math.round(loss).toLocaleString("ja-JP")}億円</b><span>${fy}年。${fv.toLocaleString("ja-JP")}件</span></div>
      <div class="kpi"><small>消費者被害・トラブルの推計額</small><b>${dv}兆円</b><span>${dy}年(すでに払った額)</span></div>
      <div class="kpi"><small>万引きの認知件数</small><b>${(sv / 1e4).toFixed(1)}万件</b><span>${sy}年</span></div></div>
      <h3>刑法犯の認知件数と検挙率</h3><div id="cr-total"></div>
      <p class="note">出典:警察庁「犯罪統計」(e-Stat)、総務省「日本統計年鑑」。2014年より前は、1990・1995・2000・2005・2010〜2013年だけを取得できました(途中の年は線でつないでいます)。2023年から、性犯罪の定義が広がった影響で、凶悪犯の件数が増えています。</p></div>
    <div class="card"><h2>特殊詐欺と、SNSを使った詐欺</h2><div id="cr-fraud"></div>
      <p class="note">特殊詐欺の被害者のうち65歳以上の割合(法人を除く)は、2022年の86.6%から2025年の51.3%へ下がりました。SNSを使った投資詐欺・ロマンス詐欺が増え、若い世代の被害が増えたためです(2025年のSNS型の被害額は${S.jp_sns_invest_romance_fraud?.by_group?.["被害総額_億円"]?.["2025"] ?? "―"}億円)。2025年の値は暫定値です。出典:警察庁の統計(e-Stat・高齢社会白書から取得)。</p></div>
    <div class="card"><h2>消費者被害</h2><div id="cr-consumer"></div>
      <p class="note">出典:消費者庁「消費者白書」(消費生活相談 PIO-NET、消費者被害・トラブル額の推計)。被害にあった人の42.6%は誰にも相談せず、相談した人のうち警察に届けたのは9.1%だけです。統計に出る件数は、実際の被害の一部です。</p></div>
    <div class="card"><h2>だれに注意を届けるか(仮想の住民)</h2><div id="cr-reach"></div></div>
    <div class="card"><h2>刑務所を出た人の再入率</h2><div id="cr-re"></div>
      <p class="note">出典:法務省「矯正統計」(e-Stat)の、出所した年ごとの人数と、その後に再び入所した人数から計算(法務省の公表値ではなく、このツールでの計算)。満期で出た人は、仮釈放の人より再入率が高い(5年以内で42〜45%と約27%)。新しく入所した人の67.8%は、犯行のときに無職でした。</p></div>
    <div class="card"><h2>研究でわかっていること</h2><ul class="facts">
      <li>失業率が上がると、窃盗などの犯罪が増える関係が日本でも見られる(大竹・小原 2010。数値は原文が読み取れず未確認)。</li>
      <li>警察官を増やすと犯罪が減る。被害の大きさで重みをつけた犯罪で、警察官1%増に対して約0.5%減(Chalfin & McCrary、NBER w18815。米国)。一方、刑を重くすることの抑止効果はとても小さい(Lee & McCrary。米国)。捕まる確率の方が、罰の重さより効く。</li>
      <li>最低賃金を0.5ドル上げると、刑務所を出た人の1年以内の再入所が2.8%減る(財産犯・薬物犯。Agan & Makowsky、米国)。仕事があることが再犯を防ぐ。</li>
      <li>詐欺の被害に関係する心理(愛知県のデータ):孤独を感じている人は被害の見込みが1.44倍、人を信じやすい人は1.35倍、地域の行事に参加している人は0.39倍(守られる側)。手口を知らないと27.6倍。</li>
      <li>詐欺を途中で止めたのは、コンビニの店員38%、銀行の職員24%、家族23%(未遂の事例)。お店の声かけが最も多い。</li>
      <li>「自分は大丈夫」と思う楽観的な人ほど、注意の呼びかけが届きにくい(木村 2023 など、J-STAGE)。</li>
      <li>住んでいる地域が「安全だ」と感じる気持ちは、その地域の実際の犯罪の多さとよく一致する(相関 −0.82、山本 2016)。</li>
      <li>確認できなかったこと:お店の万引きなどによる損失の割合(ロス率)の全国の値、警察に届け出る割合の調査(暗数調査)、「治安が悪くなった」と感じる人の割合の推移。どれも、まだ接続を許可していないサイトにあります。</li></ul></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  el.addEventListener("lab:open", () => {
    const P = getPersonas?.() ?? [];
    if (P.length) {
      const r = fraudOutreach(P), man = (v) => `${(v / 1e4).toLocaleString("ja-JP", { maximumFractionDigits: 0 })}万人`;
      $("cr-reach").innerHTML = `<div class="kpis"><div class="kpi"><small>65歳以上</small><b>${man(r.old)}</b></div><div class="kpi"><small>うち一人暮らし</small><b>${man(r.alone)}</b></div><div class="kpi"><small>うち、孤独を「しばしば・常に」感じる見込みの人</small><b>${man(r.lonelyAlone)}</b></div></div>
        <p class="note">仮想の住民から数えた目安です。孤独を感じる人は詐欺の被害の見込みが1.44倍という研究があり、注意の呼びかけや見守りを優先して届けたい層です。ただし近年は、SNSを使った詐欺で若い世代の被害も増えています。</p>`;
    }
    if ($("cr-total").innerHTML) return;
    $("cr-total").innerHTML = multiLine([{ name: "認知件数(10万件)", color: "#b4473b", points: pts(S.jp_recog_total.values, 1e5) }, { name: "検挙率(%を10で割った値)", color: "#2f6fd0", points: pts(S.jp_clearance_rate_total.values, 10) }], { xLabel: "年", fmt: (v) => v.toFixed(0) });
    $("cr-fraud").innerHTML = multiLine([{ name: "特殊詐欺の件数(千件)", color: "#b4473b", points: pts(S.jp_special_fraud.values, 1e3) }, { name: "被害額(10億円)", color: "#c9a45c", points: pts(S.jp_special_fraud.by_group["被害総額_億円"], 10) }], { xLabel: "年", fmt: (v) => v.toFixed(0) });
    $("cr-consumer").innerHTML = multiLine([{ name: "消費生活相談(万件)", color: "#2f6fd0", points: pts(S.jp_consumer_consultations.values) }, { name: "うち65歳以上(万件)", color: "#b4473b", points: pts(S.jp_consumer_consultations.by_group["65歳以上_万件(65-69,70-74,75-79,80-84,85+の合計)"]) }], { xLabel: "年", fmt: (v) => `${v.toFixed(0)}万` });
    $("cr-re").innerHTML = multiLine([{ name: "2年以内に再入所", color: "#c9a45c", points: pts(S.jp_reentry_rate_prison.values, 100) }, { name: "5年以内に再入所", color: "#b4473b", points: pts(S.jp_reentry_rate_prison.by_group["5年以内再入率_%"], 100) }], { xLabel: "出所した年" });
  });
  return { tabs: [["crime", "犯罪と消費者被害"]] };
}
