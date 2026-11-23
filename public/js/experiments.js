// 論文の実験と比べられるシミュレーション。
// 実際に人で行われた実験や、原論文に書かれた結果を「文献値」として並べる。
// 文献値に合わせて係数を決めたものは、その旨を仮定の一覧に書いている(合うこと自体は、正しさの証明にならない)。
import { makeRng, clamp } from "./rng.js";

const phi = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
const Phi = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = phi(z) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return z >= 0 ? 1 - d : d; };

// ============ 1) みんながやるなら自分も(閾値モデル) ============
// Granovetter (1978) Threshold Models of Collective Behavior. 100人が「何人やっていたら自分も加わるか」を持つ。
const equilibrium = (cdf) => { let r = 0; for (let i = 0; i < 500; i++) { const n = 100 * cdf(r); if (Math.abs(n - r) < 1e-9) break; r = n; } return r; };
export const threshold = {
  key: "threshold", title: "みんながやるなら自分も", years: 100, xLabel: "巡目", runs: 30, initial: "uniform",
  lead: "新しい制度や商品に「何人やっていたら自分も加わるか」が1人ずつ違うとき、全体に広がるかどうかを試します。",
  note: "100人の集団です。1人ずつ「すでに何人加わっていたら自分も加わるか」(閾値)を持っています。<br>たった1人の閾値が違うだけで、全員に広がるか、1人で終わるかが変わります。",
  verifyTitle: "原論文の結果との照合", verifyHead: "論文の値",
  verifyNote: "出典:Granovetter, M. (1978). Threshold Models of Collective Behavior. American Journal of Sociology, 83(6). 論文の値は、論文と同じ計算方法(人数の期待値をくり返し当てはめる)での結果と比べています。",
  assumptions: {
    people: { value: 100, note: "集団の人数。原論文と同じ" },
    rule: { value: "閾値以上で参加", note: "すでに加わっている人数が自分の閾値以上なら、次の巡で加わる。一度加わったらやめない" },
    normal: { value: "平均25", note: "閾値がばらつく条件では、平均25人の正規分布からくじで決める(0未満は0)。原論文の設定" },
  },
  presets: {
    uniform: { label: "A 閾値が0,1,2,…,99と1人ずつ違う", rules: { mode: 0, mean: 25, sd: 12 } },
    shifted: { label: "B Aのうち、閾値1の人だけが2になる", rules: { mode: 1, mean: 25, sd: 12 } },
    narrow: { label: "C 平均25、ばらつき小(標準偏差12.2)", rules: { mode: 2, mean: 25, sd: 12.2 } },
    wide: { label: "D 平均25、ばらつき少し大(標準偏差12.3)", rules: { mode: 2, mean: 25, sd: 12.3 } },
  },
  params: [{ key: "mean", label: "閾値の平均(人) ※C・Dのみ", value: 25, min: 0, max: 100 }, { key: "sd", label: "閾値のばらつき(標準偏差) ※C・Dのみ", value: 12, min: 1, max: 60, step: 0.1 }],
  charts: [{ title: "加わった人数の推移", fmt: "num0", lines: [{ key: "joined", name: "加わった人", color: "#b4473b" }] }],
  metrics: [{ key: "final", label: "最後に加わった人数", fmt: "people" }, { key: "all", label: "半数以上に広がった回", fmt: "pct", sub: "くじで閾値を決めた試行のうち" }, { key: "rounds", label: "止まるまでの巡数", fmt: "num1" }],
  verify(m, r) {
    if (r.mode === 0) return [{ label: "加わる人数", model: m.expected, theory: 100, fmt: "people", note: "0人の人が動き、1人の人が続き…と全員に広がる" }];
    if (r.mode === 1) return [{ label: "加わる人数", model: m.expected, theory: 1, fmt: "people", note: "閾値1の人がいなくなり、最初の1人で止まる" }];
    if (r.mean !== 25 || r.sd < 12.2) return [];
    return [{ label: "加わる人数(期待値で計算)", model: m.expected, theory: r.sd < 12.25 ? 6 : 100, theoryText: r.sd < 12.25 ? "約6人" : "ほぼ全員", fmt: "people", note: "標準偏差が12.2付近を超えると、急にほぼ全員へ広がる" }];
  },
  advise(m, r) {
    const out = [];
    if (r.mode === 0) out.push("全員に広がりました。ただし、これは閾値が1人ずつきれいに並んでいる特別な場合です。");
    if (r.mode === 1) out.push("閾値が1人違うだけで、広がりが100人から1人になりました。結果だけを見て「この集団は消極的だ」と判断すると誤ります。");
    if (r.mode === 2) out.push(`期待値で計算すると ${Math.round(m.expected)}人で止まります。くじで閾値を決めた${"試行"}では、${Math.round(m.all * 100)}%の回で半数以上に広がりました。`);
    if (r.mode === 2 && m.all > 0.05 && m.all < 0.95) out.push("同じ条件でも、広がる回と広がらない回に分かれます。最初に動く数人がいるかどうかの偶然で決まるためです。");
    out.push("広げたいときは、平均を動かすより「最初に動く少数」と「その次に続く人」のつながりを切らさないことが効きます。");
    return out;
  },
  run(r, seed) {
    const rng = makeRng(seed), N = 100;
    let th;
    if (r.mode === 0) th = Array.from({ length: N }, (_, i) => i);
    else if (r.mode === 1) th = Array.from({ length: N }, (_, i) => (i === 1 ? 2 : i));
    else th = Array.from({ length: N }, () => Math.max(0, r.mean + r.sd * rng.normal()));
    const series = []; let joined = 0, rounds = 0;
    for (let t = 0; t <= 100; t++) {
      series.push({ x: t, joined });
      const next = th.filter((x) => x <= joined).length;
      if (next > joined) rounds = t + 1;
      joined = Math.max(joined, next);
    }
    const expected = r.mode === 2 ? equilibrium((x) => Phi((x - r.mean) / r.sd)) : joined;
    return { series, summary: { final: joined, all: joined >= 50 ? 1 : 0, rounds, expected } };
  },
  frames(r, seed) {
    const s = this.run(r, seed).series, last = s.findIndex((x, i) => i > 0 && x.joined === s[s.length - 1].joined);
    const frames = s.slice(0, Math.min(s.length, Math.max(6, last + 3))).map((x) => ({ label: `${x.x}巡目`, caption: `${x.x}巡目:加わった人 ${x.joined}人、様子を見ている人 ${100 - x.joined}人。`,
      zones: [{ name: "様子を見ている人", color: "#8b93a7", count: 100 - x.joined, build: "houses" }, { name: "加わった人", color: "#b4473b", count: x.joined, build: "plaza" }] }));
    return { frames, opts: { sub: "100人が、周りの人数を見て加わるかを決める。" } };
  },
};

