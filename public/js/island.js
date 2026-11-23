// 交換と略奪のシミュレーター:12の村が輪になって並ぶ島で、「交換する」「奪う」「仕返しする」
// 「年貢を取って守る」といったふるまいが、島全体の人口をどう変えるかを試す。
import { makeRng, clamp } from "./rng.js";
import { thin } from "./stage3d.js";
const COLOR = { self: "#8b93a7", trade: "#4a7fb5", raid: "#b4473b", tft: "#c9a45c", lord: "#8a6fb3", hungry: "#58a6a6" };

export const ISLAND_ASSUMPTIONS = {
  land: { value: 142, note: "自給自足の村が養える人数(1村あたり)" },
  trade: { value: 0.58, note: "交換相手の隣村1つにつき、養える人数が増える割合(得意な物に特化できるため)" },
  growth: { value: 0.04, note: "人口が養える人数に近づく速さ(1年あたり)" },
  loot: { value: 0.15, note: "襲われた村が1回の襲撃で失う人口の割合" },
  gain: { value: 0.8, note: "奪った食料で、襲った村が増やせる人数(襲われた村が失った人数に対する割合)" },
  cost: { value: 0.037, note: "襲う側が1回の襲撃で失う人口の割合。仕返しの村を襲うと、奪える量は3割に減り、さらに20%を失う" },
  tribute: { value: 0.15, note: "年貢の村が、守る代わりに隣村から取る収穫の割合。守られた村は襲われない" },
  badYear: { value: 0.15, note: "凶作の年が来る確率。その年は養える人数が25%減る" },
  copy: { value: 10, note: "何年ごとに、隣村のうち1人あたりの食料が最も多かった村のやり方を真似るか(真似る確率は50%)" },
};

