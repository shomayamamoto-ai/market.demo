// 組織シミュレーター:評価や仕事の回し方のルールが、働き方と生産力をどう変えるかを試す。
// 1人ずつが「手取り(報酬 − 疲れ + やりがい)」を周りと比べ、得な働き方を真似る、という単純な仮定で動く。
// 実在の会社のデータで合わせ込んだモデルではなく、ルールの効き方を比べるための思考実験の道具。
import { makeRng, clamp } from "./rng.js";

export const MODES = {
  ace: { label: "エース", boxes: 5, color: "#2f6fe4" },
  std: { label: "標準", boxes: 2, color: "#58c4dd" },
  low: { label: "省エネ", boxes: 1, color: "#f2c94c" },
};
const MODE_KEYS = ["ace", "std", "low"];

export const ORG_ASSUMPTIONS = {
  fatigue: { value: 0.35, note: "疲れの係数。自分の能力に対する仕事量の2乗に比例して疲れる" },
  overtime: { value: 0.7, note: "能力を超えた分(残業)にかかる追加の疲れ" },
  intrinsic: { value: 0.9, note: "自分の力を出し切って働くことの満足(やりがい)の大きさ" },
  ageFatigue: { value: 0.015, note: "40歳を超えると、1歳ごとに疲れやすさが1.5%増える" },
  learn: { value: 0.08, note: "能力より上の働き方を続けると、能力が年8%伸びる" },
  imitate: { value: 0.5, note: "周りの3人と比べ、手取りが多い人の働き方に乗り換える確率" },
  threshold: { value: 0.12, note: "乗り換えを考え始める手取りの差(リンゴ)" },
  burnout: { value: 0.35, note: "手取りが生活ライン(リンゴ1個)を下回った人が、その年に離脱する確率" },
  natural: { value: "年齢別の実績", note: "「世間並みの入れ替わり」を入れたとき、ルールに関係なく毎年やめる人の割合。厚生労働省「令和7年雇用動向調査」の年齢階級別の離職者数÷常用労働者数(20〜24歳25.1%、30〜34歳14.6%、45〜49歳8.2%、60〜64歳17.1%)。代わりに入る人の年齢も、同じ調査の入職者の年齢分布から決める" },
  retireAge: { value: 65, note: "定年。退職者は22〜30歳の新人に入れ替わる" },
  switchCost: { value: 0.5, note: "転職にともなう負担(リンゴ換算)。隣の職場の手取りからこの分を引いて比べる" },
  quitYouth: { value: 0.3, note: "隣の職場のほうが得なエースが、その年に転職する確率(35歳未満は1.5倍)" },
};

export const PRESETS = {
  piece: { label: "① 完全歩合(処理した分だけ払う)", rules: { pay: "piece", rate: 1, push: 0 } },
  fixedPush: { label: "② 定額給 × 早い人に仕事を回す", rules: { pay: "fixed", fixed: 2, push: 0.5 } },
  crown: { label: "③ ②+表彰+歩合制の転職先がある", rules: { pay: "fixed", fixed: 2, push: 0.5, crown: 0.4, outside: 0.45 } },
  giveback: { label: "④ 時間の報酬+手伝いの即時還元", rules: { pay: "fixed", fixed: 2, push: 1, quota: 3, timeReward: 1.2, helpPay: 0.8 } },
};

// 社員をつくる。ages: [{min,max,share}]、mix: {ace,std,low} の初期比率
// 入職者の年齢の分布(千人)。同じ調査の第6-1表。新しく入る人の年齢を決めるのに使う(20〜59歳)
export const ENTRANT_AGES = [[20, 24, 1591.0], [25, 29, 865.9], [30, 34, 632.5], [35, 39, 486.8], [40, 44, 565.7], [45, 49, 561.4], [50, 54, 524.6], [55, 59, 446.4]];
export function createOrg({ n, ages, mix, seed, natural = false }) {
  const rng = makeRng(seed);
  const people = [];
  for (let i = 0; i < n; i++) {
    const band = rng.pick(ages, (a) => a.share);
    const r = rng.next();
    const mode = r < mix.ace ? "ace" : r < mix.ace + mix.std ? "std" : "low";
    people.push({ id: i + 1, age: band.min + Math.floor(rng.next() * (band.max - band.min + 1)), ability: MODES[mode].boxes, mode, net: 0, hours: 8, boxes: 0 });
  }
  const demand = people.reduce((a, p) => a + MODES[p.mode].boxes, 0); // 最初の生産量=100%
  return { people, demand, rng, natural, year: 0, history: [], exits: { burnout: 0, quit: 0, retire: 0, natural: 0 } };
}