// ============ 2) くり返し囚人のジレンマ(総当たり戦) ============
// Axelrod (1980, 1984). 協力(C)か裏切り(D)かを200手くり返す。
const STRATS = [
  { key: "tft", name: "しっぺ返し", color: "#2f8f6b", nice: true, move: (me, op) => (op.length ? op[op.length - 1] : 1) },
  { key: "tf2t", name: "寛容なしっぺ返し", color: "#58a6a6", nice: true, move: (me, op) => (op.length >= 2 && !op[op.length - 1] && !op[op.length - 2] ? 0 : 1) },
  { key: "grim", name: "一度で絶交", color: "#8a6fb3", nice: true, move: (me, op) => (op.includes(0) ? 0 : 1) },
  { key: "pavlov", name: "勝てば続け、負ければ変える", color: "#4a7fb5", nice: true, move: (me, op) => (!me.length ? 1 : me[me.length - 1] === op[op.length - 1] ? 1 : 0) },
  { key: "allc", name: "いつも協力", color: "#c9a45c", nice: true, move: () => 1 },
  { key: "alld", name: "いつも裏切り", color: "#b4473b", nice: false, move: () => 0 },
  { key: "joss", name: "ときどき裏切るしっぺ返し", color: "#a0705a", nice: false, move: (me, op, rng) => (op.length && !op[op.length - 1] ? 0 : rng.next() < 0.1 ? 0 : 1) },
  { key: "random", name: "でたらめ", color: "#8b93a7", nice: false, move: (me, op, rng) => (rng.next() < 0.5 ? 1 : 0) },
];
const PAY = { T: 5, R: 3, P: 1, S: 0 };
function match(a, b, moves, noise, rng) {
  const ha = [], hb = []; let sa = 0, sb = 0;
  for (let i = 0; i < moves; i++) {
    let ma = a.move(ha, hb, rng), mb = b.move(hb, ha, rng);
    if (noise && rng.next() < noise) ma = 1 - ma;
    if (noise && rng.next() < noise) mb = 1 - mb;
    ha.push(ma); hb.push(mb);
    sa += ma ? (mb ? PAY.R : PAY.S) : mb ? PAY.T : PAY.P; sb += mb ? (ma ? PAY.R : PAY.S) : ma ? PAY.T : PAY.P;
  }
  return [sa, sb];
}
export const tournament = {
  key: "tournament", title: "協力か裏切りか(総当たり戦)", years: 200, xLabel: "手数", runs: 20, initial: "standard",
  lead: "取引先と長く付き合うとき、どんな方針が最後に得をするかを、8つの方針の総当たり戦で試します。",
  note: "2者が「協力」か「裏切り」を同時に選びます。両方協力なら3点ずつ、両方裏切りなら1点ずつ、片方だけ裏切ると裏切った側5点・相手0点です。<br>これを決まった手数くり返し、全員と対戦(自分と同じ方針とも対戦)した平均点で比べます。",
  verifyTitle: "理論値との照合", verifyHead: "理論値",
  verifyNote: "点数表から手計算できる組み合わせで確かめています。参考:Axelrod の第1回大会(14の方針+でたらめ、200手)では、しっぺ返しが平均504点で優勝しました(Axelrod, R. (1980). Effective Choice in the Prisoner's Dilemma. Journal of Conflict Resolution, 24(1))。参加した方針が違うため、点数そのものは比べられません。",
  assumptions: {
    payoff: { value: PAY, note: "点数表。T=裏切りが成功、R=両方協力、P=両方裏切り、S=裏切られた。一般に使われる値(Axelrod 1984)" },
    field: { value: STRATS.map((s) => s.name).join("、"), note: "参加する8つの方針。Axelrod の大会に出た方針そのものではなく、代表的なものを選んだ" },
    joss: { value: 0.1, note: "「ときどき裏切るしっぺ返し」が、協力すべき場面で裏切る確率" },
    noise: { value: "条件による", note: "手違いの確率。選んだ手が、この確率で逆になる" },
  },
  presets: {
    standard: { label: "A 標準(200手、手違いなし)", rules: { moves: 200, noise: 0, nasty: 1 } },
    noisy: { label: "B 手違いが5%起きる", rules: { moves: 200, noise: 5, nasty: 1 } },
    harsh: { label: "C 「いつも裏切り」が4者いる", rules: { moves: 200, noise: 0, nasty: 4 } },
    short: { label: "D 付き合いが短い(5手)", rules: { moves: 5, noise: 0, nasty: 1 } },
  },
  params: [{ key: "moves", label: "1対戦の手数", value: 200, min: 1, max: 1000 }, { key: "noise", label: "手違いの確率(%)", value: 0, min: 0, max: 30 }, { key: "nasty", label: "「いつも裏切り」の数", value: 1, min: 0, max: 10 }],
  charts: [{ title: "1手あたりの平均点(手数が進むにつれて)", fmt: "num2", lines: STRATS.filter((s) => ["tft", "alld", "allc", "pavlov"].includes(s.key)).map((s) => ({ key: s.key, name: s.name, color: s.color })) }],
  metrics: [...STRATS.slice(0, 6).map((s) => ({ key: s.key, label: s.name, fmt: "num0", sub: "1対戦の平均点" })), { key: "tftRank", label: "しっぺ返しの順位", fmt: "num1", sub: "8方針中" }, { key: "niceTop", label: "上位4つのうち「自分からは裏切らない」方針", fmt: "num1" }],
  verify(m, r) {
    if (r.noise) return [];
    return [{ label: "「いつも協力」同士", model: m.cc, theory: PAY.R * r.moves, fmt: "num0", note: "3点 × 手数" }, { label: "「いつも裏切り」同士", model: m.dd, theory: PAY.P * r.moves, fmt: "num0", note: "1点 × 手数" },
      { label: "しっぺ返し 対 いつも裏切り", model: m.tftVsD, theory: PAY.S + PAY.P * (r.moves - 1), fmt: "num0", note: "最初の1手だけ裏切られ、あとは両方裏切り" }];
  },
  advise(m, r) {
    const out = [], best = STRATS.map((s) => [s, m[s.key]]).sort((a, b) => b[1] - a[1])[0][0];
    out.push(`この条件でいちばん得点が高いのは「${best.name}」です。`);
    if (m.niceTop >= 3) out.push("上位は「自分からは裏切らない」方針が占めました。Axelrod の大会でも、上位8つはすべてこの型でした。");
    if (r.noise >= 3) out.push("手違いがあると、しっぺ返し同士でも報復の連鎖に入ります。1回は見逃す、寛容な方針のほうが強くなります。");
    if (r.moves <= 10) out.push("付き合いが短いと、裏切りの得が大きくなります。長く続く関係だと分かっていることが、協力の前提です。");
    if (r.nasty >= 3) out.push("裏切る相手が多い場では、いつも協力は食い物にされます。相手を選べない場では、やり返す仕組みが要ります。");
    return out;
  },
  run(r, seed) {
    const rng = makeRng(seed), noise = (r.noise ?? 0) / 100, moves = Math.max(1, Math.round(r.moves));
    const field = [...STRATS.filter((s) => s.key !== "alld"), ...Array.from({ length: Math.round(r.nasty ?? 1) }, () => STRATS.find((s) => s.key === "alld"))];
    const total = field.map(() => 0); let cc = 0, dd = 0, tftVsD = 0;
    for (let i = 0; i < field.length; i++) for (let j = i; j < field.length; j++) {
      const [a, b] = match(field[i], field[j], moves, noise, rng);
      total[i] += a; if (j !== i) total[j] += b;
      if (field[i].key === "allc" && j === i) cc = a;
      if (field[i].key === "alld" && j === i) dd = a;
      if (field[i].key === "tft" && field[j].key === "alld") tftVsD = a;
    }
    if (!dd) dd = match(STRATS[5], STRATS[5], moves, 0, rng)[0];
    if (!tftVsD) tftVsD = match(STRATS[0], STRATS[5], moves, 0, rng)[0];
    const avg = {}; field.forEach((s, i) => { avg[s.key] = total[i] / field.length; });
    for (const s of STRATS) avg[s.key] ??= 0;
    const order = STRATS.filter((s) => s.key !== "alld" || r.nasty > 0).sort((a, b) => avg[b.key] - avg[a.key]);
    const series = [];
    for (const k of [1, 2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 200, 300, 500, 1000].filter((x) => x <= moves)) {
      const row = { x: k };
      for (const key of ["tft", "alld", "allc", "pavlov"]) { const me = STRATS.find((s) => s.key === key); if (key === "alld" && !r.nasty) { row[key] = 0; continue; } let t = 0; for (const op of field) t += match(me, op, k, noise, rng)[0]; row[key] = t / field.length / k; }
      series.push(row);
    }
    return { series, summary: { ...avg, cc, dd, tftVsD, tftRank: order.findIndex((s) => s.key === "tft") + 1, niceTop: order.slice(0, 4).filter((s) => s.nice).length } };
  },
};

