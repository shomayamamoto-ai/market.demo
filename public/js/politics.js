// 政治と経済:手取りと負担、消費税、選挙と世代。
// 制度の数字(税率・保険料率・投票率)は公表資料の値。仮定で補った部分は POLITICS_ASSUMPTIONS に書く。
import PD from "./policy-data.js";
import { AGE_BANDS, ageBandOf, CATEGORY_KEYS, CATEGORIES } from "./constants.js";
import { esc, hbar } from "./charts.js";

export const POLITICS_ASSUMPTIONS = {
  dependents: { value: "考慮しない", note: "手取りの計算で、配偶者控除・扶養控除・生命保険料控除などは入れていない。基礎控除と給与所得控除、社会保険料控除だけで計算する。家族のいる人の税は、実際より多めに出る" },
  employee: { value: "年収106万円以上の雇われている人", note: "厚生年金・健康保険に入る人の範囲。正規雇用と役員は全員、非正規雇用は年収106万円以上とした。企業規模や労働時間の条件は入れていない" },
  dependentSpouse: { value: "年収130万円未満の既婚の非正規・家事", note: "配偶者の扶養に入る(保険料がかからない)人の範囲。実際は配偶者が会社員の場合だけだが、区別していない" },
  nhi: { value: "所得割9.22%+均等割+世帯割", note: "自営業・無職の人の国民健康保険料。令和5年度の全国平均の料率で計算(上限109万円)。自治体による差、軽減制度は入れていない" },
  pensionIncome: { value: "65歳以上110万円、65歳未満60万円を控除", note: "年金にかかる税の計算で引く額(公的年金等控除)。一般に知られた値で、今回の調査では一次資料を確認していない" },
  bonus: { value: "考慮しない", note: "保険料の計算で、賞与と月給を区別せず、標準報酬の上限も入れていない。年収の高い人の保険料は、実際より多めに出る" },
  taxable: { value: { food: [0.78, 0.22], housing: 0.3, utilities: 1, furniture: 1, clothing: 1, medical: 0.4, transport_comm: 1, education: 0.3, recreation: 1, other: 0.9 }, note: "消費税がかかる支出の割合。食料は「軽減税率8%の分」と「標準税率10%の分(外食・酒)」の割合。家賃・保険診療・授業料は非課税。割合は仮定(家計調査の内訳では確認していない)" },
  household: { value: "家計の消費だけ", note: "消費税の税収の試算は、家計の消費にかかる分だけ。住宅の購入、政府や非営利団体の支出、非課税事業者の仕入れにかかる分は入らないので、実際の税収より少なく出る" },
};

const P0 = PD;
// 1人の手取りを計算する(円/年)。income は万円
export function takeHome(p) {
  const S = p.income * 10000, age = p.age, employed = ["regular", "exec", "nonRegular"].includes(p.status);
  if (S <= 0) return { income: 0, tax: 0, resident: 0, social: 0, net: 0 };
  const so = P0.social, covered = (p.status === "regular" || p.status === "exec" || (p.status === "nonRegular" && S >= 1060000)) && age < 75;
  let social = 0;
  if (covered) social = S * ((age < 70 ? so.pension : 0) + so.health + so.child + so.employment + (age >= 40 && age < 65 ? so.care : 0));
  else {
    const dependent = p.marital === "既婚" && S < 1300000 && ["nonRegular", "housework", "none", "unemployed"].includes(p.status);
    if (!dependent) {
      const base = Math.max(0, (employed ? S - empDeduction(S) : p.working ? S : Math.max(0, S - (age >= 65 ? 1100000 : 600000))) - P0.residentBasicDeduction);
      social = Math.min(so.nhi.cap, base * so.nhi.rate + so.nhi.perCapita + so.nhi.perHousehold) + (age >= 20 && age < 60 ? so.nationalPension : 0);
    } else if (employed) social = S * so.employment;
  }
  // 所得(給与は給与所得控除、年金は公的年金等控除、自営は年収をそのまま所得とみなす)
  const earned = employed ? Math.max(0, S - empDeduction(S)) : p.working ? S : Math.max(0, S - (age >= 65 ? 1100000 : 600000));
  const basic = P0.basicDeduction.find(([up]) => earned <= up)?.[1] ?? 0;
  const taxable = Math.max(0, earned - social - basic);
  const b = P0.incomeTax.brackets.find(([up]) => up == null || taxable <= up);
  const tax = Math.max(0, taxable * b[1] - b[2]) * (1 + P0.incomeTax.surtax);
  const rBase = Math.max(0, earned - social - P0.residentBasicDeduction), resident = rBase > 0 ? rBase * P0.residentTax.rate + P0.residentTax.perCapita : 0;
  return { income: S, tax, resident, social, net: S - tax - resident - social };
}
function empDeduction(S) {
  const d = S <= 3600000 ? S * 0.3 + 80000 : S <= 6600000 ? S * 0.2 + 440000 : S <= 8500000 ? S * 0.1 + 1100000 : P0.employmentDeduction.cap;
  return Math.min(S, Math.max(P0.employmentDeduction.min, d));
}