const LABEL = { self: "自給自足", trade: "交換", raid: "略奪", tft: "仕返し", lord: "年貢", hungry: "飢えたら奪う" };
const fill = (n, s) => Array.from({ length: n }, () => s);
export const island = {
  key: "island", title: "交換と略奪", years: 200, xLabel: "年", runs: 30, initial: "spread",
  lead: "「奪う」と「交換する」のどちらが得かを、12の村が並ぶ島で試します。",
  note: "村は輪になって並び、両隣とだけ関わります。最初は1村100人。10年ごとに、うまくいっている隣村のやり方を真似ることがあります。",
  assumptions: ISLAND_ASSUMPTIONS,
  presets: {
    self: { label: "A 自給自足の島", rules: { start: fill(12, "self") } },
    trade: { label: "B 得意な物を交換する島", rules: { start: fill(12, "trade") } },
    one: { label: "C 略奪の村が1つ現れる(真似なし)", rules: { start: ["raid", ...fill(11, "trade")] } },
    spread: { label: "D 略奪が真似されて広がる", rules: { start: ["raid", ...fill(11, "trade")], copy: ["trade", "raid"] } },
    tft: { label: "E 仕返しの村がある", rules: { start: ["raid", "tft", "trade", "tft", "trade", "trade", "raid", "tft", "trade", "tft", "trade", "trade"], copy: ["trade", "raid", "tft"] } },
    lord: { label: "F 年貢を取って守る村がある", rules: { start: ["lord", "trade", "trade", "trade", "lord", "trade", "trade", "trade", "lord", "trade", "trade", "trade"] } },
    hungry: { label: "G 飢えた年だけ奪う", rules: { start: fill(12, "hungry") } },
    mix: { label: "H 全部を混ぜた島(300年)", rules: { start: ["trade", "raid", "tft", "lord", "trade", "raid", "tft", "lord", "trade", "raid", "tft", "lord"], copy: ["trade", "raid", "tft", "lord"] }, years: 300 },
  },
  charts: [
    { title: "島全体の人口", fmt: "people", lines: [{ key: "pop", name: "人口", color: "#2f8f6b" }] },
    { title: "やり方ごとの村の数", fmt: "num1", lines: [{ key: "trade", name: "交換", color: "#4a7fb5" }, { key: "raid", name: "略奪", color: "#b4473b" }, { key: "tft", name: "仕返し", color: "#c9a45c" }, { key: "lord", name: "年貢", color: "#8a6fb3" }] },
  ],
  metrics: [
    { key: "pop", label: "最後の年の人口", fmt: "people" },
    { key: "raids", label: "襲撃の回数", fmt: "num1", sub: "1年あたり" },
    { key: "raid", label: "略奪の村", fmt: "villages" },
    { key: "tft", label: "仕返しの村", fmt: "villages" },
  ],
  reference: { self: { pop: 1630 }, trade: { pop: 3510 }, spread: { pop: 260 }, tft: { tft: 9 }, lord: { pop: 2250 }, mix: { pop: 3220 } },
  advise(m, rules) {
    const out = [], s = rules.start;
    if (s.every((x) => x === "trade")) out.push("得意な物に特化して交換すると、同じ土地でも養える人数が増えます(比較優位)。");
    if (rules.copy?.length === 2) out.push("奪う村は最初は伸びますが、真似が広がると襲い合いになり、交換の相手もいなくなって島全体が貧しくなります(囚人のジレンマ)。");
    if (s.includes("tft")) out.push("ふだんは交換し、襲われた次の年だけやり返す村があると、奪う側は損をするようになり、真似は仕返しの側に広がります。");
    if (s.includes("lord") && !s.includes("raid")) out.push("全部を奪わずに一部を取って守るやり方は、相手を生かすので略奪より栄えます。ただし取り分があるぶん、交換だけの島には届きません。");
    if (s.every((x) => x === "hungry")) out.push("ふだん交換している島では、凶作の年でも蓄えが厚く、襲撃は少なくて済みます。");
    return out;
  },
  frames(rules, seed, years) {
    const detail = [];
    this.run(rules, seed, years, detail);
    const frames = thin(detail.map((d, x) => ({ ...d, x }))).map((d) => {
      const total = d.v.reduce((a, b) => a + b.pop, 0), raid = d.v.filter((b) => b.s === "raid").length, tft = d.v.filter((b) => b.s === "tft").length;
      return { label: `${d.x}年目`, caption: `${d.x}年目:島の人口は${Math.round(total).toLocaleString("ja-JP")}人。略奪の村 ${raid}、仕返しの村 ${tft}。${d.raids ? `この年の襲撃は${d.raids}回。` : ""}`,
        flows: d.moves,
        gauges: [{ label: "島の人口", text: `${Math.round(total).toLocaleString("ja-JP")}人`, value: total / 3600, color: "#2f8f6b" }],
        zones: d.v.map((b, i) => ({ name: `村${i + 1}`, note: LABEL[b.s], color: COLOR[b.s], count: b.pop, hideBar: true, build: { self: "field", trade: "market", raid: "fort", tft: "tower", lord: "manor", hungry: "market" }[b.s] })) };
    });
    return { frames, opts: { layout: "ring", sub: "色は村のやり方(青=交換、赤=略奪、金=仕返し、紫=年貢)。赤い玉は襲撃、水色の玉は交易の荷。", maxFigures: 420 } };
  },
  run(rules, seed, years, detail = null) {
    const rng = makeRng(seed), A = ISLAND_ASSUMPTIONS, n = 12;
    const v = rules.start.map((s) => ({ s, pop: 100, hit: -9, score: 0, take: 0 }));
    const nb = (i) => [v[(i + n - 1) % n], v[(i + 1) % n]];
    const friendly = (a) => a.s !== "raid" && a.s !== "self" && a.s !== "lord"; // 年貢の村は自分では交換せず、取り分で暮らす
    const series = [];
    let raidsTotal = 0;
    for (let year = 0; year <= years; year++) {
      const bad = rng.next() < A.badYear.value;
      let raids = 0;
      const moves = [];
      const protectedBy = v.map((_, i) => nb(i).some((x) => x.s === "lord") || v[i].s === "lord");
      // 1) その年に養える人数
      const cap = v.map((a, i) => {
        let k = A.land.value;
        if (friendly(a)) for (const b of nb(i)) {
          const angry = (a.s === "tft" && b.s === "raid") || (b.s === "tft" && a.s === "raid");
          if (friendly(b) && !angry) k += A.land.value * A.trade.value;
        }
        if (a.s === "lord") k = A.land.value * 0.5 + nb(i).filter((b) => b.s !== "lord").length * A.land.value * (1 + A.trade.value) * A.tribute.value * 1.2;
        else if (nb(i).some((b) => b.s === "lord")) k *= 1 - A.tribute.value;
        return k * (bad ? 0.75 : 1);
      });
      // 2) 襲撃と仕返し
      v.forEach((a, i) => {
        const wants = a.s === "raid" || (a.s === "hungry" && bad && a.pop > cap[i] * 1.12) || (a.s === "tft" && a.hit === year - 1);
        if (!wants || a.pop < 5) return;
        let targets = nb(i).map((b, j) => ({ b, idx: (i + (j ? 1 : n - 1)) % n }));
        if (a.s === "tft") targets = targets.filter((t) => t.b.lastRaider === year - 1 || t.b.s === "raid");
        targets = targets.filter((t) => !(protectedBy[t.idx] && a.s !== "tft") && t.b.pop > 18); // 小さくなりすぎた村は、襲っても得るものが無い
        if (!targets.length) return;
        // 仕返しの村は守りが固いので、襲う側はまず他の村を狙う
        const t = targets.sort((x, y) => (x.b.s === "tft") - (y.b.s === "tft") || y.b.pop - x.b.pop)[0].b;
        const guarded = t.s === "tft" && a.s !== "tft";
        const lost = t.pop * A.loot.value * (guarded ? 0.3 : 1);
        t.pop -= lost; a.pop += lost * A.gain.value - a.pop * (A.cost.value + (guarded ? 0.2 : 0));
        t.take -= lost; a.take += lost * A.gain.value - (guarded ? a.pop * 0.2 : 0);
        if (a.s !== "tft") t.hit = year;
        moves.push({ from: i, to: v.indexOf(t), color: a.s === "tft" ? "#e6c56a" : "#d2584c", n: 4 }); // 襲いに行く人(仕返しは金色)
        raids++;
      });
      // 3) 人口が、養える人数に近づく
      v.forEach((a, i) => {
        a.score += (Math.min(a.pop, cap[i]) + a.take) / Math.max(a.pop, 1); a.take = 0; // 1人あたりの食料(奪った分・奪われた分を含む)
        a.pop = Math.max(2, a.pop + A.growth.value * a.pop * (1 - a.pop / cap[i]));
      });
      // 4) うまくいっている隣村を真似る
      if (rules.copy && year > 0 && year % A.copy.value === 0) {
        const rate = v.map((a) => a.score);
        const next = v.map((a, i) => {
          const cands = [i, (i + n - 1) % n, (i + 1) % n].filter((j) => rules.copy.includes(v[j].s));
          const best = cands.sort((x, y) => rate[y] - rate[x])[0];
          return best != null && best !== i && rate[best] > rate[i] * (a.s === "tft" ? 1.15 : 1) && rng.next() < 0.5 ? v[best].s : a.s; // 仕返しの村は、はっきり差があるときだけやり方を変える
        });
        v.forEach((a, i) => { a.s = next[i]; a.score = 0; });
      }
      raidsTotal += raids;
      if (detail) {
        // 交換している隣どうしには、荷を運ぶ人が行き来する
        v.forEach((a, i) => { const b = v[(i + 1) % n]; if (friendly(a) && friendly(b) && !((a.s === "tft" && b.s === "raid") || (b.s === "tft" && a.s === "raid"))) moves.push({ from: i, to: (i + 1) % n, color: "#8ab8ff", n: 1, back: true }); });
        detail.push({ v: v.map((a) => ({ s: a.s, pop: a.pop })), moves, raids });
      }
      const count = (s) => v.filter((a) => a.s === s).length;
      series.push({ x: year, pop: v.reduce((x, a) => x + a.pop, 0), trade: count("trade") + count("hungry"), raid: count("raid"), tft: count("tft"), lord: count("lord") });
    }
    const last = series[years];
    return { series, summary: { pop: last.pop, raids: raidsTotal / (years + 1), raid: last.raid, tft: last.tft } };
  },
};