// ============ 3) みんなで出し合う(公共財ゲーム) ============
// Fehr & Gächter (2000, 2002). 4人組、手持ち20、出した合計の0.4倍が全員に戻る。
export const COMMONS_ASSUMPTIONS = {
  group: { value: 4, note: "1組の人数。Fehr & Gächter の実験と同じ" },
  endowment: { value: 20, note: "毎期の手持ち。実験と同じ" },
  mpcr: { value: 0.4, note: "みんなで出した合計のうち、1人に戻る割合。実験と同じ。自分だけ見れば、1出すと0.4しか戻らない" },
  freeRider: { value: 0.3, note: "最初から出さない人の割合。仮定(実験では2〜3割とされることが多い)" },
  slope: { value: 0.93, note: "「周りが出すなら自分も」という人が、周りの平均の何倍を出すか。1より少し小さい(少しだけ得をしようとする)。仮定。罰なしの最終期が約3になるよう決めた" },
  floor: { value: 2.5, note: "出そうとする額がこれを下回ると、出すのをやめる。仮定" },
  punisher: { value: 0.6, note: "出す人のうち、自分より出さない人を罰する人の割合。仮定" },
  points: { value: 0.25, note: "罰の強さ。自分との差1につき、何点の罰を与えるか(最大10点)。仮定" },
  cost: { value: "罰する側1点につき1", note: "罰にかかる費用。Fehr & Gächter (2002) と同じ" },
  climb: { value: 3, note: "罰が効いている組で、出す人が毎期どれだけ上げていくか。仮定。罰ありの最終期が18を超えるよう決めた" },
  deter: { value: 0.6, note: "罰で失う額が、出さずに浮いた額のこの割合を超えると、次から周りに合わせる。仮定" },
  calibration: { value: "文献値に合わせて調整", note: "上の仮定の係数は、罰なし・罰ありの文献値に近づくように決めた。合っていても、仕組みが正しい証明にはならない" },
};
export const commons = {
  key: "commons", title: "みんなで出し合う", years: 10, xLabel: "期", runs: 40, initial: "none",
  lead: "全員で出し合えば全員が得をするのに、出さない人が得をする場面で、協力がどう崩れ、どう保たれるかを試します。",
  note: "4人組で、毎期20ずつ持ちます。出した合計の1.6倍が、4人に等しく戻ります(1出すと自分には0.4)。<br>全員が全部出すと1人32、誰も出さないと20。自分だけ出さないと、いちばん得をします。",
  verifyTitle: "実験の結果との照合", verifyHead: "実験の値",
  verifyNote: "出典:Fehr, E. & Gächter, S. (2000). Cooperation and Punishment in Public Goods Experiments. American Economic Review, 90(4), 980-994. このモデルの係数は、これらの値に近づくように決めています。日本での実験では「罰が協力を高めない」という報告もあり(数値は未確認)、国や相手によって結果は変わります。",
  assumptions: COMMONS_ASSUMPTIONS,
  presets: {
    none: { label: "A 罰なし", rules: { punish: 0, impact: 3, free: 30 } },
    punish: { label: "B 罰あり(1払うと相手が3減る)", rules: { punish: 1, impact: 3, free: 30 } },
    weak: { label: "C 弱い罰(1払うと相手が1減る)", rules: { punish: 1, impact: 1, free: 30 } },
    many: { label: "D 罰あり、出さない人が半分", rules: { punish: 1, impact: 3, free: 50 } },
  },
  params: [{ key: "punish", label: "罰の仕組み(0=なし、1=あり)", value: 0, min: 0, max: 1 }, { key: "impact", label: "罰1点で相手が失う額", value: 3, min: 0, max: 10, step: 0.5 }, { key: "free", label: "最初から出さない人(%)", value: 30, min: 0, max: 100 }],
  charts: [{ title: "1人あたりの拠出(20のうち)", fmt: "num1", lines: [{ key: "give", name: "平均の拠出", color: "#2f8f6b" }] }, { title: "1人あたりの手取り", fmt: "num1", lines: [{ key: "income", name: "手取り(罰の費用を引いた後)", color: "#c9a45c" }] }],
  metrics: [{ key: "first", label: "最初の期の拠出", fmt: "num1", sub: "20のうち" }, { key: "last", label: "最後の期の拠出", fmt: "num1", sub: "20のうち" }, { key: "rate", label: "全期間の平均拠出率", fmt: "pct" },
    { key: "zero", label: "最後の期に何も出さない人", fmt: "pct" }, { key: "full", label: "最後の期に全額出す人", fmt: "pct" }, { key: "income", label: "平均の手取り", fmt: "num1", sub: "誰も出さないと20、全員全額で32" }],
  verify(m, r) {
    if (r.free !== 30 || r.impact !== 3) return [];
    const inR = (v, lo, hi) => ({ range: [lo, hi] });
    if (!r.punish) return [{ label: "最後の期の拠出", model: m.last, theory: 3, theoryText: "約3", fmt: "num1", note: "固定の4人組の条件。確かさ:中" }, { label: "最後の期に何も出さない人", model: m.zero, ...inR(0, 0.53, 0.75), theory: 0.64, theoryText: "53〜75%", fmt: "pct", note: "確かさ:高" }];
    return [{ label: "最後の期の拠出", model: m.last, theory: 18, theoryText: "18超", fmt: "num1", note: "固定の4人組の条件。確かさ:中" }, { label: "全期間の平均拠出率", model: m.rate, theory: 0.72, range: [0.5, 0.95], theoryText: "50〜95%", fmt: "pct", note: "確かさ:高" },
      { label: "最後の期に全額出す人", model: m.full, theory: 0.825, theoryText: "82.5%", fmt: "pct", note: "確かさ:中" }];
  },
  advise(m, r) {
    const out = [];
    if (!r.punish) out.push(`協力は${m.first.toFixed(1)}から${m.last.toFixed(1)}へ崩れました。出す気のある人も、出さない人を見て少しずつ減らすためです。`);
    else if (m.last > 15) out.push(`罰の仕組みで、拠出は${m.last.toFixed(1)}まで保たれました。実際に罰が使われるのは最初の数期で、あとは「罰されうる」ことが効きます。`);
    else if (m.last > m.first + 2) out.push(`罰の仕組みで拠出は${m.last.toFixed(1)}まで上がりましたが、全員が出す状態には届きませんでした。罰が割に合う組と、合わない組に分かれています。`);
    else out.push("罰の仕組みがあっても、協力は保たれませんでした。罰で失う額が、出さずに浮く額より小さいためです。");
    if (r.punish && m.income < 24) out.push(`手取りは${m.income.toFixed(1)}です。罰には費用がかかるため、短い期間では罰なしより手取りが減ることがあります。`);
    out.push("社内に当てはめると、評価や相互チェックのない共同作業(共有資料の整備、後輩の指導など)は、善意だけでは続きにくいことを示します。");
    return out;
  },
  run(r, seed, years) {
    const A = COMMONS_ASSUMPTIONS, rng = makeRng(seed), G = 60, n = A.group.value, E = A.endowment.value, T = Math.max(1, Math.round(years));
    const people = Array.from({ length: G * n }, () => { const fr = rng.next() < r.free / 100; return { fr, belief: E * (0.45 + 0.5 * rng.next()), c: 0, pun: !fr && rng.next() < A.punisher.value, pushed: false, sum: 0 }; });
    const series = []; let total = 0;
    for (let t = 1; t <= T; t++) {
      let give = 0, income = 0, zero = 0, full = 0;
      for (const p of people) {
        let c = p.fr ? 0 : A.slope.value * p.belief + rng.normal() * 1.2;
        if (!p.fr && c < A.floor.value) c = 0;
        if (p.keep) c = Math.max(c, p.keep + rng.normal() * 0.5); // 罰を受けて上げた水準は保つ
        p.c = clamp(Math.round(c), 0, E);
      }
      for (let g = 0; g < G; g++) {
        const m = people.slice(g * n, g * n + n), sum = m.reduce((a, p) => a + p.c, 0);
        for (const p of m) { p.pay = E - p.c + A.mpcr.value * sum; p.got = 0; }
        if (r.punish) for (const j of m) if (j.pun) for (const i of m) if (i !== j && i.c < j.c - 1) { const pts = Math.min(10, Math.ceil((j.c - i.c) * A.points.value)); j.pay -= pts; i.got += pts; }
        const top = Math.max(...m.map((p) => p.c));
        let works = r.punish > 0; // この組で、罰が「割に合わない」と思わせることに成功しているか
        for (const p of m) { p.loss = p.got * r.impact; p.others = (sum - p.c) / (n - 1); p.pushed = p.loss > 0 && p.loss > A.deter.value * Math.max(0, p.others - p.c); if (p.c < p.others - 1 && !p.pushed) works = false; }
        for (const p of m) {
          const others = p.others;
          p.pay -= p.loss;
          if (p.pushed) p.keep = Math.min(E, Math.max(p.keep ?? 0, top));
          // 罰が効いている組では、出す人は安心して上げていく。効いていない組では、罰なしと同じように周りに合わせて下げる
          p.belief = works && !p.fr ? Math.min(E / A.slope.value, Math.max(p.belief, others) + A.climb.value) : 0.5 * p.belief + 0.5 * others;
          if (works && !p.fr) p.keep = Math.max(p.keep ?? 0, p.c);
          give += p.c; income += p.pay; if (p.c === 0) zero++; if (p.c === E) full++;
        }
      }
      const N = people.length;
      series.push({ x: t, give: give / N, income: income / N, zero: zero / N, full: full / N });
      total += give / N;
    }
    const a = series[0], z = series[series.length - 1];
    return { series, summary: { first: a.give, last: z.give, rate: total / T / E, zero: z.zero, full: z.full, income: series.reduce((s, x) => s + x.income, 0) / T } };
  },
  frames(r, seed, years) {
    const frames = this.run(r, seed, years).series.map((s) => ({ label: `${s.x}期`, caption: `${s.x}期:平均の拠出 ${s.give.toFixed(1)}(20のうち)、何も出さない人 ${Math.round(s.zero * 100)}%、全額出す人 ${Math.round(s.full * 100)}%。`,
      zones: [{ name: "何も出さない人", color: "#b4473b", count: s.zero * 240, build: "houses" }, { name: "一部を出す人", color: "#c9a45c", count: (1 - s.zero - s.full) * 240, build: "market" }, { name: "全額出す人", color: "#2f8f6b", count: s.full * 240, build: "hall" }],
      gauges: [{ label: "平均の拠出", text: `${s.give.toFixed(1)} / 20`, value: s.give / 20, color: "#2f8f6b" }] }));
    return { frames, opts: { sub: r.punish ? "罰の仕組みあり。" : "罰の仕組みなし。" } };
  },
};

