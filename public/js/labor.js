// 人手不足のシミュレーター:6棟の工場と1,000人の住民。
// 住民は「報酬 − 使う体力」を広場(差し引き+1)と比べて、得なほうで働く。人が来ない理由を、報酬と体力の引き算から試す。
import { makeRng, clamp } from "./rng.js";
import { thin } from "./stage3d.js";

export const LABOR_ASSUMPTIONS = {
  people: { value: 1000, note: "住民の数。参考にした実験と同じ" },
  factories: { value: 6, note: "工場の数。1棟の求人は30人(合計180人)。条件Bでは3倍の540人" },
  plaza: { value: { reward: 1.5, stamina: 0.5 }, note: "広場で働いたときの報酬(リンゴ)と使う体力。差し引き+1。参考にした実験と同じ" },
  stamina: { value: 1.5, note: "工場で使う体力。自動ハンマーを入れると1.0。参考にした実験と同じ" },
  body: { value: 0.12, note: "体力の使い方の個人差(標準偏差)。同じ仕事でも、人によって疲れ方が違う。仮定" },
  tied: { value: 0.039, note: "家の事情などで、損でも工場で働き続ける人の割合。仮定。報酬1個のときの生産力が21.5%になるよう決めた" },
  overwork: { value: 0.6, note: "人が足りない工場では、足りない割合 × この係数だけ、1人の使う体力が増える。仮定" },
  raise: { value: 0.25, note: "自由競争のとき、人が足りない工場が1期ごとに上げる報酬(上限は条件で決める)" },
  move: { value: 0.5, note: "得な働き先がほかにあるとき、その期に移る人の割合" },
  improve: { value: 0.0155, note: "人がそろっている工場が、もうけを道具の改良に回して上がる生産性(1期あたり)。仮定。自由競争の生産力が184%になるよう決めた" },
  auto: { value: 4.4, note: "自動ハンマーで、1人が作る量が何倍になるか。仮定。生産力が252%になるよう決めた" },
  value: { value: 4.2, note: "工場の手元に残る、1人分の売上(リンゴ、道具の水準1のとき)。仮定" },
  fixedCost: { value: 10, note: "工場1棟に毎期かかる費用(リンゴ)。仮定" },
  hireCost: { value: 5, note: "外から助っ人を1人呼ぶ費用(旅費・仲介料)。仮定" },
  helpers: { value: 60, note: "悪評が無いとき、1期に外の村から来る助っ人の数。仮定" },
  uturn: { value: 0.18, note: "助っ人がその期に村へ帰る基本の確率。働きすぎの度合いに応じて増える。仮定" },
  rumor: { value: 500, note: "帰った人がこの人数に達すると、悪評で誰も来なくなる(それまでは人数に比例して来る人が減る)。仮定" },
  neglect: { value: 0.02, note: "安い人手に頼って道具の改良を怠った工場で、売上につながる力が1期ごとに落ちる割合。仮定" },
  bankrupt: { value: -120, note: "手元のリンゴがこの数を下回ると、工場は倒産する。仮定" },
};

