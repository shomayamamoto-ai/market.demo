// 物価と賃金のシミュレーター:物の値段と給料のルールが、消費・雇用・生産力をどう変えるかを試す。
// 住民は「給料で買える個数」が自分の安心ラインを下回ると節約を始める、という仮定で動く。
import { makeRng, clamp } from "./rng.js";
import { thin } from "./stage3d.js";

// 日本の実績(前年比、%)。物価:消費者物価指数(総合)、賃金:毎月勤労統計の名目賃金(現金給与総額)。2016〜2025年
export const JAPAN_PATH = { from: 2015, cpi: [-0.1, 0.5, 1.0, 0.5, 0.0, -0.2, 2.5, 3.2, 2.7, 3.2], wage: [0.6, 0.4, 1.4, -0.4, -1.2, 0.3, 2.0, 1.2, 2.8, 2.3], unemployment: { 2015: 0.0335, 2025: 0.0251 } };
export const ECONOMY_ASSUMPTIONS = {
  comfort: { value: "1.2〜1.85個", note: "安心ライン。給料で買える個数がこれを下回ると、嗜好品を買わずに貯める(住民ごとに違う)" },
  buffer: { value: 0.05, note: "安心ラインを超えている人が、買える量の目減りを蓄えで補う上限(ふだんの消費に対する割合)。日本では2015〜2025年に給料で買える量が約4%減ったが失業率は上がらなかった(3.4%→2.5%)。この実績に合うように置いた値。蓄えが尽きることは入れていないので、長く続く目減りには当てはまらない" },
  jobless: { value: 0.61, note: "仕事を失った人が、蓄えを崩して買う個数(1世代あたり)" },
  adjust: { value: 0.187, note: "売上の変化に対して、工場が雇う人数を合わせる速さ(1世代あたり)" },
  growth: { value: 0.006, note: "失業がほぼ無いときの人口の伸び(1世代あたり)" },
  spenders: { value: 0.146, note: "1回きりの給付金を使う人の割合。残りは将来の増税に備えて貯める。参考にした実験に合わせた値。条件C2・C3では実績値に置き換える:2009年の定額給付金は29.0%(内閣府 2010「定額給付金に関連した消費等に関する調査」)、2020年の特別定額給付金は約10%(家計調査の都市別データによる推計、Hattori, Komura & Unayama)" },
  spendYears: { value: 5, note: "給付金を使う人が、使い切るまでの世代数" },
  reformOutput: { value: 3, note: "構造改革後に、1人が1世代に作れる個数(改革前は2個)" },
  dig: { value: 0.4, note: "給料が安心ラインを超えたとき、貯め込んだ分から上乗せして買う個数(1世代あたり)" },
};

