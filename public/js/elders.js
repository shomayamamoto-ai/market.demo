// 長寿の村のシミュレーター:長寿の村、短命の村、60歳で山へ行く村を200年動かす。
// お年寄りは食べる口でもあり、子守りと農作業の指導役でもあり、昔の飢饉を覚えている人でもある。
import { makeRng, clamp } from "./rng.js";
import { thin } from "./stage3d.js";

export const ELDERS_ASSUMPTIONS = {
  start: { value: { people: 60, paddies: 100 }, note: "最初の人口と田んぼの数。参考にした実験と同じ" },
  feed: { value: 2.05, note: "田んぼ1枚が、ふつうの年に養える人数。仮定" },
  life: { value: { long: 82, short: 56, ubasute: 60 }, note: "寿命の目安(歳)。長寿の村は70歳ごろから、短命の村は45歳ごろから亡くなる人が増える。山へ行く村は60歳で村を出る。仮定" },
  birth: { value: 0.3, note: "18〜40歳の人1人あたりの、1年に生まれる子の数(食料に余裕があるとき)。食料が足りなくなるほど減る。仮定" },
  care: { value: 0.25, note: "子守りの効果。60歳以上の人が人口の1割いると、子どもの育ちやすさがこの割合だけ上がる(上限あり)。仮定" },
  teach: { value: 0.02, note: "指導の効果。60歳以上の人が人口の1割いると、田んぼの実りがこの割合だけ増える(上限あり)。仮定" },
  famine: { value: { years: [40, 100, 160], length: 3, harvest: 0.34 }, note: "飢饉の年と長さ、その間の実り(ふつうの年に対する割合)。年は参考にした実験と同じ、長さと深さは仮定" },
  memory: { value: 8, note: "前の飢饉のときにこの年齢以上だった人が生きていれば、村は飢饉を「覚えている」とみなす" },
  stock: { value: { rate: 1, max: 2.2 }, note: "飢饉を覚えている村が、余った食料のうち蓄えに回す割合と、蓄えの上限(村の何年分か)。覚えていない村は、ほとんど蓄えない(0.15年分まで)。仮定" },
  restraint: { value: 0.86, note: "飢饉を覚えている村が、蓄えが満ちるまで目安にする人口(田んぼが養える人数に対する割合)。出産を控えて余りを作り、蓄えに回す。仮定" },
  starve: { value: 0.75, note: "食料が足りない割合のうち、その年に亡くなる人の割合。子どもとお年寄りから先に亡くなる。仮定" },
  calibration: { value: "参考にした実験の値に合わせて調整", note: "200年の平均人口が、長寿の村162人・山へ行く村129人・短命の村124人に近づくよう係数を決めた。実際の村の記録に合わせたものではない" },
};

