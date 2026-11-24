// 政治と経済:手取りと負担、消費税、選挙と世代。
// 制度の数字(税率・保険料率・投票率)は公表資料の値。仮定で補った部分は POLITICS_ASSUMPTIONS に書く。
import PD from "./policy-data.js";
import { AGE_BANDS, ageBandOf, CATEGORY_KEYS, CATEGORIES } from "./constants.js";
import { esc, hbar } from "./charts.js";

export const POLITICS_ASSUMPTIONS = {
  dependents: { value: "年収ごとの平均額", note: "配偶者控除・扶養控除・生命保険料控除などは、1人ずつの家族の状況が分からないため、同じ年収の給与所得者の平均額を引く(国税庁「民間給与実態統計調査」令和7年分。年収450万円で平均19万円、850万円で42万円)。住宅ローン控除も、同じ統計の平均の割合を税額から引く。雇われて働く人だけに適用する" },
  employee: { value: "年収106万円以上の雇われている人", note: "厚生年金・健康保険に入る人の範囲。正規雇用と役員は全員、非正規雇用は年収106万円以上で、家族の扶養に入らない人。労働時間や会社の規模の条件は入れていない" },
  dependentSpouse: { value: "年収130万円未満で、既婚または親と暮らす人", note: "家族の扶養に入る(保険料がかからない)人の範囲。実際は扶養する家族が会社員の場合だけだが、区別していない" },
  nhi: { value: "所得割9.22%+均等割+世帯割", note: "自営業・無職の人の国民健康保険料。令和5年度の全国平均の料率で計算(上限109万円)。自治体による差、軽減制度は入れていない" },
  pensionIncome: { value: "65歳以上110万円、65歳未満60万円を控除", note: "年金にかかる税の計算で引く額(公的年金等控除)。一般に知られた値で、今回の調査では一次資料を確認していない" },
  bonus: { value: 0.2, note: "年収のうち賞与の割合(夏と冬の2回)。保険料の上限(厚生年金は月65万円・賞与1回150万円、健康保険は月139万円・賞与年573万円)を当てはめるのに使う。割合は仮定" },
  taxable: { value: { food: [0.78, 0.22], housing: 0.3, utilities: 1, furniture: 1, clothing: 1, medical: 0.4, transport_comm: 1, education: 0.3, recreation: 1, other: 0.9 }, note: "消費税がかかる支出の割合。食料は「軽減税率8%の分」と「標準税率10%の分(外食・酒)」の割合。家賃・保険診療・授業料は非課税。割合は仮定(家計調査の内訳では確認していない)" },
  household: { value: "家計の消費だけ", note: "消費税の税収の試算は、家計の消費にかかる分だけ。住宅の購入、政府や非営利団体の支出、非課税事業者の仕入れにかかる分は入らないので、実際の税収より少なく出る" },
};

