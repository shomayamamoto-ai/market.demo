// 工場と工房のシミュレーター:大量生産の工場と、少量生産の工房が、同じ町で60年競う。
// 管理会計の「固定費と変動費」と「品質コスト(予防・評価・内部の失敗・外部の失敗)」の考え方で、どちらが残るかを試す。
import { makeRng, clamp } from "./rng.js";
import { thin } from "./stage3d.js";

export const MAKER_ASSUMPTIONS = {
  firms: { value: { factory: 12, workshop: 12 }, note: "工場と工房の数。仮定" },
  market: { value: 10500, note: "町全体で1年に売れる数(最初の年)。景気で±12%ほど動く。仮定" },
  factory: { value: { price: 10, variable: 4.2, fixed: 3000, capacity: 720 }, note: "工場:売値、1個あたりの変動費、1年の固定費、作れる数の上限。固定費が重く、たくさん売らないと利益が出ない。仮定" },
  workshop: { value: { price: 14, variable: 10.9, fixed: 520, capacity: 250, defect: 0.01 }, note: "工房:売値、変動費、固定費、作れる数の上限、不良品率。固定費が軽く、少ない数でも利益が出る。仮定" },
  spread: { value: 0.06, note: "会社ごとの固定費のばらつき(±この割合)。同じ種類の会社でも、体力に差がある。仮定" },
  prevention: { value: 100, note: "予防の費用。不良品率を12%からd%に下げるのに、1年あたり この係数 × (log(12 ÷ d))^1.6 がかかる。ゼロに近づけるほど急に高くなる。仮定" },
  appraisal: { value: 0.3, note: "評価(検査)で、出荷前に見つかる不良品の割合。見つけた分は作り直す(内部の失敗:変動費がもう1個分かかる)。仮定" },
  external: { value: 13, note: "外部の失敗。客に届いた不良品1個あたりの返品・修理の費用。仮定" },
  reputation: { value: { hit: 3.6, recover: 0.12 }, note: "評判。客に届いた不良品の割合 × hit だけ評判が下がり、毎年 recover の割合で元に戻る。評判が下がると、客が離れる。仮定" },
  choice: { value: 2.2, note: "客の選び方。評判の この乗数 ÷ 売値 に比例して選ばれる。仮定" },
  bankrupt: { value: -1500, note: "累計の利益がこの額を下回ると、つぶれる。仮定" },
  calibration: { value: "参考にした実験の値に合わせて調整", note: "品質対策なしの工場の平均利益3,800・11社倒産、工房12,800、不良品率1.8%の工場14,900に近づくよう係数を決めた。実際の企業の数字ではない" },
};

