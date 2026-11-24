// 公的統計から「合成人口(ペルソナの集まり)」を作る。
// 実在の個人のデータではなく、統計の分布に合うように乱数で組み立てた仮想の生活者。
import { makeRng, clamp } from "./rng.js";
import { CATEGORY_KEYS } from "./constants.js";

// 統計に無く、モデルとして置いた仮定。画面の「出典と仮定」に一覧表示する。
export const ASSUMPTIONS = {
  incomeSigma: { value: 0.4, note: "同じ年齢・性別・働き方の中での年収のばらつき(対数正規分布の標準偏差)" },
  selfEmployedFactor: { value: 0.8, note: "自営業・家族従業者の年収(正規雇用に対する倍率)" },
  executiveFactor: { value: 1.5, note: "役員の年収(正規雇用に対する倍率)" },
  spendSigma: { value: 0.3, note: "費目ごとの支出の個人差(対数正規分布の標準偏差)" },
  spendTotal: { value: "家計調査の全国平均に一致させる", note: "支出の全国平均(二人以上の世帯の1人あたり、単身世帯)は、最後に家計調査の値にそろえる。このため、成績表のこの2項目は「検算」ではなく「合わせた結果」になる" },
  quintileDamp: { value: 0.5, note: "所得階層による支出総額の差を、どれだけ効かせるか。統計の差には年齢の違いも混ざっているため、半分だけ反映する。費目ごとの差は、家計調査から推定した支出弾力性で決める" },
  marriedCompat: { value: { single: 0.03, singleParent: 0.05 }, note: "既婚者が一人暮らしをする割合の上限(単身赴任など)と、ひとり親世帯になる重み" },
  unmarriedCompat: { value: { coupleOnly: 0.03 }, note: "未婚・離死別の人が「夫婦のみ」の世帯になる重み" },
  traits: { value: "年齢・年収・ネット利用から作った指標", note: "価格への敏感さと周りへの同調しやすさは、消費者庁「消費者意識基本調査」(2021年・2025年)の年代別・男女別の割合に合わせた。調査で上位に入る人の割合と、ここで点数が上位の人の割合を年代ごとに比べ、係数を決めた。合わせる前は、高齢者ほど価格に敏感になっていた(調査では若い人ほど価格を重視する)。新しもの好き・品質重視・健康志向は傾向を仮定したまま(新しもの好きは調査に合わせると、高齢者のネット利用が実際より多く出たため)" },
};

const bandOf = (bands, age) => {
  for (const b of bands) if (age >= b.min && age <= (b.max ?? 200)) return b;
  return age < bands[0].min ? null : bands[bands.length - 1];
};

// 人数 n を重みに比例して整数で割り振る(最大剰余法)。合計は必ず n になる。
function allocate(weights, n) {
  const total = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / total) * n);
  const out = raw.map(Math.floor);
  const rest = n - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < rest; k++) out[order[k][1]]++;
  return out;
}

const lognormal = (rng, median, sigma) => median * Math.exp(sigma * rng.normal());
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const round2 = (x) => Math.round(x * 100) / 100;
// {名前: 重み} から1つ選ぶ
function pickKey(rng, weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rng.next() * total;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
  return Object.keys(weights)[0];
}

export const WORK_LABEL = { regular: "正規雇用", nonRegular: "非正規雇用", self: "自営・家族従業", exec: "役員", unemployed: "求職中", student: "学生", housework: "家事", none: "無職", preschool: "未就学", pupil: "小中学生" };
export const HOUSEHOLD_LABEL = { single: "単身", coupleOnly: "夫婦のみ", coupleKids: "夫婦と子", singleParent: "ひとり親と子", other: "その他の世帯" };

