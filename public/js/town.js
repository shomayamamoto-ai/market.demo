// 貯金と町のシミュレーター:住民が「使う」か「貯める」かで、町の大きさがどう変わるかを試す。
// 住民が店で使ったお金が、店の売上と雇用になり、また住民の収入になる、という循環を追いかける。
import { makeRng, clamp } from "./rng.js";
import { thin } from "./stage3d.js";

export const TOWN_ASSUMPTIONS = {
  base: { value: 91, note: "町の外からの注文など、町の中の消費に関係なくある仕事の数(最初の200軒のうち)" },
  loop: { value: 0.606, note: "町の中で使われたお金1軒分が、町の中に生む仕事の数" },
  saveAnt: { value: 0.6, note: "貯める家(アリ)が収入のうち貯める割合" },
  saveGrass: { value: 0.1, note: "使う家(キリギリス)が収入のうち貯める割合。蓄えは0.3年分までしか持たない" },
  need: { value: 0.5, note: "仕事が無い年に、蓄えを崩して使う金額(1年分の収入 = 1)" },
  enough: { value: 12, note: "タンス預金がこの年数分たまると、貯める家も貯める割合を3割に下げて使い始める" },
  lend: { value: 1.03, note: "銀行に預けたお金のうち、店の設備や雇用に回って町で使われる割合(生産性の伸びを含む)" },
  winter: { value: "約25年に1度・3年間", note: "不景気(冬)。その間は仕事が7%減る" },
  leave: { value: 2, note: "収入も蓄えも無い年がこの年数続くと、町を出ていく" },
  arrive: { value: 3, note: "仕事が家の数より多いとき、1年に引っ越してくる家の上限" },
};