export const economy = {
  key: "economy", title: "物価と賃金", years: 30,
  lead: "物の値段と給料のルールを変えると、消費・雇用・生産力がどう動くかを試します。",
  note: "住民1,000人の村。働いて得たコインで、生活必需品と嗜好品を1個ずつ買うのが基準です。1世代ごとに進みます。",
  assumptions: ECONOMY_ASSUMPTIONS,
  presets: {
    both: { label: "A 物価も給料も2倍", rules: { price: 2, wage: 2 } },
    frozen: { label: "B 物価だけ2倍(給料は据え置き)", rules: { price: 2, wage: 1 } },
    handout: { label: "C Bの後に、1回きりの給付金", rules: { price: 2, wage: 1, collapsed: true, handout: 4 } },
    handout09: { label: "C2 給付金:2009年の実績(29%が消費に)", rules: { price: 2, wage: 1, collapsed: true, handout: 4, spendShare: 0.29 } },
    handout20: { label: "C3 給付金:2020年の実績(約10%が消費に)", rules: { price: 2, wage: 1, collapsed: true, handout: 4, spendShare: 0.10 } },
    japan: { label: "J 日本の実績(2015→2025年の物価と賃金)", rules: { price: 1, wage: 1, japan: "actual" }, years: 10 },
    japanRaw: { label: "J2 同じ実績を、蓄えで補う仕組みなしで計算", rules: { price: 1, wage: 1, japan: "actual", noBuffer: true }, years: 10 },
    japanKeep: { label: "J3 賃金が物価と同じだけ上がっていたら", rules: { price: 1, wage: 1, japan: "keep" }, years: 10 },
    reform: { label: "D Bの後に、生産性向上と自動の賃上げ", rules: { price: 2, wage: 1, collapsed: true, reform: true }, years: 100 },
  },
  charts: [{ title: "生産力・失業率・人口", lines: [{ key: "productivity", name: "生産力", color: "#2f8f6b" }, { key: "unemployment", name: "失業率", color: "#b4473b" }, { key: "saving", name: "貯め込む人", color: "#c9a45c" }, { key: "population", name: "人口", color: "#8b93a7" }] }],
  initial: "frozen",
  params: [{ key: "price", label: "物価(最初の何倍か)", value: 2, min: 1, max: 4, step: 0.5 }, { key: "wage", label: "給料(最初の何倍か)", value: 1, min: 0.5, max: 4, step: 0.5 }],
  metrics: [
    { key: "productivity", label: "生産力", fmt: "pct", sub: "最初を100%として" },
    { key: "topProductivity", label: "最初の10世代での生産力の最大", fmt: "pct", sub: "給付金などの一時的な効果を見る" },
    { key: "unemployment", label: "失業率", fmt: "pct1" },
    { key: "real", label: "給料で買える量", fmt: "pct1", sub: "最初を100%として" },
    { key: "peakUnemployment", label: "失業率の最大", fmt: "pct1" },
    { key: "population", label: "人口", fmt: "people1000" },
    { key: "apples", label: "1人が買う個数", fmt: "num2" },
  ],
  reference: {
    both: { productivity: 1.216, unemployment: 0, population: 1.216 },
    frozen: { productivity: 0.379, unemployment: 0.621 },
    handout: { productivity: 0.38 },
    reform: { productivity: 2.364, unemployment: 0, peakUnemployment: 0.736, apples: 2.99 },
  },
  verify(m, rules) {
    if (rules.japan === "actual" && !rules.noBuffer) { const u = JAPAN_PATH.unemployment; return [
      { label: "給料で買える量(2015年=100%)", model: m.real, theory: JAPAN_PATH.wage.reduce((a, x, i) => a * (1 + x / 100) / (1 + JAPAN_PATH.cpi[i] / 100), 1), fmt: "pct1", note: "名目賃金と消費者物価(総合)の前年比を10年分つなげた値。実績をそのまま入れているので一致する" },
      { label: "失業率の変化(10年間)", model: m.unemployment, theory: u[2025] - u[2015], theoryText: `${((u[2025] - u[2015]) * 100).toFixed(1)}ポイント(${(u[2015] * 100).toFixed(1)}%→${(u[2025] * 100).toFixed(1)}%)`, range: [-0.02, 0.01], fmt: "pct1", note: "実績は労働力調査。このモデルは最初の失業率を0%としているため、「上がらなかった」ことだけを照合する" }]; }
    if (rules.reform || rules.handout || rules.japan) return [];
    // このモデルの行き着く先(定常状態)は、式で解ける:雇われる人の割合 e = (e×働く人が買う数 + (1−e)×失業者が買う数) ÷ 1人が作る数
    const A = ECONOMY_ASSUMPTIONS, real = (2 * rules.wage) / rules.price, calm = clamp((real - 1.2) / 0.65, 0, 1), buy = calm * Math.min(real, 3) + (1 - calm) * Math.min(real, 1), cu = A.jobless.value;
    const e = clamp(cu / (2 - buy + cu), 0, 1);
    return [{ label: "失業率(行き着く先)", model: m.unemployment, theory: buy >= 2 ? 0 : 1 - e, fmt: "pct1", note: "モデルの式を解いた値。30世代ではまだ近づいている途中のことがある" }];
  },
  advise(m, rules) {
    const out = [];
    if (m.unemployment > 0.3) out.push("1人ずつが節約するのは合理的ですが、全員が同時に節約すると売上が落ち、雇用が減り、さらに節約が広がります(節約のパラドックス)。");
    if (rules.japan === "actual" && !rules.noBuffer) out.push(`日本の実績を当てはめると、給料で買える量は10年で${((1 - m.real) * 100).toFixed(1)}%減りましたが、この程度の目減りは蓄えで補われ、失業は増えませんでした。実際の失業率も3.4%から2.5%に下がっています。`);
    if (rules.noBuffer) out.push(`蓄えで補う仕組みを外すと、同じ実績で失業率が${(m.unemployment * 100).toFixed(1)}%まで上がります。実際には上がっていないので、以前のモデルは小さな目減りに反応しすぎていました。`);
    if (rules.japan === "keep") out.push("賃金が物価と同じだけ上がっていれば、買える量は変わらず、雇用も変わりません。");
    if (rules.spendShare) out.push(`給付金のうち消費に回る割合を、日本の実績(${Math.round(rules.spendShare * 100)}%)に置き換えています。実績でも、給付金の7〜9割は貯蓄に回りました。`);
    if (rules.handout) out.push("1回きりの給付金は、将来の負担を見越して貯められやすく、生産力はほとんど戻りませんでした。続く収入の見通しが無いと、消費は増えにくくなります。");
    if (rules.reform) out.push("改革の直後は人手が余って失業が増えますが、給料が上がって安心ラインを超えると消費が戻り、拡大の循環に入ります。");
    if (!rules.collapsed && m.unemployment < 0.02 && m.productivity > 1) out.push("値段が上がっても、同じだけ給料が上がれば買える個数は変わらず、雇用と人口が伸びます。");
    return out;
  },
  frames(rules, seed, years) {
    const P = (v) => `${Math.round(v * 100)}%`;
    const frames = thin(this.run(rules, seed, years).series).map((s) => {
      const n = 1000 * s.population, jobless = n * s.unemployment, saver = n * s.saving;
      return { label: `${s.x}世代目`, caption: `${s.x}世代目:失業率 ${P(s.unemployment)}、生産力 ${P(s.productivity)}。1人が買う数は ${s.apples.toFixed(2)}個。`,
        gauges: [{ label: "生産力", text: P(s.productivity), value: s.productivity / 2.5, color: "#2f8f6b" }],
        zones: [{ name: "働いて、よく買う人", color: "#2f8f6b", count: Math.max(0, n - jobless - saver), build: "market" }, { name: "働いて、節約する人", color: "#c9a45c", count: saver, build: "house" }, { name: "仕事を失った人", color: "#b4473b", count: jobless, build: "houses" }] };
    });
    return { frames, opts: { sub: "色は暮らしぶり。", props: [{ kind: "factory", color: "#4f9a52", x: -0.45, z: 0.5, label: "生活必需品の工場" }, { kind: "factory", color: "#d2584c", x: 0.45, z: 0.5, label: "嗜好品の工場" }] } };
  },
  run(rules, seed, years) {
    const rng = makeRng(seed), A = ECONOMY_ASSUMPTIONS;
    let price = rules.price;
    const q0 = 2; // ふだん1人が買う量
    let wage = 2 * rules.wage, q = 2, pop = 1, e = 1, hoard = 0, peak = 0;
    const demandOf = (emp, extra = 0) => {
      const real = wage / price; // 給料で買える個数
      const calm = clamp((real - 1.2) / 0.65, 0, 1); // 安心ラインを超えている人の割合
      const topUp = rules.noBuffer ? 0 : Math.min(Math.max(0, q0 - real), A.buffer.value * q0); // 少しの目減りは蓄えで補う
      const buy = calm * Math.min(real + topUp, 3) + (1 - calm) * Math.min(real, 1);
      return { real, calm, perCapita: emp * buy + (1 - emp) * A.jobless.value + extra, buy };
    };
    // 「Bの後」から始める条件は、まず物価高で縮んだ状態まで進めておく
    if (rules.collapsed) for (let i = 0; i < 80; i++) e += A.adjust.value * (Math.min(1, demandOf(e).perCapita / q) - e);
    if (rules.collapsed) hoard = 12; // 縮んでいた間に貯め込まれた分
    const base0 = rules.collapsed ? null : 1;
    if (rules.reform) { const d = demandOf(e).perCapita; q = A.reformOutput.value; wage = price * q; e = Math.min(e, d / q); } // 生産性が上がり、売上は自動で給料に回る
    const series = [];
    let last = null;
    for (let t = 0; t <= years; t++) {
      if (rules.japan && t >= 1 && t <= JAPAN_PATH.cpi.length) { price *= 1 + JAPAN_PATH.cpi[t - 1] / 100; wage *= 1 + (rules.japan === "keep" ? JAPAN_PATH.cpi[t - 1] : JAPAN_PATH.wage[t - 1]) / 100; }
      let extra = 0;
      if (rules.handout && t >= 1 && t <= A.spendYears.value) extra += ((rules.spendShare ?? A.spenders.value) * rules.handout) / price / A.spendYears.value;
      const d0 = demandOf(e);
      if (rules.reform && d0.calm > 0.99 && hoard > 0 && e < 0.995) { extra += A.dig.value; hoard -= A.dig.value; }
      const d = demandOf(e, extra);
      const noise = 1 + (rng.next() - 0.5) * 0.01;
      const productivity = (d.perCapita * pop * noise) / 2;
      peak = Math.max(peak, 1 - e);
      last = { x: t, productivity, unemployment: 1 - e, saving: (1 - d.calm) * e + (rules.handout && t <= A.spendYears.value ? 0 : 0), population: pop, apples: d.perCapita };
      series.push(last);
      e += (rules.reform ? 0.3 : A.adjust.value) * (Math.min(1, d.perCapita / q) - e);
      e = clamp(e, 0, 1);
      if (1 - e < 0.01) pop *= 1 + A.growth.value;
    }
    void base0;
    return { series, summary: { productivity: last.productivity, unemployment: last.unemployment, peakUnemployment: peak, population: last.population, apples: last.apples, real: wage / price / q0, topProductivity: Math.max(...series.slice(1, 11).map((x) => x.productivity)) } };
  },
};