export function generatePersonas(D, { n = 10000, seed = 1 } = {}) {
  const rng = makeRng(seed);
  const A = ASSUMPTIONS;
  const pop = D.population;

  // 1) 年齢5歳階級 × 性別 のマス目に、人口比どおりに人数を割り振る
  const cells = [];
  for (const g of pop.ageGroups) {
    cells.push({ g, sex: "male", w: g.male });
    cells.push({ g, sex: "female", w: g.female });
  }
  const counts = allocate(cells.map((c) => c.w), n);
  const totalPeople = cells.reduce((a, c) => a + c.w, 0) * 1000;
  const weight = totalPeople / n; // ペルソナ1人が代表する実人数

  const personas = [];
  cells.forEach((cell, ci) => {
    for (let k = 0; k < counts[ci]; k++) {
      const { g, sex } = cell;
      const span = g.max == null ? 10 : g.max - g.min + 1;
      // 最上位階級(90歳以上)は若い側に寄せる
      const age = g.max == null ? g.min + Math.floor(span * rng.next() ** 2) : g.min + Math.floor(rng.next() * span);
      personas.push(buildPersona(D, A, rng, { id: personas.length + 1, age, sex, weight }));
    }
  });
  applyIncomeTier(D, A, personas);
  return personas;
}

function buildPersona(D, A, rng, base) {
  const { age, sex } = base;
  const p = { ...base };

  // 2) 居住地(年齢・性別ごとの都道府県別人口に比例)
  const prefW = bandOf(D.population.prefByAge, age)[sex];
  let r = rng.next() * prefW.reduce((a, b) => a + b, 0), pi = 0;
  for (; pi < prefW.length - 1; pi++) { r -= prefW[pi]; if (r <= 0) break; }
  const pref = D.population.prefectures[pi];
  p.prefecture = pref.name;
  p.region = pref.region;

  // 3) 配偶関係(15歳以上)
  p.marital = "未婚";
  if (age >= 15) {
    const m = bandOf(D.marital.bands, age)?.[sex];
    if (m) {
      const u = rng.next();
      p.marital = u < m.never ? "未婚" : u < m.never + m.married ? "既婚" : "離別・死別";
    }
  }
  const married = p.marital === "既婚";

  // 4) 就業(労働力調査の内訳に比例)
  let status = age < 6 ? "preschool" : "pupil";
  let partTime = false;
  if (age >= 15) {
    const L = bandOf(D.labour.bands, age)[sex];
    const rest = Math.max(0, 1 - L.self - L.exec - L.regular - L.nonRegular - L.unemployed - L.student - L.housework);
    status = pickKey(rng, { self: L.self, exec: L.exec, regular: L.regular, nonRegular: L.nonRegular, unemployed: L.unemployed, student: L.student, housework: L.housework, none: rest });
    partTime = status === "nonRegular" && rng.next() < L.partShare;
  }
  p.status = status;
  p.working = ["regular", "nonRegular", "self", "exec"].includes(status);
  p.work = status === "nonRegular" && partTime ? "パート・アルバイト" : status === "none" && age >= 65 ? "無職(年金等)" : WORK_LABEL[status];

  // 5) 本人の年収(万円):賃金 + 年金
  let income = 0;
  if (p.working) {
    const w = bandOf(D.wage.bands, age)[sex];
    const median = status === "regular" ? w.regular : status === "exec" ? w.regular * A.executiveFactor.value
      : status === "self" ? w.regular * A.selfEmployedFactor.value : partTime ? w.partTime : w.nonRegular;
    income += lognormal(rng, median * (partTime ? 1 : pref.wageIndex), A.incomeSigma.value);
  }
  const pen = age >= 60 ? bandOf(D.pension.bands, age)?.[sex] : null;
  if (pen && rng.next() < pen.rate) {
    let u = rng.next();
    for (const [lo, hi, share] of pen.classes) { u -= share; if (u <= 0) { const amount = lo + rng.next() * (hi - lo); income += amount; p.pension = Math.round(amount); break; } }
  }
  p.income = Math.round(income);
  if (p.pension) p.pension = Math.min(p.pension, p.income); // 年収のうち年金の分(万円)。税と保険料の計算で、賃金と分けて扱う

  // 6) 世帯の種類(国勢調査の年齢・性別ごとの分布に、配偶関係とのつじつまを重みで反映)
  // 一人暮らしの割合は統計に合わせる。既婚者の一人暮らしは少数とし、残りを未婚・離死別の人に割り当てる
  const T = { ...bandOf(D.household.typeBands, age)[sex] };
  const marriedShare = age >= 15 ? bandOf(D.marital.bands, age)?.[sex]?.married ?? 0 : 0;
  const singleMarried = Math.min(T.single, A.marriedCompat.value.single);
  const pSingle = age < 15 ? T.single : married ? singleMarried
    : clamp((T.single - marriedShare * singleMarried) / Math.max(1 - marriedShare, 0.02), 0, 0.98);
  if (rng.next() < pSingle) p.householdType = "single";
  else {
    delete T.single;
    if (married) T.singleParent *= A.marriedCompat.value.singleParent;
    else if (age >= 18) T.coupleOnly *= A.unmarriedCompat.value.coupleOnly;
    p.householdType = pickKey(rng, T);
  }
  p.single = p.householdType === "single";
  p.household = HOUSEHOLD_LABEL[p.householdType];
  // 親と暮らす子の立場か(世帯主世代ではない)
  p.asChild = !p.single && !married && age < 30;

  // 7) 月々の支出(円/月・1人あたり):年齢 × 世帯の種類 × 地方
  const S = D.spending;
  let row, members;
  if (p.single) { row = bandOf(S.single[sex], age); members = 1; }
  else { row = bandOf(S.twoPlus, p.asChild ? age + 30 : age); members = row.members; }
  const regionF = S.region[pref.spendRegion];
  p._row = row; p._members = members;
  p.spend = {};
  for (const key of CATEGORY_KEYS) {
    let v = (row.items[key] / members) * regionF[key] * lognormal(rng, 1, A.spendSigma.value);
    // 教育費は、子ども本人と子育て世帯に寄せる
    if (key === "education" && !p.single) v *= age < 23 || p.householdType === "coupleKids" || p.householdType === "singleParent" ? 1.6 : 0.15;
    p.spend[key] = v;
  }

  // 8) デジタル利用
  const dg = bandOf(D.digital.bands, age);
  p.internet = dg ? rng.next() < dg.internet : false;
  p.sns = p.internet && dg ? rng.next() < dg.sns / Math.max(dg.internet, 0.01) : false;
  p.ec = p.internet && dg ? rng.next() < dg.ec / Math.max(dg.internet, 0.01) : false; // ネットで買い物をする人

  // 9) 貯蓄(万円、世帯単位。25歳以上)
  p.savings = null;
  if (age >= 25) {
    const q = bandOf(D.savings.bands, age).q, pts = [[0, q[0] * 0.2], [0.1, q[0]], [0.25, q[1]], [0.5, q[2]], [0.75, q[3]], [0.9, q[4]], [1, q[4] * 2.2]];
    const u = rng.next();
    for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) { const t = (u - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]); p.savings = Math.round(pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])); break; }
  }

  // 10) 価値観(0〜1)。統計に無いので仮定で付与。年収との関係は applyIncomeTier で反映
  p._z = [rng.normal(), rng.normal(), rng.normal(), rng.normal(), rng.normal(), rng.next()];
  return p;
}

