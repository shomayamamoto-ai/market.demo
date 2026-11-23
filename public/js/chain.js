// 多重下請けシミュレーター:予算が現場に届くまでに何段階で抜かれるかが、
// 現場の人数・工事の進み・できあがりの強さをどう変えるかを試す。
// 実在の業界のデータに合わせ込んだモデルではなく、仕組みの効き方を比べるための思考実験の道具。
import { makeRng, clamp } from "./rng.js";

export const CHAIN_ASSUMPTIONS = {
  stamina: { value: 5, note: "食料が届かなくても耐えられる日数(50歳以上は4日)。尽きると倒れて現場を離れる" },
  recover: { value: 0.03, note: "食料をもらえた日に戻る体力。空腹の日の消耗(1日分)は、すぐには取り戻せない" },
  mudStart: { value: 0.24, note: "予算の不足がこの割合を超えると、石をやめて泥ブロックで数を合わせる人が出始める" },
  mudSpan: { value: 0.4, note: "予算の不足がさらにこの幅だけ進むと、全員が泥ブロックに切り替える" },
  overwork: { value: 0.65, note: "納期に合わせるための無理で、余分に必要になる食料(予算の不足の割合 × この係数。3段階なら1人1日あたり約1.4個)" },
  mud: { value: 0.4, note: "泥ブロック1個の強さ。正規の石は1" },
  collapse: { value: { max: 0.95, mid: 0.51, width: 0.063 }, note: "引き渡し後に崩れる確率。強度が mid(51%)を下回るあたりで急に高くなる曲線" },
  supportFee: { value: 0.1, note: "透明化後に残る、実作業を担う業者の取り分(予算に対する割合)" },
  supportBoost: { value: 1.2, note: "透明化後、資材運びなどの支援で現場の作業が進む倍率" },
  reinforce: { value: 1.15, note: "完成後の残り日数で補強に回ったときの、1人1日あたりの強度の上積み(石1個 = 1)" },
};

// 参考にした実験(職人100人・工期30日・1段階30%・手抜きあり、各100回)の結果。係数はこの値に近づくよう調整した
export const CHAIN_REFERENCE = {
  layers: [0, 1, 2, 3, 4, 5],
  survivors: [100, 58, 37, 24, 16, 10],
  strength: [100, 75, 50, 42, 40, 40],
  collapsed: [0, 2, 51, 85, 85, 83],
};

export const CHAIN_PRESETS = {
  direct: { label: "A 中抜きなし", rules: { layers: 0, rate: 0.3 } },
  layered: { label: "B 3段階で30%ずつ抜く", rules: { layers: 3, rate: 0.3 } },
  shortcut: { label: "C B+納期に追われて手抜き", rules: { layers: 3, rate: 0.3, shortcut: true } },
  open: { label: "D 透明化(実作業の義務化+元予算の公開)", rules: { layers: 3, rate: 0.3, shortcut: true, open: true } },
};

// 予算が各段階でいくら抜かれ、現場にいくら届くか
export function relay(n, rules, A = CHAIN_ASSUMPTIONS) {
  if (rules.open) return { steps: [{ label: "実作業を担う業者", take: n * A.supportFee.value }], delivered: n * (1 - A.supportFee.value) };
  const steps = [];
  let left = n;
  for (let i = 0; i < rules.layers; i++) { const take = left * rules.rate; steps.push({ label: `${i + 1}次請け`, take }); left -= take; }
  return { steps, delivered: left };
}

