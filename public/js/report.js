// 用途(読み手)に合わせたレポートを組み立てる。
// 骨組みは共通の6章で、読み手によって「最初に見せる指標」と「基準にするシナリオ」を変える。
import { CATEGORY_LABEL } from "./constants.js";
import { marketSize } from "./market.js";
import { DIFFUSION_ASSUMPTIONS } from "./diffusion.js";

export const PURPOSES = {
  planning: {
    label: "新商品の企画検討", reader: "企画・開発の担当者", scenario: "mid",
    focus: "誰に・いくらで売ると反応が良いか。価格と対象を変えたときの差を見ます。",
  },
  internal: {
    label: "社内向けの説明", reader: "経営層・社内の決裁者", scenario: "mid",
    focus: "利益と成長性。いつ黒字になり、3年でどこまで伸びるかを見ます。",
  },
  bank: {
    label: "金融機関向けの資料", reader: "銀行・信用金庫などの融資担当者", scenario: "low",
    focus: "返済能力。うまくいかなかった場合(下位10%)でも返済できるかを見ます。",
  },
  investor: {
    label: "出資者・投資家向けの資料", reader: "出資者・投資家", scenario: "mid",
    focus: "市場の大きさと伸びしろ、1人の顧客から得られる利益と獲得費用のつり合いを見ます。",
  },
};
const SCENARIO_LABEL = { low: "慎重(下位10%)", mid: "標準(中央値)", high: "好調(上位10%)" };

const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);

// 元利均等返済の毎月の返済額
export function monthlyPayment(principal, annualRatePct, years) {
  const n = Math.max(1, Math.round(years * 12)), r = annualRatePct / 100 / 12;
  return r === 0 ? principal / n : (principal * r) / (1 - (1 + r) ** -n);
}

// レポートに使う数字をまとめて計算する
export function reportMetrics({ personas, product, plan, spread, loan }) {
  const market = marketSize(personas, product);
  const all = marketSize(personas, { ...product, target: {} });
  const S = spread.series, months = S.length, last = S[months - 1];
  const years = [];
  for (let y = 0; y * 12 < months; y++) {
    const part = S.slice(y * 12, y * 12 + 12);
    const row = { year: y + 1, months: part.length };
    for (const k of ["low", "mid", "high"]) {
      row[k] = { revenue: sum(part, (r) => r.revenue[k]), profit: sum(part, (r) => r.profit[k]), users: part[part.length - 1].users[k] };
    }
    years.push(row);
  }
  const breakEven = (k) => S.find((r) => r.cumProfit[k] > 0)?.month ?? null;
  const trough = (k) => Math.min(0, ...S.map((r) => r.cumProfit[k])); // 累計利益の最も深い谷=必要な運転資金の目安

  // 顧客1人あたりの採算
  const arpu = (product.price * product.perYear) / 12;
  const margin = arpu * (1 - plan.costRate);
  const lifeMonths = plan.churn > 0 ? 1 / plan.churn : months;
  const ltv = margin * Math.min(lifeMonths, 120);
  const adTotal = (plan.ad.tv + plan.ad.net + plan.ad.store) * months;
  const cac = last.everBought.mid > 0 ? adTotal / last.everBought.mid : null;

  // 価格を変えたときの差(統計モード)
  const priceTable = [0.7, 0.85, 1, 1.15, 1.3].map((m) => {
    const price = Math.round(product.price * m);
    const r = marketSize(personas, { ...product, price });
    return { price, buyers: r.potentialBuyers, revenue: r.potentialRevenue };
  });
  const segments = market.breakdown
    .filter((r) => r.people > 0)
    .map((r) => ({ label: r.label, rate: (r.male + r.female) / r.people, buyers: r.male + r.female }))
    .sort((a, b) => b.buyers - a.buyers);

  // 返済
  let debt = null;
  if (loan?.amount > 0) {
    const pay = monthlyPayment(loan.amount, loan.rate, loan.years);
    const grace = loan.grace ?? 0; // 据置期間(月)。この間は利息のみ
    const interestOnly = (loan.amount * loan.rate) / 100 / 12;
    const service = (m) => (m <= grace ? interestOnly : m <= grace + loan.years * 12 ? pay : 0);
    const dscr = years.map((y) => {
      const due = sum(S.slice((y.year - 1) * 12, y.year * 12), (r) => service(r.month));
      return { year: y.year, due, low: due ? y.low.profit / due : null, mid: due ? y.mid.profit / due : null };
    });
    // 借入金を入れた手元資金の推移(慎重シナリオ)
    let cash = loan.amount, minCash = cash, shortMonth = null;
    for (const r of S) {
      cash += r.profit.low - service(r.month);
      if (cash < minCash) minCash = cash;
      if (cash < 0 && shortMonth == null) shortMonth = r.month;
    }
    debt = { pay, grace, dscr, minCash, shortMonth, endCash: cash };
  }
  return {
    market, tam: all.categorySpend, sam: market.categorySpend, som: last.revenue.mid * 12, somHigh: last.revenue.high * 12,
    years, last, months, breakEven: { low: breakEven("low"), mid: breakEven("mid"), high: breakEven("high") },
    trough: { low: trough("low"), mid: trough("mid") }, unit: { arpu, margin, lifeMonths, ltv, cac, ratio: cac ? ltv / cac : null },
    priceTable, segments, debt, adTotal,
  };
}

