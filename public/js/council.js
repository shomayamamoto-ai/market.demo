// 村の決め方のシミュレーター:「王が1人で決める村」「みんなで話し合って多数決で決める村」
// 「読みが当たってきた人を長に選ぶ村」のどれが豊かになり、生き残るかを試す。
import { makeRng, clamp } from "./rng.js";
import { thin } from "./stage3d.js";
const NAME = { king: "王", council: "寄り合い", chief: "選ばれた長" }, COLOR = { king: "#b4473b", council: "#4a7fb5", chief: "#c9a45c" };

export const COUNCIL_ASSUMPTIONS = {
  skill: { value: "60〜90%", note: "村人1人が、その年に合う作物を読み当てる確率(人によって違う)" },
  king: { value: "80〜100%", note: "王が読み当てる確率。代替わり(約25年ごと)のたびに引き直すので、名君の代と暗君の代がある" },
  members: { value: 11, note: "寄り合いで多数決に加わる人数" },
  rumor: { value: 0.28, note: "「噂あり」のとき、声の大きい1人の意見にそのまま従う人の割合" },
  hard: { value: { king: 0.3, member: 0.1 }, note: "「読みにくい年」のとき、読みが当たる確率が下がる幅。1人で読む王のほうが大きく下がる" },
  land: { value: 300, note: "1つの村が養える人数" },
  famine: { value: 0.12, note: "読みが外れた年に失う人口の割合" },
  tax: { value: 0.62, note: "王の村で、重い年貢のために実際に養える人数の割合。外れた年には30%の確率で一揆が起き、さらに10%を失う" },
  speed: { value: { king: 1, council: 0.55, chief: 0.9 }, note: "戦いのときに兵を集める速さ(兵力 = 人口 × この値)。話し合いには時間がかかる" },
  term: { value: 8, note: "選ばれた長の任期(年)。3回続けて外すと、任期の途中でも交代する" },
};