export const maker = {
  key: "maker", title: "工場と工房", years: 60, xLabel: "年", runs: 30, initial: "none",
  lead: "安くたくさん作る工場と、少しずつ丁寧に作る工房。品質にいくらかけるか、市場が伸びるか縮むかで、どちらが残るかを試します。",
  note: "工場は固定費が重く変動費が安いので、たくさん売らないと利益が出ません。工房はその逆です。<br>不良品は、出荷前に見つかれば作り直し、客に届くと返品・修理の費用と評判の低下を招きます。",
  assumptions: MAKER_ASSUMPTIONS,
  presets: {
    none: { label: "A 工場が品質にお金をかけない(不良品率12%)", rules: { defect: 12, growth: 0, harm: 1 } },
    good: { label: "B 工場が予防に投資(不良品率1.8%)", rules: { defect: 1.8, growth: 0, harm: 1 } },
    over: { label: "C 工場が品質にかけすぎる(不良品率0.1%)", rules: { defect: 0.1, growth: 0, harm: 1 } },
    grow: { label: "D 伸びる市場(毎年+2%)、不良品率1.8%", rules: { defect: 1.8, growth: 2, harm: 1 } },
    shrink: { label: "E 縮む市場(毎年−2%)、不良品率1.8%", rules: { defect: 1.8, growth: -2, harm: 1 } },
    harsh: { label: "F 外部の失敗の損害が大きい世の中、不良品率1.8%", rules: { defect: 1.8, growth: 0, harm: 3 } },
  },
  params: [{ key: "defect", label: "工場の不良品率(%)", value: 12, min: 0.05, max: 12, step: 0.1 }, { key: "growth", label: "市場の伸び(年%)", value: 0, min: -5, max: 5, step: 0.5 }, { key: "harm", label: "外部の失敗の損害(倍)", value: 1, min: 0.2, max: 5, step: 0.2 }],
  charts: [{ title: "1社あたりの累計の利益", fmt: "num0", lines: [{ key: "factory", name: "工場", color: "#b4473b" }, { key: "workshop", name: "工房", color: "#2f8f6b" }] }, { title: "残っている会社の数", fmt: "num0", lines: [{ key: "nFactory", name: "工場", color: "#b4473b" }, { key: "nWorkshop", name: "工房", color: "#2f8f6b" }] }],
  metrics: [{ key: "factory", label: "工場の平均利益", fmt: "num0", sub: "60年の累計、つぶれた会社も含む" }, { key: "workshop", label: "工房の平均利益", fmt: "num0", sub: "60年の累計" },
    { key: "bustFactory", label: "つぶれた工場", fmt: "num1", sub: "12社のうち" }, { key: "bustWorkshop", label: "つぶれた工房", fmt: "num1", sub: "12社のうち" },
    { key: "quality", label: "工場が品質にかけた費用", fmt: "num0", sub: "1社・1年あたり。予防+作り直し+返品修理" }, { key: "repute", label: "工場の評判", fmt: "pct", sub: "最後の年。100%が満点" }],
  reference: { none: { workshop: 12800, bustFactory: 11 }, good: { factory: 14900 } },
  advise(m, r) {
    const out = [];
    if (m.factory > m.workshop) out.push(`工場の平均利益は${Math.round(m.factory).toLocaleString("ja-JP")}で、工房(${Math.round(m.workshop).toLocaleString("ja-JP")})を上回りました。`);
    else out.push(`工房の平均利益は${Math.round(m.workshop).toLocaleString("ja-JP")}で、工場(${Math.round(m.factory).toLocaleString("ja-JP")})を上回りました。工場は12社のうち${m.bustFactory.toFixed(1)}社がつぶれています。`);
    if (r.defect >= 8) out.push("品質にお金をかけない工場は、目に見える費用は少なくても、返品・修理と評判の低下(外部の失敗)で客を失います。固定費が重いので、売れる数が減るとすぐ赤字になります。");
    if (r.defect <= 0.3) out.push("不良品をゼロに近づけるほど、予防の費用は急に高くなります。減らせる失敗の費用より、かける費用のほうが大きくなる点があります。");
    if (r.growth > 0) out.push("市場が伸びるときは、固定費を多くの数で割れる工場が有利です。");
    if (r.growth < 0) out.push("市場が縮むときは、売れる数が減っても固定費が減らない工場が苦しくなり、固定費の軽い工房が残りやすくなります。");
    if (r.harm > 1.5) out.push("不良品1個の損害が大きい世の中(安全や信用に関わる商品)では、数を多く出す工場ほど不利になります。");
    out.push("品質の費用は「かけるほど良い」でも「削るほど得」でもなく、予防にかける額と、失敗で失う額の合計がいちばん小さくなる点を探すものです。");
    return out;
  },
  run(r, seed, years) {
    const A = MAKER_ASSUMPTIONS, rng = makeRng(seed), d0 = 0.12, df = clamp(r.defect / 100, 0.0005, d0);
    const prevention = A.prevention.value * Math.log(d0 / df) ** 1.6;
    const mk = (kind, defect, prevent) => ({ kind, ...A[kind].value, fixed: A[kind].value.fixed * (1 + A.spread.value * (rng.next() * 2 - 1)), defect, prevent, rep: 1, cum: 0, alive: true, qual: 0 });
    const firms = [...Array.from({ length: A.firms.value.factory }, () => mk("factory", df, prevention)), ...Array.from({ length: A.firms.value.workshop }, () => mk("workshop", A.workshop.value.defect, 0))];
    const series = []; let cycle = 0, qualSum = 0;
    for (let t = 0; t <= years; t++) {
      cycle = 0.7 * cycle + 0.09 * rng.normal(); // 景気の波
      const demand = A.market.value * (1 + r.growth / 100) ** t * (1 + cycle);
      const alive = firms.filter((f) => f.alive), score = alive.map((f) => f.rep ** A.choice.value / f.price), total = score.reduce((a, b) => a + b, 0) || 1;
      // 客を割り振る。作れる数を超えた分は、ほかの会社へ回る
      let left = demand, open = alive.map((f, i) => ({ f, s: score[i], sold: 0 }));
      for (let pass = 0; pass < 4 && left > 1; pass++) { const sum = open.filter((o) => o.sold < o.f.capacity).reduce((a, o) => a + o.s, 0); if (!sum) break; let used = 0; for (const o of open) if (o.sold < o.f.capacity) { const want = (left * o.s) / sum, take = Math.min(o.f.capacity - o.sold, want * (pass ? o.f.rep : 1)); o.sold += take; used += pass ? want : take; } left -= used; } // 買えなかった客が回ってきても、評判が悪い会社からは買わずにあきらめる人がいる
      for (const { f, sold } of open) {
        const caught = sold * f.defect * A.appraisal.value, shipped = sold * f.defect * (1 - A.appraisal.value);
        const quality = f.prevent + caught * f.variable + shipped * A.external.value * r.harm; // 予防 + 内部の失敗 + 外部の失敗
        f.cum += sold * (f.price - f.variable) - f.fixed - quality; f.qual = quality;
        f.rep = clamp(f.rep + A.reputation.value.recover * (1 - f.rep) - A.reputation.value.hit * r.harm ** 0.5 * (sold ? shipped / sold : 0) * f.rep, 0.05, 1);
        if (f.cum < A.bankrupt.value) f.alive = false;
      }
      const avg = (kind) => { const g = firms.filter((f) => f.kind === kind); return g.reduce((a, f) => a + f.cum, 0) / g.length; }, n = (kind) => firms.filter((f) => f.kind === kind && f.alive).length;
      const fa = firms.filter((f) => f.kind === "factory" && f.alive); qualSum += fa.length ? fa.reduce((a, f) => a + f.qual, 0) / fa.length : 0;
      series.push({ x: t, factory: avg("factory"), workshop: avg("workshop"), nFactory: n("factory"), nWorkshop: n("workshop"), rep: fa.length ? fa.reduce((a, f) => a + f.rep, 0) / fa.length : 0 });
    }
    const z = series[years];
    return { series, summary: { factory: z.factory, workshop: z.workshop, bustFactory: A.firms.value.factory - z.nFactory, bustWorkshop: A.firms.value.workshop - z.nWorkshop, quality: qualSum / (years + 1), repute: z.rep } };
  },
  frames(r, seed, years) {
    const frames = thin(this.run(r, seed, years).series).map((s) => ({ label: `${s.x}年目`, caption: `${s.x}年目:残っている工場 ${s.nFactory}社(累計の利益 平均${Math.round(s.factory).toLocaleString("ja-JP")})、工房 ${s.nWorkshop}社(平均${Math.round(s.workshop).toLocaleString("ja-JP")})。`,
      gauges: [{ label: "工場の評判", text: `${Math.round(s.rep * 100)}%`, value: s.rep, color: "#b4473b" }],
      zones: [{ name: "残っている工場", color: "#b4473b", count: s.nFactory, build: "factory" }, { name: "残っている工房", color: "#2f8f6b", count: s.nWorkshop, build: "market" }, { name: "つぶれた会社", color: "#8b93a7", count: 24 - s.nFactory - s.nWorkshop, build: "site" }] }));
    return { frames, opts: { unit: "社", figure: "house", sub: "家1軒が、会社1社を表します。" } };
  },
};