export function buildReport({ purpose, product, plan, spread, loan, personas, ai, topic, year, fmt }) {
  const P = PURPOSES[purpose] ?? PURPOSES.planning;
  const M = reportMetrics({ personas, product, plan, spread, loan });
  const { fmtYen, fmtPeople, pct, num, esc } = fmt;
  const k = P.scenario;
  const li = (items) => `<ul>${items.filter(Boolean).map((x) => `<li>${x}</li>`).join("")}</ul>`;
  const isNum = (c) => /^[-−\d―]/.test(String(c));
  const table = (head, rows) => `<div class="table-scroll"><table><tr>${head.map((h, i) => `<th class="${i && rows[0] && isNum(rows[0][i]) ? "num" : ""}">${h}</th>`).join("")}</tr>${
    rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i && isNum(c) ? "num" : ""}">${c}</td>`).join("")}</tr>`).join("")}</table></div>`;
  const be = (m) => (m ? `${m}か月目` : "期間内に届かず");
  const y3 = M.years[Math.min(2, M.years.length - 1)];
  const U = M.unit;

  // ---- 読み手が最初に見る数字 ----
  const head = {
    planning: [
      ["対象人口", fmtPeople(M.market.targetPeople)],
      ["購入見込み(全員が知った場合)", `${fmtPeople(M.market.potentialBuyers)}(${pct(M.market.potentialBuyers / Math.max(M.market.targetPeople, 1))})`],
      ["最も買い手が多い年代", M.segments[0] ? `${M.segments[0].label}(購入率 ${pct(M.segments[0].rate)})` : "―"],
      [`${M.months}か月後の利用者`, fmtPeople(M.last.users.mid)],
    ],
    internal: [
      [`${y3.year}年目の売上`, fmtYen(y3.mid.revenue)], [`${y3.year}年目の利益`, fmtYen(y3.mid.profit)],
      ["黒字化(累計)", be(M.breakEven.mid)], ["先行して必要な資金", fmtYen(-M.trough.mid)],
    ],
    bank: [
      ["毎月の返済額", M.debt ? fmtYen(M.debt.pay) : "借入条件を入力"],
      ["返済余力(慎重・2年目)", M.debt?.dscr[1]?.low != null ? `${num(M.debt.dscr[1].low, 2)}倍` : "―"],
      ["手元資金の最低額(慎重)", M.debt ? fmtYen(M.debt.minCash) : "―"],
      ["黒字化(慎重)", be(M.breakEven.low)],
    ],
    investor: [
      ["狙える市場(対象者の費目支出)", fmtYen(M.sam)], [`${M.months}か月後の年換算売上`, `${fmtYen(M.som)}(好調時 ${fmtYen(M.somHigh)})`],
      ["顧客1人の生涯粗利 ÷ 獲得費用", U.ratio ? `${num(U.ratio, 1)}倍` : "―"], ["獲得費用の回収", U.cac ? `${num(U.cac / Math.max(U.margin, 1), 1)}か月` : "―"],
    ],
  }[purpose];

  // ---- 各章 ----
  const s1 = `<p>${esc(topic || `${product.name}を、${product.target.ageMin}〜${product.target.ageMax}歳に、1回${num(product.price)}円・年${num(product.perYear, 1)}回の想定で提供する。`)}</p>
    ${li([`商品名:${esc(product.name)}`, `価格:1回 ${num(product.price)}円 × 年${num(product.perYear, 1)}回(1人あたり年 ${fmtYen(product.price * product.perYear)})`,
      `対象:${product.target.ageMin}〜${product.target.ageMax}歳、${{ all: "男女", male: "男性", female: "女性" }[product.target.sex]}${product.target.onlineOnly ? "、ネット利用者のみ" : ""}`,
      `想定する年:${year}年の人口`])}`;

  const s2 = `${table(["区分", "金額・人数", "意味"], [
      ["全体の市場", fmtYen(M.tam), `日本の全員が「${CATEGORY_LABEL[product.category]}」に使う年間総額`],
      ["狙える市場", fmtYen(M.sam), "対象者が同じ費目に使う年間総額"],
      ["獲得の見込み", fmtYen(M.som), `${M.months}か月後の月間売上(標準)を年換算`],
      ["対象人口", fmtPeople(M.market.targetPeople), `総人口の${pct(M.market.targetPeople / M.market.population)}`],
    ])}
    <h4>年代別の購入見込み</h4>${table(["年代", "購入見込み", "購入率"], M.segments.map((s) => [s.label, fmtPeople(s.buyers), pct(s.rate)]))}
    ${ai?.report ? `<h4>AIインタビューで反応が良かった層</h4>${li(ai.report.promising_segments.map(esc))}<h4>ためらう理由</h4>${li(ai.report.barriers.map(esc))}` : ""}`;

  const s3 = `${table(["項目", "値", "計算"], [
      ["顧客1人の月間売上", fmtYen(U.arpu), "価格 × 年間回数 ÷ 12"],
      ["顧客1人の月間粗利", fmtYen(U.margin), `原価率 ${pct(plan.costRate, 0)}`],
      ["平均の継続期間", `${num(U.lifeMonths, 1)}か月`, `解約率 ${pct(plan.churn)}/月`],
      ["顧客1人の生涯粗利", fmtYen(U.ltv), "月間粗利 × 継続期間"],
      ["顧客1人の獲得費用", U.cac ? fmtYen(U.cac) : "―", "広告費の累計 ÷ 一度でも買った人数"],
      ["生涯粗利 ÷ 獲得費用", U.ratio ? `${num(U.ratio, 1)}倍` : "―", "1倍を下回ると、売るほど赤字"],
    ])}
    <p class="note">注意:このモデルでは口コミで増えた利用者に費用がかからないため、獲得費用は実際より小さく、倍率は大きく出やすくなります。<br>実際の広告の実績(1人獲得あたりの費用)が分かれば、そちらを優先してください。</p>
    <h4>価格を変えたときの差(全員が商品を知った場合)</h4>${table(["価格", "購入見込み", "年間売上の上限"], M.priceTable.map((r) => [`${num(r.price)}円${r.price === product.price ? "(現在)" : ""}`, fmtPeople(r.buyers), fmtYen(r.revenue)]))}
    ${li([`販売・告知:テレビ ${fmtYen(plan.ad.tv)}/月、ネット・SNS ${fmtYen(plan.ad.net)}/月、店頭ほか ${fmtYen(plan.ad.store)}/月`])}`;

  const scen = purpose === "bank" ? ["low", "mid"] : purpose === "investor" ? ["mid", "high", "low"] : ["mid", "low", "high"];
  const s4 = `<p class="note">基準にするシナリオ:<b>${SCENARIO_LABEL[k]}</b>。${spread.runs}回の試行から、下位10%・中央値・上位10%を取り出しています。</p>
    ${scen.map((sc) => `<h4>${SCENARIO_LABEL[sc]}</h4>${table(["年", "年末の利用者", "売上", "利益"], M.years.map((y) => [`${y.year}年目${y.months < 12 ? `(${y.months}か月)` : ""}`, fmtPeople(y[sc].users), fmtYen(y[sc].revenue), fmtYen(y[sc].profit)]))}`).join("")}
    ${li([`黒字化(累計の利益がプラスになる時期):標準 ${be(M.breakEven.mid)}/慎重 ${be(M.breakEven.low)}`, `${M.months}か月後の認知率:${pct(M.last.awareRate.mid)}`])}`;

  const debtHtml = M.debt ? `<h4>借入と返済(慎重シナリオで確認)</h4>
    ${li([`借入額 ${fmtYen(loan.amount)}、年利 ${num(loan.rate, 2)}%、返済 ${num(loan.years)}年(元利均等)${loan.grace ? `、据置 ${loan.grace}か月` : ""}`,
      `毎月の返済額:${fmtYen(M.debt.pay)}`,
      `借入金を入れた手元資金の最低額:<b>${fmtYen(M.debt.minCash)}</b>${M.debt.shortMonth ? `(<b>${M.debt.shortMonth}か月目に資金が不足</b>)` : "(期間を通じて不足なし)"}`])}
    ${table(["年", "返済額(年)", "返済余力・慎重", "返済余力・標準"], M.debt.dscr.map((d) => [`${d.year}年目`, fmtYen(d.due), d.low == null ? "―" : `${num(d.low, 2)}倍`, d.mid == null ? "―" : `${num(d.mid, 2)}倍`]))}
    <p class="note">返済余力 = その年の利益 ÷ その年の返済額。1倍を下回る年は、利益だけでは返済をまかなえません。</p>` : `<p class="note">借入額を入力すると、返済計画と返済余力を表示します。</p>`;
  const s5 = `${li([`広告費:月 ${fmtYen(plan.ad.tv + plan.ad.net + plan.ad.store)}(${M.months}か月で ${fmtYen(M.adTotal)})`, `固定費:月 ${fmtYen(plan.fixedCost)}`, `原価率:${pct(plan.costRate, 0)}`,
      `先行して必要な資金(累計利益の最も深い谷):標準 ${fmtYen(-M.trough.mid)}/慎重 ${fmtYen(-M.trough.low)}`, `損益分岐:標準 ${be(M.breakEven.mid)}/慎重 ${be(M.breakEven.low)}`])}
    <p class="note">開発費や設備などの初期投資は含んでいません。別に見積もって加えてください。</p>${purpose === "bank" || M.debt ? debtHtml : ""}`;

  const E = DIFFUSION_ASSUMPTIONS.events.value;
  const s6 = `${table(["想定される障害", "影響(モデル上の想定)", "対策の方向"], [
      [E.rival.label, E.rival.note, "先に利用者を増やす。乗り換えにくい仕組み(定期・会員)を用意する"],
      [E.slump.label, E.slump.note, "固定費を抑え、広告費を月ごとに増減できる契約にする"],
      [E.trouble.label, E.trouble.note, "品質管理と問い合わせ対応の体制を発売前に整える"],
      ["認知が広がらない", `${M.months}か月後の認知率は標準で${pct(M.last.awareRate.mid)}`, "広告の配分を、対象年代に届きやすい媒体へ寄せる"],
      ["価格が合わない", `現在の価格での購入率は対象の${pct(M.market.potentialBuyers / Math.max(M.market.targetPeople, 1))}`, "上の価格別の表で、売上が最大になる価格帯を確かめる"],
    ])}
    ${ai?.report ? `<h4>AIインタビューから見た、結果を疑うべき点</h4>${li(ai.report.counterpoints.map(esc))}` : ""}
    <h4>この試算の前提と限界</h4>${li([
      "数字は、公的統計から作った仮想の生活者によるシミュレーションの結果で、実績や実際の調査結果ではありません。",
      ai ? "購入率には、AIインタビューの結果(年代・性別ごとの購入率)を反映しています。" : "購入率は、価格と家計支出のつり合いから計算した統計モードの値です。実際の顧客の声(アンケート、試験販売)で裏づけてください。",
      "普及の速さは、過去の商品の平均的な係数を使っています。",
      "提出用の資料にする際は、実績の数字(既存の売上、試験販売、予約数など)に置き換えられる部分を置き換えてください。",
    ])}`;

  const titles = ["事業概要", "市場・競合分析", "ビジネスモデルと提供方法", "目標と実行プラン", "資金計画と収支シミュレーション", "リスクと解決策"];
  const body = [s1, s2, s3, s4, s5, s6];
  return `<div class="report doc">
    <p class="doc-kind">${P.label}(読み手:${P.reader})</p>
    <h2 class="doc-title">${esc(product.name)} 市場シミュレーション報告</h2>
    <p class="note">${P.focus}</p>
    <div class="kpis">${head.map(([l, v]) => `<div class="kpi"><small>${l}</small><b>${v}</b></div>`).join("")}</div>
    ${ai?.report ? `<p class="headline">${esc(ai.report.headline)}</p>` : ""}
    ${titles.map((t, i) => `<h3>${i + 1}. ${t}</h3>${body[i]}`).join("")}
    <p class="note">競合他社の個別の売上や動向は、このツールには入っていません。競合分析は別途、公開資料などで補ってください。</p>
  </div>`;
}