export const labor = {
  key: "labor", title: "人手不足", years: 40, xLabel: "期", runs: 30, initial: "fixed",
  lead: "「人が来ない」のは人口のせいか、条件のせいか。報酬と使う体力の引き算を変えて、工場に人が集まるかを試します。",
  note: "6棟の工場と1,000人の住民がいます。広場で働くと、体力0.5でリンゴ1.5個(差し引き+1)。工場は体力1.5を使います。<br>住民は「報酬 − 使う体力」が広場の+1を上回るときだけ、工場で働きます。",
  assumptions: LABOR_ASSUMPTIONS,
  presets: {
    market: { label: "A 自由競争(報酬を3個まで上げられる)", rules: { wage: 2, maxWage: 3, slots: 30, mode: 0 } },
    fixed: { label: "B 報酬1個に固定、求人を3倍に", rules: { wage: 1, maxWage: 1, slots: 90, mode: 0 } },
    helper: { label: "C 報酬1個のまま、外から助っ人を呼ぶ", rules: { wage: 1, maxWage: 1, slots: 90, mode: 1 } },
    auto: { label: "D 自動ハンマーに投資し、報酬3.5個", rules: { wage: 3.5, maxWage: 3.5, slots: 9, mode: 2 } },
  },
  params: [{ key: "wage", label: "最初の報酬(リンゴ)", value: 1, min: 0, max: 6, step: 0.25 }, { key: "maxWage", label: "上げられる報酬の上限", value: 1, min: 0, max: 6, step: 0.25 }, { key: "slots", label: "1棟の求人(人)", value: 90, min: 1, max: 160 }],
  charts: [{ title: "生産力と人手不足", lines: [{ key: "productivity", name: "生産力(最初の計画を100%)", color: "#2f8f6b" }, { key: "shortage", name: "人手が足りない工場の割合", color: "#b4473b" }] },
    { title: "工場で働く人", fmt: "num0", lines: [{ key: "workers", name: "住民", color: "#4a7fb5" }, { key: "helpers", name: "外からの助っ人", color: "#c9a45c" }] }],
  metrics: [{ key: "shortage", label: "人手不足率", fmt: "pct", sub: "人が足りない工場の割合" }, { key: "productivity", label: "生産力", fmt: "pct1", sub: "求人180人が埋まった状態を100%" },
    { key: "workers", label: "工場で働く住民", fmt: "people" }, { key: "net", label: "工場で働く差し引き", fmt: "num2", sub: "報酬 − 使う体力。広場は+1" },
    { key: "alive", label: "残った工場", fmt: "num1", sub: "6棟のうち" }, { key: "uturn", label: "村へ帰った助っ人", fmt: "people", sub: "期間中の延べ人数" }],
  reference: { market: { shortage: 0, productivity: 1.84 }, fixed: { shortage: 1, productivity: 0.215 }, auto: { shortage: 0, productivity: 2.52, workers: 54 } },
  advise(m, r) {
    const out = [];
    if (r.mode === 1) out.push(`外から呼んだ助っ人は、働きすぎと悪評で延べ${Math.round(m.uturn)}人が帰りました。呼ぶ費用だけがかさみ、6棟のうち${(6 - m.alive).toFixed(1)}棟が倒産しています。`);
    else if (m.shortage > 0.5) out.push(`工場で働くと差し引き${m.net.toFixed(2)}で、広場の+1を下回ります。求人をいくら増やしても、この引き算が合わない限り人は来ません。`);
    else out.push(`工場で働く差し引きは${m.net.toFixed(2)}で、広場の+1を上回っています。人がそろい、もうけが道具の改良に回って、生産力は${Math.round(m.productivity * 100)}%になりました。`);
    if (r.mode === 2) out.push(`働く人は${Math.round(m.workers)}人と少なくても、1人が作る量が増えたので、高い報酬を払っても生産力は上がります。`);
    if (r.mode === 0 && r.maxWage <= 1.5) out.push("雇う側が少数で報酬を低く固定できると、働き手は減り、雇う側も得をしません(買い手独占)。");
    out.push("自社に当てはめるときは、「応募が来ない」を人口や若者のせいにする前に、仕事の負担と報酬の引き算が、ほかの働き口を上回っているかを確かめてください。");
    return out;
  },
  run(r, seed, years) {
    const A = LABOR_ASSUMPTIONS, rng = makeRng(seed), N = A.people.value, F = A.factories.value, auto = r.mode === 2;
    const stamina = auto ? 1.0 : A.stamina.value, plazaNet = A.plaza.value.reward - A.plaza.value.stamina;
    const people = Array.from({ length: N }, () => ({ h: clamp(1 + A.body.value * rng.normal(), 0.6, 1.5), tied: rng.next() < A.tied.value, at: -1 }));
    const fac = Array.from({ length: F }, () => ({ wage: r.wage, tool: auto ? A.auto.value : 1, slots: Math.round(r.slots), n: 0, helpers: 0, cash: 0, alive: true, load: 1 }));
    // 最初から工場にいる人:損でも働き続ける人
    let k0 = 0;
    for (const p of people) if (p.tied) { const f = fac[k0++ % F]; if (f.n < f.slots) { p.at = fac.indexOf(f); f.n++; } else p.tied = false; }
    const series = []; let uturn = 0;
    for (let t = 0; t <= years; t++) {
      // 1) 工場:人が足りなければ報酬を上げる(上限まで)
      for (const f of fac) if (f.alive && f.n + f.helpers < f.slots && f.wage < r.maxWage) f.wage = Math.min(r.maxWage, f.wage + A.raise.value);
      for (const f of fac) f.load = 1 + A.overwork.value * clamp(1 - (f.n + f.helpers) / Math.max(1, Math.min(f.slots, 30)), 0, 1) * (r.mode === 1 ? 1 : 0.25); // 人が足りないと1人の負担が増える
      // 2) 住民:工場と広場の差し引きを比べて移る
      for (const p of people) {
        const cur = p.at >= 0 ? fac[p.at] : null;
        if (cur && !cur.alive) { p.at = -1; continue; }
        if (rng.next() > A.move.value) continue;
        if (cur) { if (!p.tied && cur.wage - stamina * p.h * cur.load <= plazaNet) { cur.n--; p.at = -1; } continue; }
        let best = -1, gain = plazaNet;
        fac.forEach((f, k) => { if (!f.alive || f.n + f.helpers >= f.slots) return; const g = f.wage - stamina * p.h * f.load + rng.next() * 0.02; if (g > gain) { gain = g; best = k; } });
        if (best >= 0) { p.at = best; fac[best].n++; }
      }
      // 3) 助っ人:来て、働きすぎで帰り、悪評が広がる
      if (r.mode === 1) {
        const come = Math.round(A.helpers.value * clamp(1 - uturn / A.rumor.value, 0, 1));
        const open = fac.filter((f) => f.alive && f.n + f.helpers < f.slots);
        for (let i = 0; i < come && open.length; i++) { const f = open[i % open.length]; if (f.n + f.helpers < f.slots) { f.helpers++; f.cash -= A.hireCost.value; } }
        for (const f of fac) if (f.alive) { let back = 0; const p = clamp(A.uturn.value + 0.9 * (f.load - 1) + 0.25 * clamp(uturn / A.rumor.value, 0, 1), 0, 0.95); for (let i = 0; i < f.helpers; i++) if (rng.next() < p) back++; f.helpers -= back; uturn += back; }
      }
      // 4) もうけと道具の改良、倒産
      let out = 0, short = 0, alive = 0, workers = 0, helpers = 0, wageSum = 0, loadSum = 0;
      for (const f of fac) {
        if (!f.alive) { short++; continue; }
        const staff = f.n + f.helpers;
        f.cash += staff * (A.value.value * f.tool * (auto ? 0.35 : 1) - f.wage) - A.fixedCost.value;
        if (staff >= f.slots && r.mode !== 1 && r.maxWage > 1.5) f.tool *= 1 + A.improve.value; // 人がそろい、もうけが出ている工場だけが道具を良くできる
        if (r.mode === 1) f.tool *= 1 - A.neglect.value;
        if (f.cash < A.bankrupt.value) { f.alive = false; uturn += f.helpers; f.helpers = 0; f.n = 0; short++; continue; }
        alive++; out += staff * f.tool; workers += f.n; helpers += f.helpers; wageSum += f.wage; loadSum += f.load;
        if (staff < f.slots) short++;
      }
      series.push({ x: t, productivity: out / 180, shortage: short / F, workers, helpers, alive, net: alive ? wageSum / alive - stamina * (loadSum / alive) : 0, uturn });
    }
    const z = series[years];
    return { series, summary: { shortage: z.shortage, productivity: z.productivity, workers: z.workers, net: z.net, alive: z.alive, uturn } };
  },
  frames(r, seed, years) {
    const P = (v) => `${Math.round(v * 100)}%`;
    const frames = thin(this.run(r, seed, years).series).map((s) => ({ label: `${s.x}期`,
      caption: `${s.x}期:工場で働く住民 ${Math.round(s.workers)}人${r.mode === 1 ? `、助っ人 ${Math.round(s.helpers)}人(帰った人 延べ${Math.round(s.uturn)}人)` : ""}。生産力 ${P(s.productivity)}、残った工場 ${s.alive}棟。`,
      gauges: [{ label: "生産力", text: P(s.productivity), value: s.productivity / 2.6, color: "#2f8f6b" }, { label: "人手不足の工場", text: P(s.shortage), value: s.shortage, color: "#b4473b" }],
      zones: [{ name: "広場で働く人", color: "#4a7fb5", count: 1000 - s.workers, build: "plaza" }, { name: "工場で働く住民", color: "#2f8f6b", count: s.workers, build: "factory" }, ...(r.mode === 1 ? [{ name: "外からの助っ人", color: "#c9a45c", count: s.helpers, build: "tent" }] : [])] }));
    return { frames, opts: { sub: "住民は、差し引きが得なほうへ移ります。", maxFigures: 500, props: [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5].map((x, i) => ({ kind: "factory", color: ["#8a8f9c", "#9a8f7c", "#7c8f9a", "#8f7c9a", "#7c9a85", "#9a7c7c"][i], x, z: 0.55, size: 0.9, label: i === 2 ? "6棟の工場" : null })) } };
  },
};