// 年収の階級ごとの負担率(働いている人)
const CLASSES = [[0, 200], [200, 300], [300, 400], [400, 500], [500, 600], [600, 800], [800, 1000], [1000, 1500], [1500, 1e9]];
export function burdenTable(personas) {
  return CLASSES.map(([lo, hi]) => {
    const g = personas.filter((p) => p.working && p.income >= lo && p.income < hi); let w = 0, inc = 0, tax = 0, soc = 0;
    for (const p of g) { const t = takeHome(p); w += p.weight; inc += p.weight * t.income; tax += p.weight * (t.tax + t.resident); soc += p.weight * t.social; }
    return { label: hi > 1e8 ? `${lo}万円以上` : `${lo}〜${hi}万円`, lo, hi, people: w, income: w ? inc / w / 10000 : 0, tax: inc ? tax / inc : 0, social: inc ? soc / inc : 0, total: inc ? (tax + soc) / inc : 0 };
  }).filter((r) => r.people > 0);
}
// 家計調査(二人以上の勤労者世帯)の、同じ年収水準の負担率
export const fiesAt = (incomeMan) => PD.burden.slice(1).reduce((a, r) => (Math.abs(r.income - incomeMan) < Math.abs(a.income - incomeMan) ? r : a));

// 消費税:1人が1年に払う額(円)。rates = { standard, reduced }(0〜1)
export function consumptionTaxOf(p, rates) {
  const T = POLITICS_ASSUMPTIONS.taxable.value; let tax = 0;
  for (const k of CATEGORY_KEYS) {
    const spend = p.spend[k] * 12; // 税込みの支出
    if (k === "food") { const [r, s] = T.food; tax += spend * r * (PD.consumptionTax.reduced / (1 + PD.consumptionTax.reduced)) * (rates.reduced / PD.consumptionTax.reduced) * ((1 + PD.consumptionTax.reduced) / (1 + PD.consumptionTax.reduced)) + spend * s * (rates.standard / (1 + PD.consumptionTax.standard)); }
    else tax += spend * T[k] * (rates.standard / (1 + PD.consumptionTax.standard));
  }
  return tax;
}
export function consumptionTaxTable(personas, rates) {
  const now = { standard: PD.consumptionTax.standard, reduced: PD.consumptionTax.reduced }, tiers = ["低い", "やや低い", "中くらい", "やや高い", "高い"];
  let total0 = 0, total1 = 0, spendAll = 0;
  const rows = tiers.map((label, t) => { const g = personas.filter((p) => p.tier === t); let w = 0, a = 0, b = 0, spend = 0;
    for (const p of g) { const x = consumptionTaxOf(p, now), y = consumptionTaxOf(p, rates); w += p.weight; a += p.weight * x; b += p.weight * y; spend += p.weight * p.spendTotal * 12; }
    total0 += a; total1 += b; spendAll += spend;
    return { label, before: a / w, after: b / w, shareBefore: a / spend, shareAfter: b / spend }; });
  // 値段が変わる分だけ、同じお金で買える量が変わる(税抜きの値段は変わらないと仮定)
  return { rows, total0, total1, price: (total1 - total0) / (spendAll - total0 + total0), real: -(total1 - total0) / spendAll };
}

