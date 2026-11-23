// 学び方のシミュレーター:霧の山で頂上(100点)を探す。「とにかく数をこなす」と
// 「失敗したら立ち止まってふり返る」のどちらが上へ行けるかを、山の形を変えて試す。
import { makeRng, clamp } from "./rng.js";

export const CLIMB_ASSUMPTIONS = {
  step: { value: 0.031, note: "数をこなす人が1日に試す範囲(山の幅 = 1)。6%の確率で、まったく別の場所へ跳ぶ" },
  reflectDays: { value: 4, note: "ふり返る人が、失敗のあとに登り坂の向きを調べる日数。その間は進まない" },
  stride: { value: 0.022, note: "ふり返る人が、調べた向きへ1日に進む距離" },
  noise: { value: 78, note: "「運が混ざる山」で、結果に混ざるブレの大きさ(点)" },
  survey: { value: 25, note: "ふり返る人が、4日のあいだに周りを測る回数(1日5回)。運のブレは、回数の平方根ぶんだけ小さくなる" },
  bumps: { value: 45, note: "「でこぼこの山」にある小さな頂上の数(高さ6〜26点)" },
  streak: { value: 3, note: "混ぜた人が、ふり返りに切り替える連続失敗の回数" },
};

function makeHill(kind, rng) {
  const peaks = [];
  if (kind === "rugged") for (let i = 0; i < CLIMB_ASSUMPTIONS.bumps.value; i++) peaks.push({ x: rng.next(), y: rng.next(), h: 6 + rng.next() * 20, w: 0.004 + rng.next() * 0.006 });
  const main = { x: 0.75, y: 0.7 };
  return (x, y, day = 0) => {
    const mx = kind === "moving" ? 0.5 + 0.28 * Math.cos(day / 60) : main.x, my = kind === "moving" ? 0.5 + 0.28 * Math.sin(day / 60) : main.y;
    const wide = kind === "rugged" ? 0.012 : 0.18;
    let h = 100 * Math.exp(-((x - mx) ** 2 + (y - my) ** 2) / wide);
    for (const p of peaks) h = Math.max(h, p.h * Math.exp(-((x - p.x) ** 2 + (y - p.y) ** 2) / p.w));
    return h;
  };
}