export const elders = {
  key: "elders", title: "長寿の村", years: 200, xLabel: "年", runs: 40, initial: "long",
  lead: "お年寄りが長く生きる村と、そうでない村。どちらが栄えるかを、飢饉のある200年で試します。",
  note: "どの村も、田んぼ100枚と60人から始まります。お年寄りは、子守りと農作業の指導を担います。<br>40年目・100年目・160年目に飢饉が来ます。前の飢饉を覚えている人がいる村は、食料を蓄え、出産を控えて備えます。",
  assumptions: ELDERS_ASSUMPTIONS,
  presets: {
    long: { label: "A 長寿の村", rules: { type: "long", famine: 1 } },
    short: { label: "B 短命の村", rules: { type: "short", famine: 1 } },
    ubasute: { label: "C 60歳で山へ行く村", rules: { type: "ubasute", famine: 1 } },
    hidden: { label: "D Cの村が、お年寄りを1人かくまう", rules: { type: "ubasute", famine: 1, hide: 1 } },
    calmLong: { label: "E 飢饉が来ない:長寿の村", rules: { type: "long", famine: 0 } },
    calmUbasute: { label: "F 飢饉が来ない:山へ行く村", rules: { type: "ubasute", famine: 0 } },
  },
  charts: [{ title: "村の人口", fmt: "num0", lines: [{ key: "pop", name: "人口", color: "#2f8f6b" }, { key: "old", name: "うち60歳以上", color: "#c9a45c" }] }, { title: "蓄えた食料(村の何年分か)", fmt: "num2", lines: [{ key: "stock", name: "蓄え", color: "#4a7fb5" }] }],
  metrics: [{ key: "avg", label: "200年の平均人口", fmt: "people" }, { key: "pop100", label: "100年目の人口(飢饉の直前)", fmt: "people" }, { key: "low", label: "いちばん減ったときの人口", fmt: "people", sub: "50年目以降" },
    { key: "lost", label: "飢饉で亡くなった人", fmt: "people", sub: "200年の累計" }, { key: "remembered", label: "飢饉を覚えていた回数", fmt: "num1", sub: "2回目・3回目の飢饉のうち" }],
  reference: { long: { avg: 162 }, short: { avg: 124 }, ubasute: { avg: 129 } },
  advise(m, r) {
    const out = [];
    if (!r.famine) out.push("飢饉が来なければ、お年寄りが多い村も少ない村も、人口はほぼ同じになります。食べる口が増える分と、子守りや指導で助かる分が、ほぼつり合うためです。");
    else if (m.remembered > 1) out.push(`前の飢饉を覚えている人がいたので、食料を蓄え、出産を控えて備えられました。いちばん減ったときでも${Math.round(m.low)}人です。`);
    else out.push(`飢饉は60年おきなので、前の飢饉を覚えている人がいません。備えがなく、いちばん減ったときは${Math.round(m.low)}人まで落ちました。`);
    if (r.hide) out.push("かくまうのは1人でも、記憶があるかないかで村の備えが変わります。大事なのは人数より、記憶が途切れないことです。");
    out.push("会社に置きかえると、数十年に一度の危機(大事故、資金繰りの行き詰まり)を経験した人がいなくなると、備えの理由が忘れられます。記録と語り継ぎが、その代わりになります。");
    return out;
  },
  run(r, seed, years) {
    const A = ELDERS_ASSUMPTIONS, rng = makeRng(seed), F = A.famine.value;
    let people = Array.from({ length: A.start.value.people }, () => ({ age: Math.floor(rng.next() * 50) }));
    let stock = 0, lost = 0, lastFamine = null, remembered = 0, hidden = null;
    const series = []; let sum = 0, low = Infinity;
    const dieProb = (age) => (r.type === "short" ? (age < 45 ? 0.006 : 0.03 + 0.045 * (age - 45)) : age < 70 ? 0.006 : 0.03 + 0.03 * (age - 70));
    for (let t = 0; t <= years; t++) {
      const pop = people.length + (hidden ? 1 : 0), old = people.filter((p) => p.age >= 60).length + (hidden ? 1 : 0), oldShare = old / Math.max(pop, 1);
      series.push({ x: t, pop, old, stock: stock / Math.max(pop, 1) });
      sum += pop; if (t >= 50) low = Math.min(low, pop);
      const inFamine = r.famine && F.years.some((y) => t >= y && t < y + F.length);
      // 前の飢饉を覚えている人がいるか
      const remembers = lastFamine != null && (people.some((p) => p.age - (t - lastFamine) >= A.memory.value) || (hidden && hidden.age - (t - lastFamine) >= A.memory.value));
      if (r.famine && F.years.includes(t)) { if (lastFamine != null && remembers) remembered++; }
      // 実りと蓄え
      const harvest = A.start.value.paddies * A.feed.value * (1 + A.teach.value * Math.min(1.5, oldShare / 0.1)) * (inFamine ? F.harvest : 1) * (1 + 0.04 * rng.normal());
      let food = harvest + stock; const need = pop;
      if (food >= need) { const spare = food - need, cap = (remembers ? A.stock.value.max : 0.15) * pop; stock = Math.min(cap, spare * (remembers ? A.stock.value.rate : 0.1)); }
      else { // 足りない:子どもとお年寄りから先に亡くなる
        stock = 0; let die = Math.round((need - food) * A.starve.value);
        const order = people.map((p, i) => [i, (p.age < 10 || p.age >= 60 ? 0 : 1) + rng.next()]).sort((a, b) => a[1] - b[1]).slice(0, die).map((x) => x[0]);
        const gone = new Set(order); lost += gone.size; people = people.filter((_, i) => !gone.has(i));
      }
      if (r.famine && F.years.includes(t)) lastFamine = t;
      // 出産:食料の余裕、子守り、(覚えている村は)蓄えが少ないときの控え
      const normal = A.start.value.paddies * A.feed.value, saving = remembers && stock < A.stock.value.max * pop * 0.98;
      const room = clamp(1 - people.length / (normal * (saving ? A.restraint.value : 0.98)), 0, 1), parents = people.filter((p) => p.age >= 18 && p.age <= 40).length;
      const careful = 1;
      const births = parents * A.birth.value * room * (1 + A.care.value * Math.min(1.5, oldShare / 0.1)) * careful * (inFamine ? 0.4 : 1);
      for (let b = 0; b < Math.floor(births) + (rng.next() < births % 1 ? 1 : 0); b++) people.push({ age: 0 });
      // 年を取る、亡くなる、山へ行く
      const next = [];
      for (const p of people) {
        p.age++;
        if (rng.next() < dieProb(p.age)) continue;
        if (r.type === "ubasute" && p.age >= A.life.value.ubasute) { if (r.hide && !hidden) hidden = { age: p.age }; continue; } // 1人だけ、かくまう
        next.push(p);
      }
      people = next;
      if (hidden) { hidden.age++; if (rng.next() < 0.02 + 0.04 * Math.max(0, hidden.age - 80)) hidden = null; }
    }
    return { series, summary: { avg: sum / (years + 1), pop100: series[Math.min(99, years)].pop, low: low === Infinity ? series[years].pop : low, lost, remembered } };
  },
  frames(r, seed, years) {
    const frames = thin(this.run(r, seed, years).series).map((s) => ({ label: `${s.x}年目`, caption: `${s.x}年目:村の人口 ${Math.round(s.pop)}人(うち60歳以上 ${Math.round(s.old)}人)。蓄えは${s.stock.toFixed(1)}年分。`,
      gauges: [{ label: "蓄え", text: `${s.stock.toFixed(1)}年分`, value: clamp(s.stock / 2.2, 0, 1), color: "#4a7fb5" }],
      zones: [{ name: "59歳以下", color: "#2f8f6b", count: s.pop - s.old, build: "field" }, { name: "60歳以上", color: "#c9a45c", count: s.old, build: "house" }] }));
    return { frames, opts: { sub: "田んぼ100枚の村。", maxFigures: 260 } };
  },
};
