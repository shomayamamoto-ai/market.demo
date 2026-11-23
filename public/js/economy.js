// 物価と賃金のシミュレーター:物の値段と給料のルールが、消費・雇用・生産力をどう変えるかを試す。
// 住民は「給料で買える個数」が自分の安心ラインを下回ると節約を始める、という仮定で動く。
import { makeRng, clamp } from "./rng.js";
import { thin } from "./stage3d.js";

export const ECONOMY_ASSUMPTIONS = {
  comfort: { value: "1.2〜1.85個", note: "安心ライン。給料で買える個数がこれを下回ると、嗜好品を買わずに貯める(住民ごとに違う)" },
  jobless: { value: 0.61, note: "仕事を失った人が、蓄えを崩して買う個数(1世代あたり)" },
  adjust: { value: 0.187, note: "売上の変化に対して、工場が雇う人数を合わせる速さ(1世代あたり)" },
  growth: { value: 0.006, note: "失業がほぼ無いときの人口の伸び(1世代あたり)" },
  spenders: { value: 0.146, note: "1回きりの給付金を使う人の割合。残りは将来の増税に備えて貯める" },
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
    reform: { label: "D Bの後に、生産性向上と自動の賃上げ", rules: { price: 2, wage: 1, collapsed: true, reform: true }, years: 100 },
  },
  charts: [{ title: "生産力・失業率・人口", lines: [{ key: "productivity", name: "生産力", color: "#2f8f6b" }, { key: "unemployment", name: "失業率", color: "#b4473b" }, { key: "saving", name: "貯め込む人", color: "#c9a45c" }, { key: "population", name: "人口", color: "#8b93a7" }] }],
  initial: "frozen",
  metrics: [
    { key: "productivity", label: "生産力", fmt: "pct", sub: "最初を100%として" },
    { key: "unemployment", label: "失業率", fmt: "pct1" },
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
  advise(m, rules) {
    const out = [];
    if (m.unemployment > 0.3) out.push("1人ずつが節約するのは合理的ですが、全員が同時に節約すると売上が落ち、雇用が減り、さらに節約が広がります(節約のパラドックス)。");
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
    const price = rules.price;
    let wage = 2 * rules.wage, q = 2, pop = 1, e = 1, hoard = 0, peak = 0;
    const demandOf = (emp, extra = 0) => {
      const real = wage / price; // 給料で買える個数
      const calm = clamp((real - 1.2) / 0.65, 0, 1); // 安心ラインを超えている人の割合
      const buy = calm * Math.min(real, 3) + (1 - calm) * Math.min(real, 1);
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
      let extra = 0;
      if (rules.handout && t >= 1 && t <= A.spendYears.value) extra += (A.spenders.value * rules.handout) / price / A.spendYears.value;
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
    return { series, summary: { productivity: last.productivity, unemployment: last.unemployment, peakUnemployment: peak, population: last.population, apples: last.apples } };
  },
};