export const climb = {
  key: "climb", title: "学び方", years: 360, xLabel: "日", runs: 60, initial: "rugged_volume",
  lead: "「とにかく数をこなす人」と「失敗したら立ち止まってふり返る人」のどちらが1年後に上へ行けるかを、山の形を変えて試します。",
  note: "霧で、いまいる場所の高さしか分かりません。頂上は100点です。360日歩きます。",
  assumptions: CLIMB_ASSUMPTIONS,
  presets: {
    smooth_volume: { label: "A なだらかな山 × 数をこなす", rules: { hill: "smooth", who: "volume" } },
    smooth_reflect: { label: "B なだらかな山 × ふり返る", rules: { hill: "smooth", who: "reflect" } },
    rugged_volume: { label: "C でこぼこの山 × 数をこなす", rules: { hill: "rugged", who: "volume" } },
    rugged_reflect: { label: "D でこぼこの山 × ふり返る", rules: { hill: "rugged", who: "reflect" } },
    noisy_volume: { label: "E 運が混ざる山 × 数をこなす", rules: { hill: "noisy", who: "volume" } },
    noisy_reflect: { label: "F 運が混ざる山 × ふり返る", rules: { hill: "noisy", who: "reflect" } },
    rugged_mixed: { label: "G でこぼこの山 × 混ぜた人", rules: { hill: "rugged", who: "mixed" } },
    moving_mixed: { label: "H 頂上が動く山 × 混ぜた人", rules: { hill: "moving", who: "mixed" } },
  },
  charts: [{ title: "いまいる場所の高さ", fmt: "points", lines: [{ key: "score", name: "高さ(平均)", color: "#2f8f6b" }] }],
  metrics: [
    { key: "score", label: "1年後の高さ", fmt: "points" },
    { key: "day90", label: "90点に届くまで", fmt: "days", sub: "届かない回は360日として平均" },
    { key: "reached", label: "90点に届いた割合", fmt: "pct" },
  ],
  reference: {
    smooth_volume: { day90: 53 }, smooth_reflect: { day90: 31 },
    rugged_volume: { score: 73 }, rugged_reflect: { score: 16 },
    noisy_volume: { score: 42 }, noisy_reflect: { score: 24 },
  },
  advise(m, rules) {
    const out = [];
    if (rules.hill === "smooth") out.push("頂上が1つの山では、登り坂の向きを確かめてから進むほうが、無駄な試しが少なく早く上に着きます。");
    if (rules.hill === "rugged") out.push("小さな頂上がたくさんある山では、近くだけを丁寧に調べると手前の小山で止まります。遠くへ跳ぶ試しが、大きな頂上を見つける役に立ちます。");
    if (rules.hill === "noisy") out.push("結果に運が混ざると、たまたまの成功や失敗から間違った教訓を引き出しやすくなり、どちらのやり方も伸び悩みます。");
    if (rules.who === "mixed") out.push("ふだんは数をこなし、失敗が続いたときだけ立ち止まってふり返ると、両方の良いところを使えます。");
    return out;
  },
  frames(rules, seed, years) {
    const hillSeed = seed * 7 + 3, paths = [];
    for (let i = 0; i < 24; i++) { const path = []; this.run(rules, seed * 100 + i, years, { hillSeed, path }); paths.push(path); }
    const who = { volume: "数をこなす人", reflect: "ふり返る人", mixed: "混ぜた人" }[rules.who];
    const height = makeHill(rules.hill, makeRng(hillSeed));
    return { terrain: { height: (x, y) => height(x, y, 0), paths, labelOf: (d) => `${d}日目`,
      caption: (d, avg) => `${d}日目:${who}24人の平均は${Math.round(avg)}点。${rules.hill === "moving" ? "(頂上は少しずつ動いています。地形は最初の日の形です)" : ""}` } };
  },
  run(rules, seed, years, detail = null) {
    const rng = makeRng(seed), A = CLIMB_ASSUMPTIONS;
    const hill = makeHill(rules.hill, detail ? makeRng(detail.hillSeed) : rng);
    const noise = rules.hill === "noisy" ? detail?.tune?.noise ?? A.noise.value : 0;
    const see = (x, y, d) => hill(x, y, d) + noise * rng.normal();
    let x = 0.12, y = 0.12, pause = 0, fails = 0, dir = [0.7, 0.7], day90 = null;
    // 運が混ざる山では、いまいる場所の点数を測り直さず、着いたときに見えた点数(まぐれを含む)を覚えている
    let mem = see(x, y, 0);
    const k = detail?.tune ?? {}, survey = k.survey ?? A.survey.value;
    const series = [];
    const reflect = (d) => { // まわりの4点を調べて、登り坂の向きを決める
      // 4日かけて、まわりを何度か測って平均する(運のブレは、測る回数の平方根ぶんだけ小さくなる)
      const e = 0.03, look = (px, py) => hill(px, py, d) + (noise / Math.sqrt(survey)) * rng.normal();
      const gx = look(x + e, y) - look(x - e, y), gy = look(x, y + e) - look(x, y - e), len = Math.hypot(gx, gy) || 1;
      dir = [gx / len, gy / len];
    };
    for (let d = 0; d <= years; d++) {
      const here = noise ? mem : see(x, y, d);
      const tryVolume = () => {
        const far = rng.next() < 0.06, ang = rng.next() * Math.PI * 2, len = rng.next() * A.step.value;
        const nx = far ? rng.next() : clamp(x + Math.cos(ang) * len, 0, 1), ny = far ? rng.next() : clamp(y + Math.sin(ang) * len, 0, 1);
        const seen = see(nx, ny, d);
        if (seen > here) { x = nx; y = ny; mem = seen; return true; }
        return false;
      };
      if (pause > 0) { if (--pause === 0) { reflect(d); x = clamp(x + dir[0] * A.stride.value, 0, 1); y = clamp(y + dir[1] * A.stride.value, 0, 1); mem = see(x, y, d); fails = 0; } }
      else if (rules.who === "volume") tryVolume();
      else if (rules.who === "reflect") {
        const nx = clamp(x + dir[0] * A.stride.value, 0, 1), ny = clamp(y + dir[1] * A.stride.value, 0, 1);
        const seen = see(nx, ny, d);
        if (seen > here) { x = nx; y = ny; mem = seen; } else pause = A.reflectDays.value;
      } else { if (tryVolume()) fails = 0; else if (++fails >= A.streak.value) pause = A.reflectDays.value; }
      const score = hill(x, y, d);
      if (day90 == null && score >= 90) day90 = d;
      series.push({ x: d, score });
      detail?.path.push({ x, y });
    }
    return { series, summary: { score: series[years].score, day90: day90 ?? years, reached: day90 == null ? 0 : 1 } };
  },
};