// 選挙:年代ごとの有権者と、投票に行く人
const DECADES = [["10歳代", 18, 19], ["20歳代", 20, 29], ["30歳代", 30, 39], ["40歳代", 40, 49], ["50歳代", 50, 59], ["60歳代", 60, 69], ["70歳代以上", 70, 200]];
export function voteTable(personas, turnout) {
  const rows = DECADES.map(([label, lo, hi]) => { const w = personas.filter((p) => p.age >= lo && p.age <= hi).reduce((a, p) => a + p.weight, 0); return { label, voters: w, turnout: (turnout[label] ?? 0) / 100, votes: (w * (turnout[label] ?? 0)) / 100 }; });
  const V = rows.reduce((a, r) => a + r.voters, 0), X = rows.reduce((a, r) => a + r.votes, 0);
  for (const r of rows) { r.voterShare = r.voters / V; r.voteShare = r.votes / X; }
  const share = (list, key) => list.reduce((a, r) => a + r[key], 0);
  return { rows, voters: V, votes: X, turnout: X / V, old: { voters: share(rows.slice(5), "voterShare"), votes: share(rows.slice(5), "voteShare") }, young: { voters: share(rows.slice(0, 3), "voterShare"), votes: share(rows.slice(0, 3), "voteShare") } };
}