// ============ 4) 分け前の交渉(最後通牒ゲーム) ============
// Güth, Schmittberger & Schwarze (1982). 提案する側が分け方を決め、受ける側が断ると両方0になる。
export const SPLIT_ASSUMPTIONS = {
  demand: { value: "平均26%、標準偏差13%", note: "受ける側が「これ未満なら断る」と決めている割合の分布(正規分布)。仮定。平均の提案40%・拒否率16%になるよう決めた" },
  proposer: { value: "期待額を最大にする", note: "提案する側は、断られる確率を見込んで、自分の取り分の期待値がいちばん大きい提案を選ぶ" },
  misread: { value: 0.1, note: "提案する側が、相手の要求水準を読み違える幅(標準偏差)。仮定" },
  cap: { value: 0.5, note: "提案は半分まで(自分より多く渡す提案はしない)。仮定" },
};
const bestOffer = (mu, sd) => { let best = 0, val = -1; for (let x = 0; x <= 0.5001; x += 0.005) { const v = (1 - x) * Phi((x - mu) / sd); if (v > val) { val = v; best = x; } } return best; };
export const split = {
  key: "split", title: "分け前の交渉", years: 1, xLabel: "提案(%)", runs: 20, initial: "standard",
  lead: "取り分を一方が決め、相手は「受ける」か「断って両方ゼロ」しか選べないとき、どんな提案になるかを試します。",
  note: "損得だけで考えれば、受ける側は1円でも受けたほうが得です。それでも実験では、少なすぎる提案は断られます。<br>値引き交渉や下請け単価のように、立場に差がある交渉の基本形です。",
  verifyTitle: "実験の結果との照合", verifyHead: "実験の値",
  verifyNote: "出典:Oosterbeek, H., Sloof, R. & van de Kuilen, G. (2004). Cultural Differences in Ultimatum Game Experiments: Evidence from a Meta-Analysis. Experimental Economics, 7, 171-188(37論文・75の実験の平均)。このモデルの係数は、この2つの値に近づくように決めています。",
  assumptions: SPLIT_ASSUMPTIONS,
  presets: {
    standard: { label: "A 標準(実験の平均に合わせた設定)", rules: { demand: 26, spread: 13, veto: 1 } },
    strict: { label: "B 相手が強気(平均40%を要求)", rules: { demand: 40, spread: 13, veto: 1 } },
    mild: { label: "C 相手が弱気(平均10%を要求)", rules: { demand: 10, spread: 13, veto: 1 } },
    noveto: { label: "D 相手は断れない", rules: { demand: 26, spread: 13, veto: 0 } },
  },
  params: [{ key: "demand", label: "相手が最低限ほしい割合の平均(%)", value: 26, min: 0, max: 60 }, { key: "spread", label: "そのばらつき(標準偏差、%)", value: 13, min: 1, max: 40 }, { key: "veto", label: "相手は断れるか(1=断れる、0=断れない)", value: 1, min: 0, max: 1 }],
  charts: [{ title: "提案の額と、受け入れられる確率", fmt: "pct", lines: [{ key: "accept", name: "受け入れられる確率", color: "#2f8f6b" }, { key: "share", name: "その提案をする人の割合(山の高さを1に合わせて表示)", color: "#b4473b" }] }],
  metrics: [{ key: "offer", label: "平均の提案", fmt: "pct1", sub: "相手に渡す割合" }, { key: "reject", label: "断られる割合", fmt: "pct1" }, { key: "mine", label: "提案する側の平均の取り分", fmt: "pct1" }, { key: "yours", label: "受ける側の平均の取り分", fmt: "pct1" }, { key: "lost", label: "決裂で消えた分", fmt: "pct1" }],
  verify(m, r) {
    if (r.demand !== 26 || r.spread !== 13 || !r.veto) return [];
    return [{ label: "平均の提案", model: m.offer, theory: 0.40, fmt: "pct1", note: "確かさ:高" }, { label: "断られる割合", model: m.reject, theory: 0.16, fmt: "pct1", note: "確かさ:高" }];
  },
  advise(m, r) {
    const out = [];
    if (!r.veto) return ["相手が断れないと、損得だけで動く提案者は何も渡しません。実際の実験(独裁者ゲーム)では、それでもいくらか渡す人が多いことが知られていますが、このモデルには入れていません。"];
    out.push(`損得だけを考える提案者でも、平均${(m.offer * 100).toFixed(0)}%を渡します。断られる危険が、相手への配慮と同じ働きをするためです。`);
    if (m.lost > 0.1) out.push(`交渉の${(m.lost * 100).toFixed(0)}%が決裂で消えています。相手の要求水準を読み違えることの費用です。`);
    if (r.demand >= 35) out.push("相手が強気だと、提案は半分に張りつき、それでも決裂が増えます。強気は相手の取り分を増やしますが、全体の取り分は減らします。");
    return out;
  },
  run(r, seed) {
    const A = SPLIT_ASSUMPTIONS, rng = makeRng(seed), N = 2000, mu = r.demand / 100, sd = Math.max(0.01, r.spread / 100);
    let offer = 0, reject = 0, mine = 0, yours = 0; const hist = Array(13).fill(0);
    for (let i = 0; i < N; i++) {
      const x = r.veto ? clamp(bestOffer(mu + rng.normal() * A.misread.value, sd), 0, A.cap.value) : 0;
      const ok = !r.veto || x >= mu + sd * rng.normal();
      offer += x; hist[Math.min(12, Math.round(x * 20))]++;
      if (ok) { mine += 1 - x; yours += x; } else reject++;
    }
    const top = Math.max(...hist);
    const series = hist.map((h, k) => ({ x: k * 5, accept: r.veto ? Phi((k * 0.05 - mu) / sd) : 1, share: h / top }));
    return { series, summary: { offer: offer / N, reject: reject / N, mine: mine / N, yours: yours / N, lost: reject / N } };
  },
};