export function runChain({ n, ages, seed }, rules, days = 30, A = CHAIN_ASSUMPTIONS) {
  const rng = makeRng(seed);
  const workers = Array.from({ length: n }, () => {
    const band = rng.pick(ages, (a) => a.share);
    const age = band.min + Math.floor(rng.next() * (band.max - band.min + 1));
    const max = age >= 50 ? A.stamina.value - 1 : A.stamina.value;
    return { age, max, stamina: max, alive: true };
  });
  const target = n * days, { delivered } = relay(n, rules, A);
  const boost = rules.open ? A.supportBoost.value : 1;
  let blocks = 0, strength = 0, doneDay = null, cutDays = 0, carry = 0;
  const history = [];
  for (let day = 1; day <= days; day++) {
    const alive = workers.filter((w) => w.alive);
    // 1) 届いた食料を配る(足りなければ、もらえない人が出る)
    // 無理をして働く日は、その分だけ多く食べないと体がもたない
    const need = rules.shortcut && !rules.open ? 1 + A.overwork.value * (1 - delivered / n) : 1;
    let apples = carry + delivered;
    const order = alive.map((w) => [rng.next(), w]).sort((a, b) => a[0] - b[0]);
    for (const [, w] of order) {
      if (apples >= need) { apples -= need; w.stamina = Math.min(w.max, w.stamina + A.recover.value); }
      else w.stamina -= 1;
    }
    carry = Math.min(apples, n); // 余った分は翌日に回す
    // 2) 作業。届く予算が少ないほど、石をやめて泥ブロックで数を合わせる人が増える
    const cutting = rules.shortcut && !rules.open;
    const pMud = cutting ? clamp((1 - delivered / n - A.mudStart.value) / A.mudSpan.value, 0, 1) : 0;
    let cut = 0;
    for (const w of alive) {
      if (w.stamina <= 0) continue;
      if (blocks >= target) { strength += A.reinforce.value * boost; continue; } // 完成後は補強に回る
      if (rng.next() < pMud) { cut++; continue; } // この人は泥ブロックの係(下でまとめて積む)
      blocks += boost; strength += boost;
    }
    if (cutting) {
      // 納期に合わせるため、その日の予定に足りない分を泥ブロックで埋める。無理をした分、体力を失う
      const gap = Math.max(0, Math.min(target, (target * day) / days) - blocks);
      blocks += gap; strength += gap * A.mud.value;
    }
    if (cut) cutDays++;
    if (doneDay == null && blocks >= target) doneDay = day;
    for (const w of alive) if (w.stamina <= 0) w.alive = false;
    history.push({ day, alive: workers.filter((w) => w.alive).length / n, progress: Math.min(1, blocks / target), strength: strength / target, cut: cut / Math.max(alive.length, 1), cells: workers.map((w) => (w.alive ? "ok" : "down")) });
  }
  const last = history[days - 1];
  const complete = blocks >= target - 1e-6;
  const C = A.collapse.value;
  const pCollapse = complete && last.strength < 1 ? C.max / (1 + Math.exp((last.strength - C.mid) / C.width)) : 0;
  return { history, survivors: last.alive, progress: last.progress, strength: last.strength, complete, doneDay, collapsed: complete && rng.next() < pCollapse, delivered: delivered / n };
}

export function trialChain(config, rules, days, runs) {
  const acc = { survivors: 0, progress: 0, strength: 0, complete: 0, collapsed: 0, doneDay: 0 };
  const series = Array.from({ length: days }, () => ({ alive: 0, progress: 0, strength: 0, cut: 0 }));
  let doneRuns = 0;
  for (let r = 0; r < runs; r++) {
    const x = runChain({ ...config, seed: config.seed * 1000 + r }, rules, days);
    acc.survivors += x.survivors / runs; acc.progress += x.progress / runs; acc.strength += x.strength / runs;
    if (x.complete) acc.complete++;
    if (x.doneDay) { doneRuns++; acc.doneDay += x.doneDay; }
    if (x.collapsed) acc.collapsed++;
    x.history.forEach((h, d) => { const s = series[d]; s.alive += h.alive / runs; s.progress += h.progress / runs; s.strength += h.strength / runs; s.cut += h.cut / runs; });
  }
  acc.doneDay = doneRuns ? acc.doneDay / doneRuns : null;
  return { runs, ...acc, series, delivered: relay(config.n, rules).delivered / config.n };
}

export function sweepLayers(config, rules, values, days, runs) {
  return values.map((layers) => ({ value: layers, ...trialChain(config, { ...rules, layers }, days, runs) }));
}
