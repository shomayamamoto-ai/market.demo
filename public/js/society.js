// 社会シミュレーター:税率と助け合いの仕組みが、挑戦する人の数と全体の生産力をどう変えるかを試す。
// 1人ずつが「確実だが少ない仕事」「危険だが多い仕事」「自分の畑だけ(税がかからない)」から、
// 自分にとって得なものを選ぶ、という仮定で動く。実在の国や自治体に合わせ込んだモデルではない。
import { makeRng, clamp } from "./rng.js";

export const SOCIETY_ASSUMPTIONS = {
  safeYield: { value: 1, note: "安全な広場で得られる食料(1年あたり・確実)" },
  riskyYield: { value: 4, note: "危険な森で得られる食料(成功した場合。腕前で0.6〜1.4倍)" },
  injury: { value: 0.25, note: "森でけがをする確率(40歳を超えると1歳ごとに2%増。けがをした年と翌年は収穫なし)" },
  homeYield: { value: 0.5, note: "自分の畑だけで暮らす場合の食料(税がかからない)" },
  effort: { value: { risky: 0.45, safe: 0.1, home: 0 }, note: "働き方ごとの大変さ(満足度から引く)" },
  starve: { value: 1.5, note: "けがをして助けが無い場合のつらさ(満足度から引く)" },
  aid: { value: 1, note: "けがをした人に配る食料" },
  admin: { value: 0.6, note: "管理にかかる割合 = この係数 × 税率(税率50%なら税収の30%が管理に消える)" },
  rethink: { value: 0.4, note: "毎年、働き方を見直す人の割合" },
  moveCost: { value: "0〜0.6", note: "隣の村へ移るときの負担(満足度換算)。村への愛着として1人ずつ違う値を持つ" },
  moveRate: { value: 0.15, note: "隣の村のほうが得な人が、その年に移る確率" },
  neighborTax: { value: 0.2, note: "隣の村の税率(助け合いは確実に機能している想定)" },
  subsidy: { value: 0.3, note: "複雑な補助金:森に行かない人に配る食料。管理にかかる割合も15ポイント増える" },
  exempt: { value: 0.3, note: "立て直し策「挑戦への還元」:森の収穫のうち税がかからない割合。けがの保障も1.3倍" },
};

export const SOCIETY_PRESETS = {
  none: { label: "A 税率0%(助け合いなし)", rules: { tax: 0 } },
  mutual: { label: "B 税率20%(助け合いあり)", rules: { tax: 0.2 } },
  heavy: { label: "C 税率50%(管理が膨らむ)", rules: { tax: 0.5 } },
  exit: { label: "D 税率50%+隣の村へ移れる", rules: { tax: 0.5, neighbor: true } },
  complex: { label: "E 税率50%+複雑な補助金", rules: { tax: 0.5, complex: true } },
  rebuild: { label: "F 立て直し(減税・簡素化・挑戦への還元)", rules: { tax: 0.5, neighbor: true, complex: true, rebuildAt: 8, rebuild: { tax: 0.2, simple: true, reward: true } } },
};

export function createSociety({ n, ages, seed }) {
  const rng = makeRng(seed);
  const people = [];
  for (let i = 0; i < n; i++) {
    const band = rng.pick(ages, (a) => a.share);
    people.push({ age: band.min + Math.floor(rng.next() * (band.max - band.min + 1)), skill: 0.6 + rng.next() * 0.8, choice: "safe", hurt: 0, gone: false, root: rng.next() * 0.6 });
  }
  return { people, n0: n, rng, year: 0, stock: 0, trust: 0, history: [], moved: 0 };
}

