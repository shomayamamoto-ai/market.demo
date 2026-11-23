// 理論で確かめられるシミュレーション。
// どれも、数式で正解(理論値)が分かっているか、論文で結果が報告されているモデル。
// シミュレーションの結果と理論値を並べて、このツールの計算がどれだけ合っているかを確かめられる。
import { makeRng, clamp } from "./rng.js";
import { thin } from "./stage3d.js";

// ---- 数学の部品 ----
const phi = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); // 標準正規分布の密度
const Phi = (z) => { // 標準正規分布の累積(Abramowitz & Stegun 26.2.17、誤差 7.5e-8 未満)
  const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = phi(z) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - d : d;
};
const PhiInv = (p) => { let lo = -8, hi = 8; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (Phi(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
// 待ち行列 M/M/c:待たされる確率(アーランC式)
export function erlangC(c, a) {
  if (a >= c) return 1;
  let sum = 0, term = 1;
  for (let k = 0; k < c; k++) { if (k > 0) term *= a / k; sum += term; }
  const last = (term * a) / c / (1 - a / c);
  return last / (sum + last);
}
// 感染の最終規模:z = 1 − exp(−R0·z) の解
export function finalSize(r0) { if (r0 <= 1) return 0; let z = 0.9; for (let i = 0; i < 200; i++) z = 1 - Math.exp(-r0 * z); return z; }

// ============ 1) 窓口の待ち行列 ============
export const queue = {
  key: "queue", title: "窓口の待ち行列", years: 480, xLabel: "分", runs: 20, initial: "three",
  lead: "窓口や担当者の数を1人変えると、待ち時間がどれだけ変わるかを試します。",
  note: "客はばらばらに来店し、対応時間も人によって違います(どちらも平均だけが決まった、でたらめな間隔)。混み具合が100%に近づくと、待ち時間は急に延びます。",
  assumptions: {
    arrival: { value: "ポアソン到着", note: "客が来る間隔は指数分布(平均だけが決まり、互いに無関係に来る)" },
    service: { value: "指数分布", note: "1人の対応にかかる時間も指数分布。現実は、これよりばらつきが小さいことが多い" },
    warmup: { value: "最初の2,000人", note: "空の状態から始まる影響を除くため、集計から外す人数" },
    theory: { value: "アーランC式", note: "待たされる割合と平均の待ち時間の理論値。A. K. Erlang (1917) による" },
  },
  presets: {
    two: { label: "A 窓口2つ(混み具合 90%)", rules: { rate: 18, minutes: 6, desks: 2 } },
    three: { label: "B 窓口3つ(混み具合 60%)", rules: { rate: 18, minutes: 6, desks: 3 } },
    four: { label: "C 窓口4つ(混み具合 45%)", rules: { rate: 18, minutes: 6, desks: 4 } },
    fast: { label: "D 窓口2つのまま、対応を5分に短縮", rules: { rate: 18, minutes: 5, desks: 2 } },
  },
  params: [{ key: "rate", label: "1時間に来る客(人)", value: 18, min: 1, max: 200 }, { key: "minutes", label: "1人の対応時間(分)", value: 6, min: 1, max: 60, step: 0.5 }, { key: "desks", label: "窓口の数", value: 3, min: 1, max: 30 }],
  charts: [{ title: "待っている人数(営業開始からの8時間、平均)", fmt: "num1", lines: [{ key: "waiting", name: "待っている人", color: "#b4473b" }] }],
  metrics: [
    { key: "wait", label: "平均の待ち時間", fmt: "min1" }, { key: "pWait", label: "待たされる人の割合", fmt: "pct1" },
    { key: "load", label: "窓口の混み具合", fmt: "pct", sub: "対応中の時間の割合" }, { key: "p10", label: "10分以上待つ人", fmt: "pct1" },
  ],
  verify(m, r) {
    const lam = r.rate / 60, mu = 1 / r.minutes, a = lam / mu;
    if (a >= r.desks) return [{ label: "平均の待ち時間", model: m.wait, theory: Infinity, fmt: "min1" }];
    const C = erlangC(r.desks, a), w = C / (r.desks * mu - lam);
    return [{ label: "待たされる人の割合", model: m.pWait, theory: C, fmt: "pct1" }, { label: "平均の待ち時間", model: m.wait, theory: w, fmt: "min1" },
      { label: "窓口の混み具合", model: m.load, theory: a / r.desks, fmt: "pct1" }, { label: "10分以上待つ人", model: m.p10, theory: C * Math.exp(-(r.desks * mu - lam) * 10), fmt: "pct1" }];
  },
  advise(m, r) {
    const out = [], a = (r.rate / 60) * r.minutes;
    if (a >= r.desks) return ["来る客の数が、窓口でさばける数を超えています。行列は伸び続けます。"];
    if (a / r.desks > 0.85) out.push(`混み具合が${Math.round((a / r.desks) * 100)}%です。平均では足りていても、来る間隔のばらつきで長い行列ができます。`);
    const C1 = erlangC(r.desks + 1, a), w1 = C1 / ((r.desks + 1) / r.minutes - r.rate / 60);
    out.push(`窓口を1つ増やすと、平均の待ち時間は理論上 ${m.wait.toFixed(1)}分 → ${w1.toFixed(1)}分になります。`);
    if (a / r.desks < 0.5) out.push("窓口に余裕があります。1つ減らした場合も試してみてください。");
    return out;
  },
  frames(r, seed) {
    const out = this.run(r, seed, 480, true);
    const frames = thin(out.trace, 61).map((s) => ({ label: `${Math.floor(s.t / 60)}時間${String(Math.round(s.t % 60)).padStart(2, "0")}分`,
      caption: `営業開始から${Math.round(s.t)}分:待っている人 ${s.waiting}人、対応中 ${s.busy}人、対応を終えた人 ${s.done}人。`,
      zones: [{ name: "待っている人", color: "#b4473b", count: s.waiting, build: "plaza" }, { name: "窓口で対応中", color: "#c9a45c", count: s.busy, build: "office" }, { name: "対応を終えた人", color: "#2f8f6b", count: s.done, build: "houses" }] }));
    return { frames, opts: { sub: `窓口${r.desks}つ、1時間に${r.rate}人が来店。`, maxFigures: 400 } };
  },
  run(r, seed, years, withTrace = false) {
    const rng = makeRng(seed), lam = r.rate / 60, mu = 1 / r.minutes, c = Math.round(r.desks);
    const exp = (rate) => -Math.log(Math.max(rng.next(), 1e-12)) / rate;
    const N = withTrace ? 400 : 12000, warm = withTrace ? 0 : 2000;
    const free = Array(c).fill(0); // 各窓口が空く時刻
    let t = 0, waitSum = 0, waited = 0, over10 = 0, busyTime = 0, n = 0;
    const events = [];
    for (let i = 0; i < N; i++) {
      t += exp(lam);
      let k = 0; for (let j = 1; j < c; j++) if (free[j] < free[k]) k = j; // いちばん早く空く窓口
      const start = Math.max(t, free[k]), s = exp(mu);
      free[k] = start + s;
      if (withTrace) events.push({ arrive: t, start, end: start + s });
      if (i >= warm) { const w = start - t; waitSum += w; if (w > 1e-9) waited++; if (w >= 10) over10++; busyTime += s; n++; }
    }
    const series = [], trace = [];
    if (withTrace) for (let m = 0; m <= years; m += 4) trace.push({ t: m, waiting: events.filter((e) => e.arrive <= m && e.start > m).length, busy: events.filter((e) => e.start <= m && e.end > m).length, done: events.filter((e) => e.end <= m).length });
    // グラフ用:空の状態から始めた8時間の、待っている人数
    {
      const f2 = Array(c).fill(0), ev = []; let tt = 0;
      while (tt < years) { tt += exp(lam); let k = 0; for (let j = 1; j < c; j++) if (f2[j] < f2[k]) k = j; const st = Math.max(tt, f2[k]); f2[k] = st + exp(mu); ev.push([tt, st]); }
      for (let m = 0; m <= years; m += 10) series.push({ x: m, waiting: ev.filter((e) => e[0] <= m && e[1] > m).length });
    }
    const span = t - (warm ? 0 : 0);
    return { series, trace, summary: { wait: waitSum / n, pWait: waited / n, p10: over10 / n, load: clamp(busyTime / (c * (n / lam)), 0, 1) }, span };
  },
};

// ============ 2) 口コミと感染の広がり ============
export const spreadModel = {
  key: "contagion", title: "口コミと感染の広がり", years: 120, xLabel: "日", runs: 40, initial: "r25",
  lead: "1人が何人に広げるかで、最終的にどこまで広がるかが決まります。うわさ、流行、感染症に共通する仕組みです。",
  note: "1,000人の集団。広げている人は、毎日でたらめに選んだ相手に伝え、平均5日で広げるのをやめます。最初に広げているのは5人です。",
  assumptions: {
    mixing: { value: "一様に混ざる", note: "だれもが、だれとでも同じ確率で出会う。現実の人づきあいの偏りは入っていない" },
    recover: { value: "平均5日", note: "広げ続ける日数。毎日、5分の1の確率でやめる" },
    theory: { value: "最終規模方程式", note: "広がった割合 z は z = 1 − exp(−R0·z) を満たす。Kermack & McKendrick (1927) による" },
    takeoff: { value: "10%以上", note: "「広がった回」とみなす基準。少人数で途絶えた回は、広がった割合の平均から外す" },
  },
  presets: {
    r08: { label: "A 1人が0.8人に広げる", rules: { r0: 0.8 } }, r15: { label: "B 1人が1.5人に広げる", rules: { r0: 1.5 } },
    r25: { label: "C 1人が2.5人に広げる", rules: { r0: 2.5 } }, r40: { label: "D 1人が4人に広げる", rules: { r0: 4 } },
    cut: { label: "E 2.5人だが、4割の人が最初から受け付けない", rules: { r0: 2.5, immune: 0.4 } },
  },
  params: [{ key: "r0", label: "1人が広げる人数", value: 2.5, min: 0.2, max: 8, step: 0.1 }],
  charts: [{ title: "集団の内訳", lines: [{ key: "s", name: "まだ知らない人", color: "#8b93a7" }, { key: "i", name: "広げている人", color: "#b4473b" }, { key: "r", name: "広げ終えた人", color: "#2f8f6b" }] }],
  conditional: ["final", "peak", "peakDay"],
  metrics: [
    { key: "final", label: "最終的に広がった割合", fmt: "pct1", sub: "広がった回の平均" }, { key: "took", label: "広がった回の割合", fmt: "pct" },
    { key: "peak", label: "同時に広げていた人の最大", fmt: "pct1" }, { key: "peakDay", label: "ピークの日", fmt: "num0" },
  ],
  verify(m, r) {
    const open = 1 - (r.immune ?? 0), eff = r.r0 * open, z = finalSize(eff) * open;
    return [{ label: "最終的に広がった割合", model: m.final, theory: z, fmt: "pct1", note: eff <= 1 ? "1人が広げる人数が実質1以下なので、理論上は広がらない" : "" }];
  },
  advise(m, r) {
    const eff = r.r0 * (1 - (r.immune ?? 0)), out = [];
    out.push(eff <= 1 ? "1人が広げる人数が1人以下だと、広がりは自然に途絶えます。" : `1人が実質${eff.toFixed(1)}人に広げるので、放っておくと全体の${Math.round(finalSize(eff) * (1 - (r.immune ?? 0)) * 100)}%まで広がります。`);
    if (eff > 1) out.push(`広がりを止めるには、広げる人数を${(1 / (1 - (r.immune ?? 0))).toFixed(1)}人以下にするか、全体の${Math.round((1 - 1 / r.r0) * 100)}%が受け付けない状態にする必要があります。`);
    return out;
  },
  frames(r, seed, years) {
    const frames = thin(this.run(r, seed, years).series.filter((s) => s.x <= 70), 61).map((s) => ({ label: `${s.x}日目`,
      caption: `${s.x}日目:広げている人 ${Math.round(s.i * 1000)}人、広げ終えた人 ${Math.round(s.r * 1000)}人、まだ知らない人 ${Math.round(s.s * 1000)}人。`,
      zones: [{ name: "まだ知らない人", color: "#8b93a7", count: s.s * 1000, build: "houses" }, { name: "広げている人", color: "#b4473b", count: s.i * 1000, build: "plaza" }, { name: "広げ終えた人", color: "#2f8f6b", count: s.r * 1000, build: "house" }] }));
    return { frames, opts: { sub: `1人が${r.r0}人に広げる。` } };
  },
  run(r, seed, years) {
    const rng = makeRng(seed), N = 1000, gamma = 0.2, beta = r.r0 * gamma;
    let S = Math.round(N * (1 - (r.immune ?? 0))) - 5, I = 5, Rm = 0, peak = 0, peakDay = 0;
    const immune = N - S - I, series = [];
    const binom = (n, p) => { let k = 0; for (let j = 0; j < n; j++) if (rng.next() < p) k++; return k; };
    for (let d = 0; d <= years; d++) {
      series.push({ x: d, s: (S + immune) / N, i: I / N, r: Rm / N });
      if (I / N > peak) { peak = I / N; peakDay = d; }
      const newI = binom(S, 1 - Math.exp(-beta * I / N)), newR = binom(I, gamma); // 毎日5分の1がやめる = 平均ちょうど5日
      S -= newI; I += newI - newR; Rm += newR;
    }
    const final = (Rm + I) / N, took = final >= 0.1 ? 1 : 0;
    return { series, summary: { final, took, peak, peakDay }, weightKey: "took" };
  },
};

// ============ 3) 住み分け ============
export const schelling = {
  key: "schelling", title: "住み分け", years: 40, xLabel: "回", runs: 15, initial: "t30",
  lead: "「近所の何割かは自分と同じ仲間でいてほしい」という弱い好みだけで、町がどれだけ分かれるかを試します。",
  note: "30×30のマス目に、2つのグループが半分ずつ住みます(1割は空き地)。まわりの8マスの仲間の割合が希望に届かない人は、空いている場所へ引っ越します。",
  assumptions: {
    grid: { value: "30×30・空き地10%", note: "町の大きさと空き地の割合。端は反対側につながっているとみなす" },
    move: { value: "でたらめな空き地へ", note: "不満な人は、空き地をでたらめに1つ選んで移る(移った先に満足するとは限らない)" },
    origin: { value: "Schelling (1971)", note: "Thomas C. Schelling が示したモデル。個人の弱い好みが、だれも望んでいない強い分離を生む" },
  },
  presets: {
    t20: { label: "A 仲間が2割いればよい", rules: { want: 0.2 } }, t30: { label: "B 仲間が3割いればよい", rules: { want: 0.3 } },
    t50: { label: "C 仲間が半分いればよい", rules: { want: 0.5 } }, t70: { label: "D 仲間が7割ほしい", rules: { want: 0.7 } },
  },
  params: [{ key: "want", label: "ほしい仲間の割合(%)", value: 30, min: 0, max: 90, step: 5, scale: 100 }],
  charts: [{ title: "近所に占める仲間の割合と、不満な人", lines: [{ key: "similar", name: "近所の仲間の割合", color: "#b4473b" }, { key: "unhappy", name: "不満な人", color: "#8b93a7" }] }],
  metrics: [
    { key: "similar", label: "近所に占める仲間の割合", fmt: "pct1", sub: "最初は約50%" }, { key: "unhappy", label: "不満な人の割合", fmt: "pct1" },
    { key: "moves", label: "引っ越しの回数", fmt: "num0", sub: "1人あたり×100" },
  ],
  advise(m, r) {
    const out = [];
    if (m.similar > r.want + 0.2) out.push(`ほしい仲間は${Math.round(r.want * 100)}%なのに、結果として近所の${Math.round(m.similar * 100)}%が仲間になりました。だれも望んでいない強さの住み分けが、弱い好みの積み重ねで生まれています。`);
    if (m.unhappy > 0.2) out.push("希望が高すぎて、落ち着く場所が見つからない人が多く残りました。引っ越しが止まりません。");
    return out;
  },
  extra(r, seed) {
    const cells = this.run(r, seed, this.years, true).cells, c = ["var(--soft)", "#b4473b", "#4a7fb5"];
    return `<h3>町の地図(1回分の最後の状態)</h3><div class="town-map">${cells.map((v) => `<i style="background:${c[v]}"></i>`).join("")}</div><p class="note">赤と青が2つのグループ、薄い色が空き地です。</p>`;
  },
  run(r, seed, years, keep = false) {
    const rng = makeRng(seed), W = 30, N = W * W, g = new Int8Array(N);
    for (let i = 0; i < N; i++) g[i] = i < N * 0.1 ? 0 : i % 2 ? 1 : 2;
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; }
    const stat = (i) => { let same = 0, all = 0; const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const v = g[((y + dy + W) % W) * W + ((x + dx + W) % W)]; if (v) { all++; if (v === g[i]) same++; } }
      return all ? same / all : 1; };
    const series = [];
    let moves = 0;
    for (let step = 0; step <= years; step++) {
      let sum = 0, people = 0; const bad = [];
      for (let i = 0; i < N; i++) if (g[i]) { const s = stat(i); sum += s; people++; if (s < r.want - 1e-9) bad.push(i); }
      series.push({ x: step, similar: sum / people, unhappy: bad.length / people });
      if (step === years) break;
      const empty = []; for (let i = 0; i < N; i++) if (!g[i]) empty.push(i);
      for (const i of bad.sort(() => rng.next() - 0.5)) { const k = Math.floor(rng.next() * empty.length), to = empty[k]; g[to] = g[i]; g[i] = 0; empty[k] = i; moves++; }
    }
    const last = series[years];
    return { series, cells: keep ? Array.from(g) : null, summary: { similar: last.similar, unhappy: last.unhappy, moves: (moves / (N * 0.9)) * 100 } };
  },
};

// ============ 4) 仕入れ量 ============
export const newsvendor = {
  key: "stock", title: "仕入れ量", years: 60, xLabel: "日", runs: 30, initial: "mean",
  lead: "売れ残れば損、足りなければ売り逃し。日持ちしない商品を、毎日いくつ仕入れるのがよいかを試します。",
  note: "1日の売れる数は平均100個で、日によって±20個ほどばらつきます(正規分布)。売れ残りは処分価格でしか売れません。",
  assumptions: {
    demand: { value: "正規分布", note: "1日の需要のばらつき方。現実は、天気や曜日でかたよることが多い" },
    theory: { value: "臨界比", note: "最もよい仕入れ量は「売れる確率が (売値−原価)÷(売値−処分価格) になる量」。新聞売り子問題として知られる(Arrow, Harris & Marschak 1951 ほか)" },
    days: { value: "1回の試行で2,000日", note: "利益の平均を取る日数" },
    human: { value: 0.7, note: "条件Eで使う、人の偏りの強さ(0=最適、1=平均どおり)。Schweitzer, M. E. & Cachon, G. P. (2000) Management Science 46(3) の実験結果から計算した0.64と0.79の中間" },
  },
  presets: {
    mean: { label: "A 平均どおりに100個", rules: { order: 100 } }, best: { label: "B 理論上いちばん得な量", rules: { order: 0 } },
    more: { label: "C 多めに130個", rules: { order: 130 } }, less: { label: "D 少なめに80個", rules: { order: 80 } },
    human: { label: "E 人が決めると(実験での偏り)", rules: { order: -1 } },
  },
  params: [{ key: "order", label: "仕入れ量(個。0なら理論の最適量)", value: 100, min: 0, max: 400 }, { key: "price", label: "売値(円)", value: 300, min: 1, max: 100000 },
    { key: "cost", label: "原価(円)", value: 120, min: 0, max: 100000 }, { key: "salvage", label: "処分価格(円)", value: 30, min: 0, max: 100000 }],
  charts: [{ title: "日々の利益(最初の60日、平均)", fmt: "yen", lines: [{ key: "profit", name: "利益", color: "#2f8f6b" }] }],
  metrics: [
    { key: "profit", label: "1日あたりの利益", fmt: "yen" }, { key: "order", label: "仕入れ量", fmt: "num0" },
    { key: "soldOut", label: "売り切れる日の割合", fmt: "pct1" }, { key: "waste", label: "売れ残り", fmt: "num1", sub: "1日あたり(個)" },
  ],
  setup(r) { const price = r.price ?? 300, cost = r.cost ?? 120, salvage = Math.min(r.salvage ?? 30, cost), mu = 100, sd = 20, ratio = clamp((price - cost) / Math.max(price - salvage, 1e-9), 0.001, 0.999), qBest = mu + sd * PhiInv(ratio);
    // 人の偏り:最適な量から平均のほうへ、差の約7割だけ引き寄せられる(Schweitzer & Cachon 2000 の2条件 0.64・0.79 の中間)
    return { price, cost, salvage, mu, sd, ratio, qBest, q: r.order > 0 ? r.order : r.order < 0 ? qBest + 0.7 * (mu - qBest) : qBest }; },
  verify(m, r) {
    const s = this.setup(r), z = (s.q - s.mu) / s.sd, loss = phi(z) - z * (1 - Phi(z)); // 売り逃しの期待値(標準化)
    const sold = s.mu - s.sd * loss, profit = (s.price - s.salvage) * sold - (s.cost - s.salvage) * s.q, zb = (s.qBest - s.mu) / s.sd;
    const best = (s.price - s.salvage) * (s.mu - s.sd * (phi(zb) - zb * (1 - Phi(zb)))) - (s.cost - s.salvage) * s.qBest;
    return [{ label: "1日あたりの利益", model: m.profit, theory: profit, fmt: "yen" }, { label: "売り切れる日の割合", model: m.soldOut, theory: 1 - Phi(z), fmt: "pct1" },
      { label: "売れ残り(個)", model: m.waste, theory: s.q - sold, fmt: "num1" }, { label: "参考:最適な仕入れ量", model: s.q, theory: s.qBest, fmt: "num1", note: `その場合の利益 ${Math.round(best).toLocaleString("ja-JP")}円` }];
  },
  advise(m, r) {
    const s = this.setup(r), out = [`売値・原価・処分価格から決まる臨界比は${Math.round(s.ratio * 100)}%です。最もよい仕入れ量は約${Math.round(s.qBest)}個(平均${s.mu}個より${s.qBest >= s.mu ? "多め" : "少なめ"})になります。`];
    if (Math.abs(s.q - s.qBest) > 5) out.push(`いまの仕入れ量${Math.round(s.q)}個は、最適より${s.q > s.qBest ? "多く、売れ残りの損" : "少なく、売り逃しの損"}が出ています。`);
    const z = (q) => (q - s.mu) / s.sd, gain = (q) => (s.price - s.salvage) * (s.mu - s.sd * (phi(z(q)) - z(q) * (1 - Phi(z(q))))) - (s.cost - s.salvage) * q, qh = s.qBest + 0.7 * (s.mu - s.qBest);
    out.push(`実験では、人は最適な量から「平均」のほうへ6〜8割引き寄せられた量を発注しました(最適225個に対し平均177個、最適75個に対し平均134個。Schweitzer & Cachon 2000)。この条件に当てはめると約${Math.round(qh)}個で、利益は最適より1日${Math.round(gain(s.qBest) - gain(qh)).toLocaleString("ja-JP")}円少なくなります。`);
    return out;
  },
  run(r, seed, years) {
    const rng = makeRng(seed), s = this.setup(r), series = [], D = 2000;
    let profit = 0, soldOut = 0, waste = 0;
    for (let d = 0; d < D; d++) {
      const demand = Math.max(0, s.mu + s.sd * rng.normal()), sold = Math.min(demand, s.q), left = s.q - sold;
      const p = s.price * sold + s.salvage * left - s.cost * s.q;
      profit += p; waste += left; if (demand >= s.q) soldOut++;
      if (d <= years) series.push({ x: d, profit: p });
    }
    return { series, summary: { profit: profit / D, order: s.q, soldOut: soldOut / D, waste: waste / D } };
  },
};

// ============ 5) 税率と税収(ラッファー曲線) ============
// 1人ずつが「手取りの得」と「働く大変さ」を比べて働く量を決める。税率を上げると働く量が減り、税収はどこかで頭打ちになる。
// 効用 u = (1−τ)·w·h − h^(1+1/e)/(1+1/e) を最大にする h は (1−τ)·w の e 乗。ここでは式を使わず、1人ずつ数値で最大点を探す。
const bestHours = (net, e) => { const u = (h) => net * h - h ** (1 + 1 / e) / (1 + 1 / e); let lo = 0, hi = Math.max(1, net ** e * 3); for (let i = 0; i < 60; i++) { const a = lo + (hi - lo) * 0.382, b = lo + (hi - lo) * 0.618; if (u(a) < u(b)) lo = a; else hi = b; } return (lo + hi) / 2; };
export const laffer = {
  key: "laffer", title: "税率と税収", years: 100, xLabel: "税率(%)", runs: 5, initial: "t30",
  lead: "税率を上げると働く量が減るとき、税収がどこで頭打ちになるかを試します。",
  note: "400人が、手取りの得と働く大変さを比べて、働く量を1人ずつ決めます。<br>「弾力性」は、手取りが1%減ると働く量(課税される所得)が何%減るかを表します。文献での中位値は0.25です。",
  assumptions: {
    people: { value: 400, note: "人数。稼ぐ力は1人ずつ違う(対数正規分布)" },
    choice: { value: "数値で最大点を探す", note: "1人ずつ、手取り−働く大変さがいちばん大きくなる働く量を選ぶ" },
    flat: { value: "一律の税率", note: "全員に同じ税率がかかる単純な税。控除や累進は入れていない" },
    elasticity: { value: 0.25, note: "標準の弾力性。課税所得の弾力性の文献上の中位値(Saez, Slemrod & Giertz 2012 の整理として紹介される値。確かさ:中)" },
    theory: { value: "頂点 = 1 ÷ (1 + 弾力性)", note: "一律の税で税収が最大になる税率。最高税率だけを考える場合は 1 ÷ (1 + a × 弾力性)(a は所得分布の形を表す値)で、a=1.5・弾力性0.25なら73%(Diamond & Saez 2011)" },
  },
  presets: {
    t30: { label: "A 税率30%(弾力性0.25)", rules: { tax: 30, e: 0.25 } }, t50: { label: "B 税率50%(弾力性0.25)", rules: { tax: 50, e: 0.25 } },
    t80: { label: "C 税率80%(弾力性0.25での頂点)", rules: { tax: 80, e: 0.25 } }, react: { label: "D 税率50%、よく反応する人たち(弾力性1.0)", rules: { tax: 50, e: 1 } },
    high: { label: "E 税率70%、弾力性1.0(頂点を超える)", rules: { tax: 70, e: 1 } },
  },
  params: [{ key: "tax", label: "税率(%)", value: 30, min: 0, max: 99 }, { key: "e", label: "弾力性", value: 0.25, min: 0.05, max: 3, step: 0.05 }],
  charts: [{ title: "税率ごとの税収と働く量(いちばん多いときを100%として)", fmt: "pct", lines: [{ key: "revenue", name: "税収", color: "#b4473b" }, { key: "work", name: "働く量(課税される所得)", color: "#2f8f6b" }] }],
  metrics: [{ key: "now", label: "いまの税率での税収", fmt: "pct", sub: "頂点を100%として" }, { key: "peak", label: "税収が最大になる税率", fmt: "pct" }, { key: "workNow", label: "働く量", fmt: "pct", sub: "税率0%を100%として" },
    { key: "back", label: "減税した分のうち、税収として戻る割合", fmt: "pct", sub: "100%を超えると減税で税収が増える" }],
  verify(m, r) {
    const t = r.tax / 100, e = r.e, tp = 1 / (1 + e);
    return [{ label: "税収が最大になる税率", model: m.peak, theory: tp, fmt: "pct1", note: "1 ÷ (1 + 弾力性)。シミュレーションは1%刻みで探す" }, { label: "いまの税率での税収(頂点比)", model: m.now, theory: (t * (1 - t) ** e) / (tp * (1 - tp) ** e), fmt: "pct1" },
      { label: "働く量(税率0%比)", model: m.workNow, theory: (1 - t) ** e, fmt: "pct1" }, { label: "減税分のうち税収として戻る割合", model: m.back, theory: (e * t) / (1 - t), fmt: "pct1", note: "弾力性 × 税率 ÷ (1 − 税率)" }];
  },
  advise(m, r) {
    const out = [], tp = 1 / (1 + r.e);
    if (r.tax / 100 > tp + 0.02) out.push(`税率${r.tax}%は頂点(${Math.round(tp * 100)}%)を超えています。この範囲では、税率を下げたほうが税収が増えます。`);
    else out.push(`税率${r.tax}%は頂点(${Math.round(tp * 100)}%)より下です。税率を上げれば税収は増えますが、働く量は税率0%のときの${Math.round(m.workNow * 100)}%まで減っています。`);
    out.push(`減税した分のうち、働く量が増えることで税収として戻るのは${Math.round(m.back * 100)}%です。研究では、労働への税の減税で戻る割合は米国32%、欧州14か国54%と推計されています(Trabandt & Uhlig 2011)。`);
    out.push("日本については、労働への税率は頂点より下、資本への税率は頂点の近くか上という研究があります(Nutahara 2015)。数値は確認できていません。");
    out.push("頂点の税率は「税収が最大」になる点で、「望ましい」税率ではありません。暮らしの満足や公平さは、この計算に入っていません。");
    return out;
  },
  run(r, seed) {
    const rng = makeRng(seed), w = Array.from({ length: 400 }, () => Math.exp(0.5 * rng.normal())), e = r.e;
    const at = (t) => { let z = 0; for (const x of w) z += x * bestHours((1 - t) * x, e); return { z, rev: t * z }; };
    const grid = Array.from({ length: 100 }, (_, i) => ({ x: i, ...at(i / 100) })), top = grid.reduce((a, b) => (b.rev > a.rev ? b : a)), z0 = grid[0].z;
    const t = r.tax / 100, cur = at(t), lower = at(t - 0.005), upper = at(Math.min(0.999, t + 0.005)), mech = 0.01 * cur.z; // 税率を0.5ポイント下げたときに、何もしなければ減るはずの税収
    return { series: grid.filter((g) => g.x % 2 === 0).map((g) => ({ x: g.x, revenue: g.rev / top.rev, work: g.z / z0 })),
      summary: { now: cur.rev / top.rev, peak: top.x / 100, workNow: cur.z / z0, back: mech > 0 ? 1 - (upper.rev - lower.rev) / mech : 0 } };
  },
};