// 所得階層(五分位)を決め、支出と価値観に反映する
function applyIncomeTier(D, A, personas) {
  // 年齢10歳×性別の平均年収(配偶者・親の年収の見込みに使う)
  const mean = {};
  for (const p of personas) { if (p.age < 18) continue; const k = `${p.sex}${Math.floor(p.age / 10)}`; (mean[k] ??= [0, 0]); mean[k][0] += p.income; mean[k][1]++; }
  const avg = (sex, age) => { const m = mean[`${sex}${Math.floor(clamp(age, 18, 99) / 10)}`]; return m ? m[0] / m[1] : 0; };
  const other = (sex) => (sex === "male" ? "female" : "male");
  for (const p of personas) {
    p.householdIncome = p.income
      + (p.marital === "既婚" ? avg(other(p.sex), p.age) : 0)
      + (p.asChild ? avg("male", p.age + 30) + avg("female", p.age + 30) * 0.6 : 0);
  }
  for (const group of [personas.filter((p) => p.single), personas.filter((p) => !p.single)]) {
    const sorted = [...group].sort((a, b) => a.householdIncome - b.householdIncome);
    sorted.forEach((p, i) => (p.tier = Math.min(4, Math.floor((i / sorted.length) * 5))));
  }
  const overall = D.wage.overallAnnualManYen;
  for (const p of personas) {
    // 所得階層ごとの支出総額の差に、費目ごとの支出弾力性(家計調査から推定)を掛けて、費目別の差を出す
    const level = D.spending.quintileTotal[p.single ? "single" : "twoPlus"][p.tier], E = D.spending.elasticity;
    let total = 0;
    for (const key of CATEGORY_KEYS) { p.spend[key] = Math.round(p.spend[key] * level ** (A.quintileDamp.value * E[key])); total += p.spend[key]; }
    p.spendTotal = total;
  }
  // ばらつき・地方差・所得差を掛けたあとで、年齢階級ごとの平均が家計調査の表の値に戻るようにそろえる
  // (掛け算を重ねると平均が少しずつ上にずれるため。人ごとの差は保ったまま、平均だけを合わせる)
  const cells = new Map();
  for (const p of personas) { if (!cells.has(p._row)) cells.set(p._row, []); cells.get(p._row).push(p); }
  for (const [row, list] of cells) {
    const w = list.reduce((a, p) => a + p.weight, 0);
    for (const key of CATEGORY_KEYS) {
      const mean = list.reduce((a, p) => a + p.weight * p.spend[key], 0) / w, target = row.items[key] / list[0]._members;
      if (mean > 0) for (const p of list) p.spend[key] = Math.round((p.spend[key] * target) / mean);
    }
  }
  // 最後に、全国の平均(二人以上の世帯の1人あたり、単身世帯)が家計調査の値に一致するよう、全体を同じ倍率でそろえる。
  // 世帯主の年齢で区切った表を1人ずつに当てはめるときに生じる、数%のずれを取り除くため(人ごと・費目ごとの差は変えない)
  for (const [single, key] of [[true, "spendSingle"], [false, "spendTwoPlus"]]) {
    const target = D.targets.find((t) => t.key === key)?.value, list = personas.filter((p) => p.single === single);
    if (!target || !list.length) continue;
    const mean = list.reduce((a, p) => a + p.weight * CATEGORY_KEYS.reduce((x, k) => x + p.spend[k], 0), 0) / list.reduce((a, p) => a + p.weight, 0);
    for (const p of list) for (const k of CATEGORY_KEYS) p.spend[k] = Math.round((p.spend[k] * target) / mean);
  }
  for (const p of personas) {
    p.spendTotal = CATEGORY_KEYS.reduce((a, key) => a + p.spend[key], 0);
    delete p._row; delete p._members;
    p.householdIncome = Math.round(p.householdIncome);
    const [z1, z2, z3, z4, z5, u] = p._z;
    delete p._z;
    const inc = (p.tier - 2) / 2; // −1(低い)〜+1(高い)
    const z = (x) => x * 0.9;
    const C = TRAIT_COEF, fem = p.sex === "female" ? 1 : 0;
    p.traits = {
      price: round2(sigmoid(C.price.a + C.price.inc * inc + C.price.age * p.age + fem * C.price.female + z(z1))), // 価格に敏感
      novelty: round2(sigmoid(C.novelty.a + C.novelty.age * p.age + (p.sns ? 0.5 : 0) + z(z2))), // 新しもの好き
      health: round2(sigmoid(-1.0 + p.age / 40 + (p.sex === "female" ? 0.3 : 0) + z(z3))), // 健康志向
      quality: round2(sigmoid(C.quality.a + C.quality.inc * inc + C.quality.age * p.age + fem * C.quality.female + z(z4))), // 品質・ブランド重視
      social: round2(sigmoid(C.social.a + C.social.age * p.age + (p.sns ? 0.8 : -0.4) + fem * C.social.female + z(z5))), // 周りの評判に影響される
    };
    // 新商品の採用タイプ(ロジャーズの5区分)を決める元になる点数
    p.innovScore = p.traits.novelty * 0.7 + p.traits.social * 0.15 + (p.internet ? 0.15 : 0) + u * 0.05;
    void overall;
  }
}