export function stepSociety(S, rules0, A = SOCIETY_ASSUMPTIONS) {
  const { people, rng } = S;
  // 立て直し策は、指定した年から効く
  const fix = rules0.rebuildAt != null && S.year >= rules0.rebuildAt ? rules0.rebuild : null;
  const rules = fix ? { ...rules0, tax: fix.tax, complex: fix.simple ? false : rules0.complex, reward: fix.reward, simple: fix.simple } : rules0;
  const tax = rules.tax;
  const exempt = rules.reward ? A.exempt.value : 0;
  const aid = A.aid.value * (rules.reward ? 1.3 : 1);
  const subsidy = rules.complex ? A.subsidy.value : 0;
  const adminShare = clamp(A.admin.value * tax * (rules.simple ? 0.5 : 1) + (rules.complex ? 0.15 : 0), 0, 0.95);
  const E = A.effort.value;
  const injuryOf = (p) => clamp(A.injury.value * (1 + 0.02 * Math.max(0, p.age - 40)), 0, 0.9);
  // その人から見た、各働き方の満足度の見込み(食料の平方根 − 大変さ)
  const utility = (p, t, trust, sub, ex, aidAmt) => {
    const q = injuryOf(p);
    const net = A.riskyYield.value * p.skill * (1 - t * (1 - ex));
    const hurtU = trust * Math.sqrt(aidAmt) - (1 - trust) * A.starve.value;
    return {
      risky: (1 - q) * Math.sqrt(net) + q * hurtU - E.risky,
      safe: Math.sqrt(A.safeYield.value * (1 - t) + sub * trust) - E.safe,
      home: Math.sqrt(A.homeYield.value + sub * trust) - E.home,
    };
  };
  const best = (u) => (u.risky >= u.safe && u.risky >= u.home ? "risky" : u.safe >= u.home ? "safe" : "home");

  // 1) 働き方を選ぶ / 隣の村へ移る
  const alive = people.filter((p) => !p.gone);
  for (const p of alive) {
    const u = utility(p, tax, tax > 0 ? S.trust : 0, subsidy, exempt, aid);
    if (S.year === 0 || rng.next() < A.rethink.value) p.choice = best(u);
    if (rules.neighbor) {
      const there = utility(p, A.neighborTax.value, 1, 0, 0, A.aid.value);
      if (Math.max(there.risky, there.safe, there.home) - p.root > u[p.choice] && rng.next() < A.moveRate.value) { p.gone = true; S.moved++; }
    }
  }
  // 2) 収穫と税
  let output = 0, revenue = 0, injured = 0;
  const count = { risky: 0, safe: 0, home: 0 };
  const stay = people.filter((p) => !p.gone);
  for (const p of stay) {
    count[p.choice]++;
    if (p.hurt > 0) { p.hurt--; if (p.choice === "risky") { injured++; continue; } }
    if (p.choice === "risky") {
      if (rng.next() < injuryOf(p)) { p.hurt = 1; injured++; continue; }
      const y = A.riskyYield.value * p.skill;
      output += y; revenue += y * tax * (1 - exempt);
    } else if (p.choice === "safe") { output += A.safeYield.value; revenue += A.safeYield.value * tax; }
    else output += A.homeYield.value;
  }
  // 3) 助け合い:税収から管理の分を引き、けが人と補助金に配る
  const net = revenue * (1 - adminShare);
  const claims = injured * aid + (count.safe + count.home) * subsidy;
  const fund = S.stock + net;
  const paid = Math.min(claims, fund);
  const fulfilled = claims > 0 ? paid / claims : tax > 0 ? 1 : 0;
  S.stock = (fund - paid) * 0.9;
  S.trust = S.trust * 0.5 + fulfilled * 0.5; // 「助けてもらえる」という信頼は、実績でゆっくり変わる

  const pop = stay.length;
  const snap = {
    year: S.year, tax, population: pop / S.n0, productivity: output / (S.n0 * A.safeYield.value),
    risky: pop ? count.risky / pop : 0, safe: pop ? count.safe / pop : 0, home: pop ? count.home / pop : 0,
    revenue: revenue / S.n0, admin: (revenue * adminShare) / S.n0, stock: S.stock / S.n0, trust: fulfilled,
    choices: people.map((p) => (p.gone ? "gone" : p.choice)),
  };
  S.history.push(snap);
  // 4) 年をとる(65歳で引退し、22歳の新人が入る)
  for (const p of stay) { p.age++; if (p.age >= 65) { p.age = 22; p.skill = 0.6 + rng.next() * 0.8; p.hurt = 0; p.choice = "safe"; } }
  S.year++;
  return snap;
}

export function runSociety(config, rules, years) {
  const S = createSociety(config);
  if (rules.tax > 0) S.trust = 1;
  for (let y = 0; y <= years; y++) stepSociety(S, rules);
  return S;
}

const FIELDS = ["productivity", "risky", "safe", "home", "revenue", "admin", "stock", "population", "trust"];
export function trialSociety(config, rules, years, runs) {
  const series = Array.from({ length: years + 1 }, () => Object.fromEntries(FIELDS.map((f) => [f, 0])));
  let collapsed = 0; // 最終年の生産力が「全員が広場で働く水準(100%)」を下回った回数
  for (let r = 0; r < runs; r++) {
    const S = runSociety({ ...config, seed: config.seed * 1000 + r }, rules, years);
    S.history.forEach((h, y) => { for (const f of FIELDS) series[y][f] += h[f] / runs; });
    if (S.history[years].productivity < 1) collapsed++;
  }
  return { runs, collapsed, series, last: series[years] };
}

export function sweepTax(config, rules, values, years, runs) {
  return values.map((tax) => ({ value: tax, ...trialSociety(config, { ...rules, tax }, years, runs) }));
}