const TYPES = ["king", "council", "chief"];
export const council = {
  key: "council", title: "村の決め方", years: 300, xLabel: "年", runs: 40, initial: "war",
  lead: "王が決める村、みんなで多数決で決める村、選ばれた長が決める村のどれが豊かになり、生き残るかを試します。",
  note: "12の村が輪になって並びます。毎年、その年に合う作物を読み当てられるかで収穫が決まり、外れると人口が減ります。",
  assumptions: COUNCIL_ASSUMPTIONS,
  presets: {
    peace: { label: "A 平和な島(王6・寄り合い6)", rules: { mix: ["king", "council"] } },
    hard: { label: "B 読みにくい年が続く", rules: { mix: ["king", "council"], hard: true } },
    rumor: { label: "C 噂に流される", rules: { mix: ["king", "council"], rumor: true } },
    war: { label: "D 村同士の戦いがある", rules: { mix: ["king", "council"], war: true } },
    ally: { label: "E 戦いあり+寄り合いが守り合う", rules: { mix: ["king", "council"], war: true, ally: true } },
    chief: { label: "F 戦いあり+選ばれた長の村がある", rules: { mix: ["king", "council", "chief"], war: true } },
  },
  charts: [
    { title: "村の数", fmt: "num1", lines: [{ key: "nKing", name: "王の村", color: "#b4473b" }, { key: "nCouncil", name: "寄り合いの村", color: "#4a7fb5" }, { key: "nChief", name: "選ばれた長の村", color: "#c9a45c" }] },
    { title: "1村あたりの人口", fmt: "people", lines: [{ key: "popKing", name: "王の村", color: "#b4473b" }, { key: "popCouncil", name: "寄り合いの村", color: "#4a7fb5" }, { key: "popChief", name: "選ばれた長の村", color: "#c9a45c" }] },
  ],
  metrics: [
    { key: "hitKing", label: "王の的中率", fmt: "pct" }, { key: "hitCouncil", label: "寄り合いの的中率", fmt: "pct" },
    { key: "popKing", label: "王の村の人口", fmt: "people", sub: "1村あたり" }, { key: "popCouncil", label: "寄り合いの村の人口", fmt: "people", sub: "1村あたり" },
    { key: "nKing", label: "残った王の村", fmt: "villages" }, { key: "nCouncil", label: "残った寄り合いの村", fmt: "villages" }, { key: "nChief", label: "残った長の村", fmt: "villages" },
  ],
  reference: {
    peace: { hitKing: 0.9, hitCouncil: 0.97, popKing: 127, popCouncil: 259 },
    hard: { nKing: 0 }, rumor: { hitCouncil: 0.9 }, war: { nKing: 7, nCouncil: 2 },
  },
  advise(m, rules) {
    const out = [];
    if (!rules.war && !rules.rumor) out.push("1人ずつの読みが外れても、多数決では互いに打ち消し合うので、寄り合いのほうがよく当たります(コンドルセの陪審定理)。");
    if (rules.rumor) out.push("みんなが声の大きい1人に従うと、意見が独立でなくなり、多数決の強みが消えます。");
    if (rules.war && !rules.ally && !rules.mix.includes("chief")) out.push("戦いがあると、決めるのも兵を集めるのも早い王の村が、話し合いに時間のかかる村を飲み込みます。豊かな村ほど狙われます。");
    if (rules.ally) out.push("隣同士で守り合うと、決めるのが遅い村でも生き残りやすくなります。");
    if (rules.mix.includes("chief")) out.push("読みが当たってきた人を長に選んで素早く決めさせ、外し続けたら交代させる仕組みは、早さと賢さの両方を持てます。");
    return out;
  },
  frames(rules, seed, years) {
    const detail = [];
    this.run(rules, seed, years, detail);
    const frames = thin(detail.map((d, x) => ({ ...d, x }))).map((d) => {
      const n = (t) => d.v.filter((b) => b.alive && b.type === t).length;
      return { label: `${d.x}年目`, caption: `${d.x}年目:王の村 ${n("king")}、寄り合いの村 ${n("council")}${rules.mix.includes("chief") ? `、選ばれた長の村 ${n("chief")}` : ""}。${d.moves.length ? "攻め取られた村があります。" : ""}`,
        flows: d.moves,
        zones: d.v.map((b, i) => ({ name: `村${i + 1}`, note: b.alive ? NAME[b.type] : "消滅", color: b.alive ? COLOR[b.type] : "#8b93a7", count: b.alive ? b.pop : 0, hideBar: true, build: b.alive ? { king: "castle", council: "hall", chief: "tower" }[b.type] : null })) };
    });
    return { frames, opts: { layout: "ring", sub: "色は決め方(赤=王、青=寄り合い、金=選ばれた長)。", maxFigures: 420 } };
  },
  run(rules, seed, years, detail = null) {
    const rng = makeRng(seed), A = COUNCIL_ASSUMPTIONS, n = 12, down = rules.hard ? A.hard.value.member : 0, downKing = rules.hard ? A.hard.value.king : 0;
    const newKing = () => 0.8 + rng.next() * 0.2;
    const v = Array.from({ length: n }, (_, i) => ({
      type: rules.mix[i % rules.mix.length], pop: 100, alive: true, king: newKing(), reign: Math.floor(rng.next() * 25),
      skills: Array.from({ length: A.members.value }, () => 0.6 + rng.next() * 0.3), record: Array(A.members.value).fill(0), chief: 0, term: 0, miss: 0,
    }));
    const hits = { king: [0, 0], council: [0, 0], chief: [0, 0] }, series = [];
    for (let year = 0; year <= years; year++) {
      for (const a of v) {
        if (!a.alive) continue;
        const votes = a.skills.map((p) => rng.next() < p - down);
        votes.forEach((ok, i) => { a.record[i] = a.record[i] * 0.9 + (ok ? 1 : 0); }); // だれの読みが当たってきたか
        let hit;
        if (a.type === "king") { if (++a.reign > 25) { a.reign = 0; a.king = newKing(); } hit = rng.next() < a.king - downKing; }
        else if (a.type === "council") {
          const loud = votes[0];
          const final = rules.rumor ? votes.map((ok) => (rng.next() < A.rumor.value ? loud : ok)) : votes;
          hit = final.filter(Boolean).length > final.length / 2;
        } else {
          if (++a.term > A.term.value || a.miss >= 3) { a.chief = a.record.indexOf(Math.max(...a.record)); a.term = 0; a.miss = 0; }
          hit = votes[a.chief]; a.miss = hit ? 0 : a.miss + 1;
        }
        hits[a.type][0] += hit ? 1 : 0; hits[a.type][1]++;
        const cap = A.land.value * (a.type === "king" ? A.tax.value : 1);
        if (hit) a.pop += 0.06 * a.pop * (1 - a.pop / cap);
        else { a.pop *= 1 - A.famine.value; if (a.type === "king" && rng.next() < 0.3) a.pop *= 0.9; }
        if (a.pop < 12) a.alive = false; // 村が消える
      }
      const moves = [];
      if (rules.war) v.forEach((a, i) => {
        if (!a.alive || rng.next() > 0.035) return;
        const S = A.speed.value;
        const targets = [v[(i + n - 1) % n], v[(i + 1) % n]].filter((b) => b.alive && b.type !== a.type);
        for (const b of targets.sort((x, y) => y.pop - x.pop)) {
          const j = v.indexOf(b);
          const friends = rules.ally && b.type === "council" ? [v[(j + n - 1) % n], v[(j + 1) % n]].filter((c) => c.alive && c.type === "council" && c !== a).reduce((x, c) => x + c.pop * 0.5, 0) : 0;
          if (a.pop * S[a.type] > (b.pop + friends) * S[b.type] * 1.3) { moves.push({ from: i, to: j, color: COLOR[a.type], n: 5 }); a.pop *= 0.95; b.pop *= 0.6; b.type = a.type; b.king = newKing(); b.reign = 0; break; } // 攻め取られた村は、攻めた側の決め方になる
        }
      });
      detail?.push({ v: v.map((a) => ({ type: a.type, pop: a.pop, alive: a.alive })), moves });
      const row = { x: year };
      for (const t of TYPES) {
        const list = v.filter((a) => a.alive && a.type === t), K = t[0].toUpperCase() + t.slice(1);
        row[`n${K}`] = list.length; row[`pop${K}`] = list.length ? list.reduce((x, a) => x + a.pop, 0) / list.length : 0;
      }
      series.push(row);
    }
    const last = series[years], rate = (t) => (hits[t][1] ? hits[t][0] / hits[t][1] : 0);
    return { series, summary: { hitKing: rate("king"), hitCouncil: rate("council"), popKing: last.popKing, popCouncil: last.popCouncil, nKing: last.nKing, nCouncil: last.nCouncil, nChief: last.nChief } };
  },
};