// ---------- 画面 ----------
export function mountPolitics({ getPersonas, before }) {
  const make = (id, html) => { const el = document.createElement("section"); el.id = `tab-${id}`; el.className = "tab"; el.innerHTML = html; before.parentNode.insertBefore(el, before); return el; };
  const yen = (v) => `${Math.round(v).toLocaleString("ja-JP")}円`, man = (v) => `${Math.round(v / 10000).toLocaleString("ja-JP")}万円`, pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`, people = (v) => `${Math.round(v / 1e4).toLocaleString("ja-JP")}万人`;
  const NB = PD.nationalBurden[PD.nationalBurden.length - 1];

  // 1) 手取りと負担
  const a = make("takehome", `<div class="page-head"><h1>手取りと負担</h1><p>年収から所得税・住民税・社会保険料を引いた手取りを、仮想の日本の1人ずつについて計算します。</p></div>
    <div class="card"><div class="form-grid"><label>年収を入れて試す(万円) <input id="th-income" type="number" value="500" min="0" max="10000" step="10"></label><label>年齢 <input id="th-age" type="number" value="40" min="15" max="100"></label>
      <label>働き方 <select id="th-status"><option value="regular">正規雇用</option><option value="nonRegular">非正規雇用</option><option value="self">自営業</option><option value="none">年金で暮らす</option></select></label>
      <label>配偶者 <select id="th-married"><option value="0">いない</option><option value="1">いる</option></select></label></div>
      <div id="th-one"></div>
      <p class="note">税率と保険料率は令和8年度の制度です(所得税の税率表・基礎控除・給与所得控除:財務省、住民税:総務省、厚生年金・雇用保険:厚生労働省、健康保険・介護保険:協会けんぽの全国平均)。<br>配偶者控除や扶養控除は入れていないので、家族のいる人の税は実際より多めに出ます。</p></div>
    <div id="th-out"></div>`);
  const one = () => { const p = { income: Number(a.querySelector("#th-income").value) || 0, age: Number(a.querySelector("#th-age").value) || 40, status: a.querySelector("#th-status").value, marital: a.querySelector("#th-married").value === "1" ? "既婚" : "未婚" };
    p.working = p.status !== "none"; const t = takeHome(p);
    a.querySelector("#th-one").innerHTML = t.income ? `<div class="table-scroll"><table class="verify"><tr><th>項目</th><th class="num">年額</th><th class="num">年収に対する割合</th></tr>
      <tr><td>年収</td><td class="num">${man(t.income)}</td><td class="num">100%</td></tr><tr><td>所得税(復興特別所得税を含む)</td><td class="num">${man(t.tax)}</td><td class="num">${pct(t.tax / t.income)}</td></tr>
      <tr><td>住民税</td><td class="num">${man(t.resident)}</td><td class="num">${pct(t.resident / t.income)}</td></tr><tr><td>社会保険料(本人の負担分)</td><td class="num">${man(t.social)}</td><td class="num">${pct(t.social / t.income)}</td></tr>
      <tr><td><b>手取り</b></td><td class="num"><b>${man(t.net)}</b></td><td class="num"><b>${pct(t.net / t.income)}</b></td></tr></table></div>` : ""; };
  a.oninput = a.onchange = one;
  a.addEventListener("lab:open", () => { one(); const rows = burdenTable(getPersonas());
    a.querySelector("#th-out").innerHTML = `<div class="card"><h2>年収ごとの負担(働いている人)</h2>
      <div class="table-scroll"><table class="verify"><tr><th>年収</th><th class="num">人数</th><th class="num">税</th><th class="num">社会保険料</th><th class="num">合計</th><th class="num">家計調査の世帯</th></tr>${rows.map((r) => { const f = fiesAt(r.income); return `<tr><td>${r.label}</td><td class="num">${people(r.people)}</td><td class="num">${pct(r.tax)}</td><td class="num">${pct(r.social)}</td><td class="num"><b>${pct(r.total)}</b></td><td class="num">${pct(f.total)}<small>年収${f.income}万円の世帯</small></td></tr>`; }).join("")}</table></div>
      <p class="note">右端は、総務省「家計調査」2025年の、二人以上の勤労者世帯の実績(税と社会保険料 ÷ 実収入)です。世帯は平均1.81人で稼いでいるので、同じ世帯年収でも1人あたりの年収は低く、税率が下がります。そのため、1人ずつ計算したこの表のほうが高めに出ます。<br>国全体の負担(国民負担率)は、${NB.year}年度の見通しで${NB.total}%(税${NB.tax}%+社会保障${NB.social}%。国民所得に対する割合で、会社が払う分や消費税なども含む。財務省)です。</p></div>`; });

  // 2) 消費税
  const b = make("ctax", `<div class="page-head"><h1>消費税を変える</h1><p>消費税率を変えると、だれの負担がどれだけ変わるかを、仮想の日本の1人ずつの支出から計算します。</p></div>
    <div class="card"><div class="form-grid"><label>標準の税率(%) <input id="ct-std" type="number" value="10" min="0" max="30" step="0.5"></label><label>飲食料品の税率(%) <input id="ct-red" type="number" value="8" min="0" max="30" step="0.5"></label>
      <label>条件 <select id="ct-preset"><option value="10,8">いまの税率(10%・8%)</option><option value="10,0">飲食料品を0%に</option><option value="10,5">飲食料品を5%に</option><option value="8,8">一律8%に</option><option value="5,5">一律5%に</option><option value="12,8">標準を12%に</option><option value="15,8">標準を15%に</option></select></label></div>
      <div class="form-row"><button id="ct-run" class="primary">計算する</button></div>
      <p class="note">いまの税率は標準10%、飲食料品(酒類・外食を除く)と定期購読の新聞が8%です。${esc(PD.consumptionTax.pendingStatus)}の法案があります(${esc(PD.consumptionTax.pending)})。</p></div>
    <div id="ct-out"></div>`);
  b.querySelector("#ct-preset").onchange = (e) => { const [s, r] = e.target.value.split(","); b.querySelector("#ct-std").value = s; b.querySelector("#ct-red").value = r; b.querySelector("#ct-run").click(); };
  b.querySelector("#ct-run").onclick = () => { const rates = { standard: (Number(b.querySelector("#ct-std").value) || 0) / 100, reduced: (Number(b.querySelector("#ct-red").value) || 0) / 100 }, t = consumptionTaxTable(getPersonas(), rates);
    const diff = t.total1 - t.total0, actual = (PD.consumptionTax.revenueNationalOku * 1e8) / PD.consumptionTax.nationalShare, S = PD.studies.vat2014;
    b.querySelector("#ct-out").innerHTML = `<div class="analysis"><h2>標準${(rates.standard * 100).toFixed(1)}%・飲食料品${(rates.reduced * 100).toFixed(1)}%にした場合</h2>
      <div class="a-cards"><div class="a-card"><small>家計が払う消費税(年)</small><b>${(t.total1 / 1e12).toFixed(1)}兆円</b> <i>いまは${(t.total0 / 1e12).toFixed(1)}兆円</i></div>
        <div class="a-card"><small>増減</small><b>${diff >= 0 ? "+" : ""}${(diff / 1e12).toFixed(1)}兆円</b> <i>1人あたり年${diff >= 0 ? "+" : ""}${yen(diff / getPersonas().reduce((x, p) => x + p.weight, 0))}</i></div>
        <div class="a-card"><small>同じお金で買える量</small><b>${t.real >= 0 ? "+" : ""}${pct(t.real)}</b> <i>税抜きの値段が変わらない場合</i></div></div>
      <p class="a-headline">${Math.abs(diff) < 1e9 ? "いまの税率と同じです。" : `家計の負担は年${(Math.abs(diff) / 1e12).toFixed(1)}兆円${diff > 0 ? "増え" : "減り"}ます。支出に占める割合で見ると、収入の低い層は${pct(t.rows[0].shareBefore)}から${pct(t.rows[0].shareAfter)}へ、高い層は${pct(t.rows[4].shareBefore)}から${pct(t.rows[4].shareAfter)}へ変わります。`}</p></div>
      <div class="card"><h3>収入の層ごとの負担(1人あたり・年)</h3>
      <div class="table-scroll"><table class="verify"><tr><th>収入の層</th><th class="num">いま</th><th class="num">変更後</th><th class="num">増減</th><th class="num">支出に占める割合(いま→変更後)</th></tr>${t.rows.map((r) => `<tr><td>${r.label}</td><td class="num">${yen(r.before)}</td><td class="num">${yen(r.after)}</td><td class="num">${r.after - r.before >= 0 ? "+" : ""}${yen(r.after - r.before)}</td><td class="num">${pct(r.shareBefore)} → ${pct(r.shareAfter)}</td></tr>`).join("")}</table></div>
      <h3>実際の数字との見比べ</h3><ul class="facts">
        <li><b>税収:</b>いまの税率での家計の負担は、この計算で${(t.total0 / 1e12).toFixed(1)}兆円です。国と地方を合わせた消費税の税収は約${(actual / 1e12).toFixed(1)}兆円(令和8年度予算の国の分${(PD.consumptionTax.revenueNationalOku / 1e4).toFixed(1)}兆円から計算)。差が大きいのは、住宅の購入や政府・企業の支出にかかる分が入っていないことに加え、もとにした家計調査の支出が、国全体の消費の統計より少なく出るためです。金額そのものより、層ごとの違いと、税率を変えたときの増減の割合を見てください。</li>
        <li><b>消費への影響:</b>2014年に税率を5%から8%に上げたとき、家計の消費は、引き上げが決まった時点で${Math.abs(S.announce)}%、実施の時点で${Math.abs(S.implement)}%下がったと推定されています(${esc(S.cite)})。買える量が減る分に、ほぼ見合う大きさです。</li>
        <li><b>この計算に入っていないこと:</b>駆け込みと反動、値段への転嫁の遅れ、減った税収をどう埋めるか(ほかの増税や給付の削減)。</li></ul>
      <p class="note">食料のうち軽減税率の対象は78%、家賃・保険診療・授業料は非課税、と仮定しています(一覧は「出典と仮定」)。</p></div>`; };
  b.addEventListener("lab:open", () => { if (!b.querySelector("#ct-out").innerHTML) { b.querySelector("#ct-preset").value = "10,0"; b.querySelector("#ct-preset").onchange({ target: b.querySelector("#ct-preset") }); } });

  // 3) 選挙と世代
  const elections = [...PD.turnout["衆院選"].map((e) => ({ ...e, kind: "衆院選" })), ...PD.turnout["参院選"].map((e) => ({ ...e, kind: "参院選" }))].sort((x, y) => (x.name < y.name ? 1 : -1));
  const c = make("vote", `<div class="page-head"><h1>選挙と世代</h1><p>年代ごとの人口と投票率から、どの年代の票がどれだけあるかを計算します。</p></div>
    <div class="card"><div class="form-grid"><label>選挙 <select id="vt-election">${elections.map((e, i) => `<option value="${i}">${e.kind} ${esc(e.name)}(全体${e.pct["全体"]}%)</option>`).join("")}</select></label>
      <label>20歳代・30歳代の投票率を変える(ポイント) <input id="vt-young" type="number" value="0" min="-40" max="60" step="1"></label></div>
      <p class="note">投票率は、総務省「国政選挙における年代別投票率について」の値です(一部の投票区を抜き出した調査)。人口は、このツールの仮想の日本(18歳以上、外国籍の人を含む)を使っています。</p></div>
    <div id="vt-out"></div>`);
  const vote = () => { const e = elections[Number(c.querySelector("#vt-election").value)], add = Number(c.querySelector("#vt-young").value) || 0, turnout = { ...e.pct };
    for (const k of ["20歳代", "30歳代"]) turnout[k] = Math.min(100, Math.max(0, (turnout[k] ?? 0) + add));
    if (turnout["10歳代"] == null) turnout["10歳代"] = 0;
    const t = voteTable(getPersonas(), turnout), base = voteTable(getPersonas(), { ...e.pct, "10歳代": e.pct["10歳代"] ?? 0 });
    c.querySelector("#vt-out").innerHTML = `<div class="analysis"><h2>${e.kind} ${esc(e.name)}${add ? `(20・30歳代の投票率を${add > 0 ? "+" : ""}${add}ポイント)` : ""}</h2>
      <div class="a-cards"><div class="a-card"><small>60歳以上の票</small><b>${pct(t.old.votes)}</b> <i>有権者に占める割合は${pct(t.old.voters)}</i></div>
        <div class="a-card"><small>39歳以下の票</small><b>${pct(t.young.votes)}</b> <i>有権者に占める割合は${pct(t.young.voters)}</i></div>
        <div class="a-card"><small>全体の投票率(この計算)</small><b>${pct(t.turnout)}</b> <i>公表値は${e.pct["全体"]}%</i></div></div>
      <p class="a-headline">60歳以上は有権者の${pct(t.old.voters, 0)}ですが、投票に行く人の中では${pct(t.old.votes, 0)}を占めます。39歳以下は有権者の${pct(t.young.voters, 0)}で、票では${pct(t.young.votes, 0)}です。${add ? `20・30歳代の投票率を変える前は、39歳以下の票は${pct(base.young.votes)}でした。` : ""}</p></div>
      <div class="card"><h3>年代ごとの有権者と票</h3><div class="table-scroll"><table class="verify"><tr><th>年代</th><th class="num">有権者</th><th class="num">有権者に占める割合</th><th class="num">投票率</th><th class="num">票に占める割合</th></tr>${t.rows.map((r) => `<tr><td>${r.label}</td><td class="num">${people(r.voters)}</td><td class="num">${pct(r.voterShare)}</td><td class="num">${pct(r.turnout)}</td><td class="num"><b>${pct(r.voteShare)}</b></td></tr>`).join("")}</table></div>
      <h3>票に占める割合</h3>${hbar(t.rows.map((r) => ({ label: r.label, value: r.voteShare })), { fmt: (v) => pct(v) })}
      <p class="note">年代別の投票率と、この計算の全体の投票率は、もとの調査の方法が違うため一致しません。<br>読み取れるのは「人口が多く、投票率も高い年代の声が大きくなる」という構造までで、どの年代がどの政策を支持するかは、この計算には入っていません。</p></div>`; };
  c.oninput = c.onchange = vote; c.addEventListener("lab:open", vote);
  return { tabs: [["takehome", "手取りと負担"], ["ctax", "消費税を変える"], ["vote", "選挙と世代"]] };
}