const P0 = PD;
// 1人の手取りを計算する(円/年)。income は万円
export function takeHome(p) {
  const S = p.income * 10000, age = p.age, employed = ["regular", "exec", "nonRegular"].includes(p.status);
  if (S <= 0) return { income: 0, tax: 0, resident: 0, social: 0, net: 0 };
  // 家族の扶養に入れる人(年収130万円未満で、既婚または親と暮らす人)は、保険料がかからない。それ以外の年収106万円以上の非正規雇用は、勤め先の保険に入るとみなす
  const canDepend = S < 1300000 && (p.marital === "既婚" || p.asChild || age < 23);
  const so = P0.social, covered = (p.status === "regular" || p.status === "exec" || (p.status === "nonRegular" && S >= 1060000 && !canDepend)) && age < 75;
  let social = 0;
  if (covered) { // 月給と賞与に分け、保険料がかかる上限を当てはめる
    const bonus = S * POLITICS_ASSUMPTIONS.bonus.value, monthly = (S - bonus) / 12, C = P0.caps;
    const pensionBase = Math.min(monthly, C.pensionMonthly) * 12 + 2 * Math.min(bonus / 2, C.pensionBonus), healthBase = Math.min(monthly, C.healthMonthly) * 12 + Math.min(bonus, C.healthBonusYear);
    social = (age < 70 ? pensionBase * so.pension : 0) + healthBase * (so.health + so.child + (age >= 40 && age < 65 ? so.care : 0)) + S * so.employment;
  }
  else {
    const dependent = canDepend && ["nonRegular", "housework", "none", "unemployed", "student"].includes(p.status);
    if (!dependent) {
      const base = Math.max(0, (employed ? S - empDeduction(S) : p.working ? S : Math.max(0, S - (age >= 65 ? 1100000 : 600000))) - P0.residentBasicDeduction);
      social = Math.min(so.nhi.cap, base * so.nhi.rate + so.nhi.perCapita + so.nhi.perHousehold) + (age >= 20 && age < 60 ? so.nationalPension : 0);
    } else if (employed) social = S * so.employment;
  }
  // 所得(給与は給与所得控除、年金は公的年金等控除、自営は年収をそのまま所得とみなす)
  const earned = employed ? Math.max(0, S - empDeduction(S)) : p.working ? S : Math.max(0, S - (age >= 65 ? 1100000 : 600000));
  const basic = P0.basicDeduction.find(([up]) => earned <= up)?.[1] ?? 0;
  // 家族や保険の控除:同じ年収の人の平均額(国税庁の統計)。p.plain が真なら入れない
  const avg = employed && !p.plain ? ntaAt(S / 10000) : null, other = avg ? avg.other * 10000 : 0;
  const taxable = Math.max(0, earned - social - basic - other);
  const b = P0.incomeTax.brackets.find(([up]) => up == null || taxable <= up);
  const tax = Math.max(0, Math.max(0, taxable * b[1] - b[2]) * (1 + P0.incomeTax.surtax) - (avg ? avg.credit * S : 0));
  const rBase = Math.max(0, earned - social - P0.residentBasicDeduction - other * 0.87), resident = rBase > 0 ? rBase * P0.residentTax.rate + P0.residentTax.perCapita : 0;
  return { income: S, tax, resident, social, net: S - tax - resident - social };
}
// 国税庁の統計から、その年収の人の平均的な控除額(万円)と住宅ローン控除の割合を、前後の階級から補間して出す
export function ntaAt(incomeMan) {
  const R = P0.nta; if (incomeMan <= R[0].income) return R[0]; if (incomeMan >= R[R.length - 1].income) return R[R.length - 1];
  const i = R.findIndex((r) => r.income >= incomeMan), a = R[i - 1], b = R[i], t = (incomeMan - a.income) / (b.income - a.income);
  return { other: a.other + t * (b.other - a.other), credit: a.credit + t * (b.credit - a.credit), tax: a.tax + t * (b.tax - a.tax), social: a.social + t * (b.social - a.social) };
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
    let it = 0;
    for (const p of g) { const t = takeHome(p); w += p.weight; inc += p.weight * t.income; tax += p.weight * (t.tax + t.resident); it += p.weight * t.tax; soc += p.weight * t.social; }
    return { label: hi > 1e8 ? `${lo}万円以上` : `${lo}〜${hi}万円`, lo, hi, people: w, income: w ? inc / w / 10000 : 0, incomeTax: inc ? it / inc : 0, tax: inc ? tax / inc : 0, social: inc ? soc / inc : 0, total: inc ? (tax + soc) / inc : 0 };
  }).filter((r) => r.people > 0);
}
// 雇われて働く人の、年収階級ごとの所得税と社会保険料の割合(国税庁の統計と同じ区切りで比べる)
export function employeeRates(personas) {
  return P0.nta.filter((r) => r.income >= 250 && r.income <= 1000).map((r) => {
    const g = personas.filter((p) => ["regular", "nonRegular", "exec"].includes(p.status) && p.income >= r.income * 0.9 && p.income < r.income * 1.1); let inc = 0, tax = 0, soc = 0;
    for (const p of g) { const t = takeHome(p); inc += p.weight * t.income; tax += p.weight * t.tax; soc += p.weight * t.social; }
    return { label: r.label, income: r.income, n: g.length, tax: inc ? tax / inc : 0, social: inc ? soc / inc : 0, realTax: r.tax, realSocial: r.social };
  });
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
      <label>配偶者 <select id="th-married"><option value="0">いない</option><option value="1">いる</option></select></label>
      <label>家族や保険の控除 <select id="th-plain"><option value="0">同じ年収の人の平均を入れる</option><option value="1">入れない(独身・控除なし)</option></select></label></div>
      <div id="th-one"></div>
      <p class="note">税率と保険料率は令和8年度の制度です(所得税の税率表・基礎控除・給与所得控除:財務省、住民税:総務省、厚生年金・雇用保険:厚生労働省、健康保険・介護保険:協会けんぽの全国平均)。<br>保険料がかかる上限は、日本年金機構と協会けんぽの保険料額表で確認しました。配偶者控除・扶養控除・生命保険料控除などは、同じ年収の給与所得者の平均額(国税庁の統計)を引いています。</p></div>
    <div id="th-out"></div>`);
  const one = () => { const p = { income: Number(a.querySelector("#th-income").value) || 0, age: Number(a.querySelector("#th-age").value) || 40, status: a.querySelector("#th-status").value, marital: a.querySelector("#th-married").value === "1" ? "既婚" : "未婚", plain: a.querySelector("#th-plain").value === "1" };
    p.working = p.status !== "none"; const t = takeHome(p);
    a.querySelector("#th-one").innerHTML = t.income ? `<div class="table-scroll"><table class="verify"><tr><th>項目</th><th class="num">年額</th><th class="num">年収に対する割合</th></tr>
      <tr><td>年収</td><td class="num">${man(t.income)}</td><td class="num">100%</td></tr><tr><td>所得税(復興特別所得税を含む)</td><td class="num">${man(t.tax)}</td><td class="num">${pct(t.tax / t.income)}</td></tr>
      <tr><td>住民税</td><td class="num">${man(t.resident)}</td><td class="num">${pct(t.resident / t.income)}</td></tr><tr><td>社会保険料(本人の負担分)</td><td class="num">${man(t.social)}</td><td class="num">${pct(t.social / t.income)}</td></tr>
      <tr><td><b>手取り</b></td><td class="num"><b>${man(t.net)}</b></td><td class="num"><b>${pct(t.net / t.income)}</b></td></tr></table></div>` : ""; };
  a.oninput = a.onchange = one;
  a.addEventListener("lab:open", () => { one(); const rows = burdenTable(getPersonas());
    a.querySelector("#th-out").innerHTML = `<div class="card"><h2>年収ごとの負担(働いている人)</h2>
      <div class="table-scroll"><table class="verify"><tr><th>年収</th><th class="num">人数</th><th class="num">税</th><th class="num">社会保険料</th><th class="num">合計</th><th class="num">実績:所得税</th><th class="num">実績:社会保険料</th></tr>${rows.map((r) => { const f = ntaAt(r.income); return `<tr><td>${r.label}</td><td class="num">${people(r.people)}</td><td class="num">${pct(r.tax)}<small>うち所得税 ${pct(r.incomeTax)}</small></td><td class="num">${pct(r.social)}</td><td class="num"><b>${pct(r.total)}</b></td><td class="num">${pct(f.tax)}</td><td class="num">${pct(f.social)}</td></tr>`; }).join("")}</table></div>
      <p class="note">右の2列は、国税庁「民間給与実態統計調査」令和7年分の実績です(同じ年収の給与所得者の、所得税と社会保険料の年収に対する割合。住民税は含みません)。この計算は自営業の人なども含み、税率表は令和8年分(基礎控除が引き上げられた後)なので、所得税は実績より少し低く出ます。<br>国全体の負担(国民負担率)は、${NB.year}年度の見通しで${NB.total}%(税${NB.tax}%+社会保障${NB.social}%。国民所得に対する割合で、会社が払う分や消費税なども含む。財務省)です。</p></div>`; });

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