// 1年(1世代)進める
export function stepOrg(org, rules, A = ORG_ASSUMPTIONS) {
  const { people, rng } = org;
  const k = A.fatigue.value;
  const quota = rules.quota ?? null;

  // 1) 自分の持ち場で処理する箱
  for (const p of people) {
    p.own = quota && rules.timeReward ? Math.min(MODES[p.mode].boxes, quota) : MODES[p.mode].boxes;
    p.extra = 0;
  }
  // 2) 終わらなかった箱を、早く終わった人(エース)へ回す
  const target = org.demand / people.length; // 1人あたりの想定量
  const shortfall = people.reduce((a, p) => a + Math.max(0, target - p.own), 0);
  const aces = people.filter((p) => p.mode === "ace");
  const ageF = (p) => 1 + A.ageFatigue.value * Math.max(0, p.age - 40);
  const fatigue = (p, load) => {
    const x = load / p.ability;
    return ageF(p) * (k * x * x + A.overtime.value * Math.max(0, x - 1));
  };
  if (rules.push > 0 && aces.length) {
    const each = (rules.push * shortfall) / aces.length;
    for (const p of aces) {
      if (rules.helpPay) {
        // 手伝いは任意:1箱ずつ、もらえるリンゴが増える疲れを上回る間だけ引き受ける
        let e = 0;
        while (e + 0.5 <= each && rules.helpPay * 0.5 >= fatigue(p, p.own + e + 0.5) - fatigue(p, p.own + e)) e += 0.5;
        p.extra = e;
      } else p.extra = each;
    }
  }
  // 3) 手取りを計算
  const sorted = rules.crown ? [...people].sort((a, b) => b.own + b.extra - (a.own + a.extra)) : null;
  const crowned = sorted ? new Set(sorted.slice(0, Math.max(1, Math.round(people.length * 0.05)))) : null;
  let production = 0, hours = 0;
  for (const p of people) {
    const load = p.own + p.extra;
    p.boxes = load;
    p.hours = 8 * (load / p.ability);
    const pay = rules.pay === "piece" ? rules.rate * load : rules.fixed + (rules.helpPay ? rules.helpPay * p.extra : 0);
    const pride = A.intrinsic.value * Math.min(1, MODES[p.mode].boxes / p.ability); // 力を出し切る働き方を選んでいるか
    const leisure = rules.timeReward ? rules.timeReward * Math.max(0, 1 - p.hours / 8) : 0; // 早く終われば休める
    p.net = pay - fatigue(p, load) + pride + leisure + (crowned?.has(p) ? rules.crown : 0);
    production += load; hours += p.hours;
  }
  const snapshot = {
    year: org.year,
    share: Object.fromEntries(MODE_KEYS.map((m) => [m, people.filter((p) => p.mode === m).length / people.length])),
    productivity: production / org.demand,
    hours: hours / people.length,
    net: people.reduce((a, p) => a + p.net, 0) / people.length,
    exits: { ...org.exits },
    modes: people.map((p) => p.mode),
  };
  org.history.push(snapshot);

  // 4) 働き方を見直す:周りの3人の働き方を見て、「自分がそうしたら手取りがどうなるか」を見積もり、得なら乗り換える
  const pushPerAce = aces.length ? (rules.push * shortfall) / aces.length : 0;
  const expected = (p, mode) => {
    const own = quota && rules.timeReward ? Math.min(MODES[mode].boxes, quota) : MODES[mode].boxes;
    const extra = mode === "ace" && !rules.helpPay ? pushPerAce : 0; // エースになれば仕事が回ってくる
    const load = own + extra;
    const pay = rules.pay === "piece" ? rules.rate * load : rules.fixed;
    const leisure = rules.timeReward ? rules.timeReward * Math.max(0, 1 - load / p.ability) : 0;
    return pay - fatigue(p, load) + A.intrinsic.value * Math.min(1, MODES[mode].boxes / p.ability) + leisure;
  };
  const next = people.map((p) => {
    let mode = p.mode, best = p.net + A.threshold.value;
    for (let j = 0; j < 3; j++) {
      const q = people[Math.floor(rng.next() * people.length)];
      if (q.mode === p.mode) continue;
      const e = expected(p, q.mode);
      if (e > best) { best = e; mode = q.mode; }
    }
    return mode !== p.mode && rng.next() < A.imitate.value ? mode : p.mode;
  });
  // 5) 離脱・転職・定年 → 新人が入る(手取りの多い先輩を手本にする)
  const outsideNet = (p) => (rules.outside ? rules.outside * 5 - fatigue(p, 5) + A.intrinsic.value - A.switchCost.value : -Infinity);
  people.forEach((p, i) => {
    let leave = null;
    if (p.net < 1 && rng.next() < A.burnout.value) leave = "burnout";
    else if (p.mode === "ace" && outsideNet(p) > p.net && rng.next() < A.quitYouth.value * (p.age < 35 ? 1.5 : 1)) leave = "quit";
    else if (p.age >= A.retireAge.value) leave = "retire";
    // 世間並みの入れ替わり:ルールに関係なく、年齢ごとの実際の離職率で人が入れ替わる(実データ)
    else if (org.natural && rng.next() < separationAt(p.age)) leave = "natural";
    if (leave) {
      org.exits[leave]++;
      let model = people[Math.floor(rng.next() * people.length)];
      for (let j = 0; j < 4; j++) { const q = people[Math.floor(rng.next() * people.length)]; if (q.net > model.net) model = q; }
      const r = rng.next();
      p.ability = r < 0.2 ? 5 : r < 0.7 ? 2 : 1; // 新人の素の能力は最初の比率と同じ
      if (org.natural) { const b = rng.pick(ENTRANT_AGES, (x) => x[2]); p.age = Math.max(22, b[0] + Math.floor(rng.next() * (b[1] - b[0] + 1))); } // 入ってくる人の年齢も、実際の入職者の分布から
      else p.age = 22 + Math.floor(rng.next() * 9);
      p.mode = expected(p, model.mode) >= expected(p, "low") ? model.mode : "low"; // 無理な働き方は選ばない
    } else {
      p.mode = next[i];
      p.age++;
      const want = MODES[p.mode].boxes;
      if (want > p.ability) p.ability = Math.min(want, p.ability * (1 + A.learn.value)); // 背伸びを続けると力がつく
    }
  });
  org.year++;
  return snapshot;
}