export const town = {
  key: "town", title: "貯金と町", years: 120, xLabel: "年", runs: 30, initial: "half",
  lead: "住民が「使う」か「貯める」か、貯めたお金がどこへ行くかで、町の大きさがどう変わるかを試します。",
  note: "最初は200軒。住民が店で使ったお金が、店の売上と雇用になり、また住民の収入になります。約25年に1度、3年間の不景気(冬)が来ます。",
  assumptions: TOWN_ASSUMPTIONS,
  presets: {
    grass: { label: "A よく使う町(キリギリス)", rules: { ant: 0 } },
    ant: { label: "B 6割を貯める町(タンス預金)", rules: { ant: 1 } },
    half: { label: "C 半分ずつの町", rules: { ant: 0.5 } },
    bank: { label: "D 6割を銀行に預ける町", rules: { ant: 1, bank: true } },
    leak: { label: "E よく使うが、2割を町の外で使う町", rules: { ant: 0, leak: 0.2 } },
  },
  params: [{ key: "leak", label: "町の外で使う割合(%)", value: 0, min: 0, max: 80, step: 5, scale: 100 }],
  charts: [{ title: "家の数", fmt: "houses", lines: [{ key: "houses", name: "町全体", color: "#8b93a7" }, { key: "ants", name: "貯める家", color: "#b4473b" }, { key: "grass", name: "使う家", color: "#4a7fb5" }] }],
  metrics: [
    { key: "houses", label: "120年後の家の数", fmt: "houses" },
    { key: "ants", label: "うち貯める家", fmt: "houses" },
    { key: "grass", label: "うち使う家", fmt: "houses" },
    { key: "low", label: "いちばん減ったとき", fmt: "houses" },
    { key: "winterLoss", label: "冬に失う家", fmt: "pct1", sub: "冬の前との比較" },
  ],
  reference: {
    grass: { houses: 202, winterLoss: 0.07 },
    ant: { houses: 185, low: 120, winterLoss: 0.02 },
    half: { ants: 119, grass: 71 },
    bank: { houses: 242 },
  },
  advise(m, rules) {
    const out = [];
    if (rules.ant >= 1 && !rules.bank) out.push("全員が一斉に貯めると店の売上が落ち、仕事が減って町は一度縮みます。蓄えがたまって使い始めると、少しずつ戻ります。");
    if (rules.ant > 0 && rules.ant < 1) out.push("同じ町の中では、蓄えのある家のほうが不景気を持ちこたえます。1軒ずつで見れば、貯金は苦しい年を乗り切る力になります。");
    if (rules.bank) out.push("貯めたお金が銀行を通じて店の設備や雇用に回ると、お金が眠らず、町はいちばん大きくなります。");
    if (rules.leak > 0) out.push("町の外で使う割合が増えるほど、町の中の仕事が減ります。「貯めるか使うか」と同じくらい、「どこで使うか」が効きます。");
    if (!rules.ant && !rules.leak) out.push("よく使う町はふだん安定しますが、蓄えが薄いため、不景気のたびに家を失います。");
    return out;
  },
  frames(rules, seed, years) {
    const frames = thin(this.run(rules, seed, years).series).map((s) => ({
      label: `${s.x}年目`, caption: `${s.x}年目:町は${Math.round(s.houses)}軒。貯める家 ${Math.round(s.ants)}軒、使う家 ${Math.round(s.grass)}軒。`,
      zones: [{ name: "貯める家", color: "#b4473b", count: s.ants }, { name: "使う家", color: "#4a7fb5", count: s.grass }],
    }));
    return { frames, opts: { unit: "軒", sub: "町を出る家は島の外へ、引っ越してくる家は外から入ります。" } };
  },
  run(rules, seed, years) {
    const rng = makeRng(seed), A = TOWN_ASSUMPTIONS;
    const make = (ant) => ({ ant, savings: 0, job: true, bad: 0 });
    let houses = Array.from({ length: 200 }, (_, i) => make(i < 200 * rules.ant));
    let jobs = 200, nextWinter = 15 + Math.floor(rng.next() * 20), winterLeft = 0, low = 200, lossSum = 0, lossN = 0, before = 0;
    const series = [];
    for (let year = 0; year <= years; year++) {
      if (year === nextWinter) { winterLeft = 3; before = houses.length; nextWinter = year + 20 + Math.floor(rng.next() * 11); }
      const cold = winterLeft > 0 ? 0.93 : 1;
      // 1) 仕事の数に合わせて、雇う・雇い止めにする(仕事は続くものとし、毎年くじ引きにはしない)
      const target = Math.round(jobs * cold);
      let employed = houses.filter((h) => h.job);
      for (let i = employed.length; i > target && i > 0; i--) { const k = Math.floor(rng.next() * employed.length); employed[k].job = false; employed.splice(k, 1); }
      const idle = houses.filter((h) => !h.job);
      for (let i = employed.length; i < target && idle.length; i++) idle.splice(Math.floor(rng.next() * idle.length), 1)[0].job = true;
      // 2) 収入を使う・貯める
      let spent = 0;
      for (const h of houses) {
        if (h.job) {
          const rate = h.ant ? (!rules.bank && h.savings >= A.enough.value ? A.saveAnt.value * 0.3 : A.saveAnt.value) : A.saveGrass.value;
          h.savings += rate;
          if (!h.ant) h.savings = Math.min(h.savings, 0.3);
          spent += 1 - rate + (h.ant && rules.bank ? rate * A.lend.value : 0); // 銀行の町では、預けた分が貸し出されて町で使われる
          h.bad = 0;
        } else if (h.savings >= A.need.value) { h.savings -= A.need.value; spent += A.need.value; h.bad = 0; }
        else { spent += h.savings; h.savings = 0; h.bad++; }
      }
      // 3) 出ていく家、引っ越してくる家
      houses = houses.filter((h) => h.bad < A.leave.value);
      jobs = A.base.value + A.loop.value * spent * (1 - (rules.leak ?? 0));
      const room = Math.min(A.arrive.value, Math.floor(jobs - houses.length));
      for (let i = 0; i < room; i++) { const h = make(rng.next() < rules.ant); h.job = false; houses.push(h); }
      if (winterLeft > 0 && --winterLeft === 0) { lossSum += clamp(1 - houses.length / before, 0, 1); lossN++; }
      low = Math.min(low, houses.length);
      const ants = houses.filter((h) => h.ant).length;
      series.push({ x: year, houses: houses.length, ants, grass: houses.length - ants });
    }
    const last = series[years];
    return { series, summary: { houses: last.houses, ants: last.ants, grass: last.grass, low, winterLoss: lossN ? lossSum / lossN : 0 } };
  },
};