// 価値観の点数を作る係数(シグモイドの中身 = a + inc × 所得の位置 + age × 年齢 + female × 女性)
// price・social の年齢と男女の係数は、消費者庁「消費者意識基本調査」の年代別・男女別の割合に合わせた
// (価格の安さを「とても重視」2021年、「多数が支持するものは良いと思う」2025年)。
// 切片は、15歳以上の平均が合わせる前と変わらないように決めた(全体の水準は変えず、年代差と男女差だけを直した)。
// novelty も「新しい物が好き」(2021年)に合わせられるが、合わせると高齢者のネット利用・動画視聴が実際より多く出た(年代差が実際の半分に縮む)。
// このモデルの novelty は「デジタルに慣れているか」も兼ねているためと考え、元のまま残した。quality は合わせても良くならなかったので元のまま
export const TRAIT_COEF = {
  price: { a: 1.527, inc: -0.9, age: -0.025, female: 0 },
  novelty: { a: 1.2, age: -1 / 32 },
  quality: { a: -0.2, inc: 0.7, age: 1 / 120, female: 0 },
  social: { a: -0.844, age: 0.005, female: 0.2 },
};
// ロジャーズの普及理論の5区分を、新しもの好き度の順位で割り当てる
export const ADOPTER_TYPES = [
  { key: "innovator", label: "イノベーター", share: 0.025 },
  { key: "early_adopter", label: "アーリーアダプター", share: 0.135 },
  { key: "early_majority", label: "アーリーマジョリティ", share: 0.34 },
  { key: "late_majority", label: "レイトマジョリティ", share: 0.34 },
  { key: "laggard", label: "ラガード", share: 0.16 },
];
export function assignAdopterTypes(personas) {
  const adults = personas.filter((p) => p.age >= 15).sort((a, b) => b.innovScore - a.innovScore);
  let i = 0, acc = 0;
  for (const t of ADOPTER_TYPES) {
    acc += t.share;
    const end = Math.round(acc * adults.length);
    for (; i < end; i++) adults[i].adopter = t.key;
  }
  for (const p of personas) if (!p.adopter) p.adopter = "early_majority";
  return personas;
}