export function runOrg(config, rules, years) {
  const org = createOrg(config);
  for (let y = 0; y <= years; y++) stepOrg(org, rules);
  return org;
}

// 世間並みの離職率(1年あたり、年齢階級別)。厚生労働省「令和7年雇用動向調査」の人数表から、年間の離職者数÷6月末の常用労働者数で計算
export const SEPARATION_RATE = [[19, 0.3329], [24, 0.2507], [29, 0.1773], [34, 0.1459], [39, 0.1037], [44, 0.0991], [49, 0.0822], [54, 0.0803], [59, 0.0906], [64, 0.1705], [200, 0.1855]];
export const separationAt = (age) => SEPARATION_RATE.find(([max]) => age <= max)[1];
// 年齢構成(ages: [{min,max,share}])に当てはめた、世間並みの年間離職率
export function nationalSeparation(ages) {
  let sum = 0, total = 0;
  for (const g of ages) { let r = 0; for (let a = g.min; a <= g.max; a++) r += separationAt(a); sum += g.share * r / (g.max - g.min + 1); total += g.share; }
  return total > 0 ? sum / total : 0;
}

// 同じ条件で何回も試し、最終年の平均と「エースが全滅した回数」を出す
export function trialOrg(config, rules, years, runs) {
  let wiped = 0;
  const acc = { ace: 0, productivity: 0, hours: 0, burnout: 0, quit: 0, natural: 0 };
  const series = Array.from({ length: years + 1 }, () => ({ ace: 0, std: 0, low: 0, productivity: 0, hours: 0 }));
  for (let r = 0; r < runs; r++) {
    const org = runOrg({ ...config, seed: config.seed * 1000 + r }, rules, years);
    const last = org.history[org.history.length - 1];
    if (last.share.ace < 0.005) wiped++;
    acc.ace += last.share.ace; acc.productivity += last.productivity; acc.hours += last.hours;
    acc.burnout += org.exits.burnout; acc.quit += org.exits.quit; acc.natural += org.exits.natural;
    org.history.forEach((h, y) => { const s = series[y]; s.ace += h.share.ace; s.std += h.share.std; s.low += h.share.low; s.productivity += h.productivity; s.hours += h.hours; });
  }
  for (const k of Object.keys(acc)) acc[k] /= runs;
  for (const s of series) for (const k of Object.keys(s)) s[k] /= runs;
  return { runs, wiped, ...acc, series };
}

// 1つの数値(例:仕事を回す割合)を0〜100%まで変えて、それぞれ何回も試す
export function sweepOrg(config, rules, key, values, years, runs) {
  return values.map((v) => ({ value: v, ...trialOrg(config, { ...rules, [key]: v }, years, runs) }));
}