// モデルの値と、公表されている合計値を見比べる(検算)
export function validate(D, personas) {
  const sum = (list, f) => list.reduce((a, p) => a + f(p), 0);
  const W = (list) => sum(list, (p) => p.weight);
  const twoPlus = personas.filter((p) => !p.single), single = personas.filter((p) => p.single), adults = personas.filter((p) => p.age >= 15);
  const model = {
    workers: W(personas.filter((p) => p.working)),
    regular: W(personas.filter((p) => p.status === "regular")),
    nonRegular: W(personas.filter((p) => p.status === "nonRegular")),
    singles: W(single),
    tokyo: W(personas.filter((p) => p.prefecture === "東京都")),
    internet: W(personas.filter((p) => p.internet)) / W(personas.filter((p) => p.age >= 6)),
    spendTwoPlus: sum(twoPlus, (p) => p.weight * p.spendTotal) / W(twoPlus),
    spendSingle: sum(single, (p) => p.weight * p.spendTotal) / W(single),
    married: W(adults.filter((p) => p.marital === "既婚")) / W(adults),
  };
  return D.targets.map((t) => ({ ...t, model: model[t.key], error: model[t.key] / t.value - 1 }));
}

// AIに渡す・画面に出すための短い自己紹介
export function describePersona(p) {
  const sexLabel = p.sex === "male" ? "男性" : "女性";
  return `${p.age}歳・${sexLabel}・${p.prefecture}・${p.work}・${p.household}`;
}
