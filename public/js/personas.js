// 公的統計から「合成人口(ペルソナの集まり)」を作る。
// 実在の個人のデータではなく、統計の分布に合うように乱数で組み立てた仮想の生活者。
import { makeRng, clamp } from "./rng.js";
import { CATEGORY_KEYS } from "./constants.js";

// 統計に無く、モデルとして置いた仮定。画面の「出典と仮定」に一覧表示する。
export const ASSUMPTIONS = {
  incomeSigma: { value: 0.45, note: "同じ年齢・性別の中での年収のばらつき(対数正規分布の標準偏差)" },
  pensionAnnualManYen: { value: { male: 190, female: 125 }, note: "65歳以上・非就業者の年収(年金等)の中心値。万円" },
  nonWorkingIncomeManYen: { value: 30, note: "64歳以下・非就業者の本人年収の中心値。万円" },
  spendIncomeElasticity: { value: 0.35, note: "年収が平均より高い人ほど支出も増える度合い" },
  spendSigma: { value: 0.3, note: "費目ごとの支出の個人差(対数正規分布の標準偏差)" },
  marriedSingleRate: { value: 0.03, note: "既婚者のうち単身で暮らす人(単身赴任等)の割合" },
  prefectureIndependent: { value: true, note: "居住都道府県は年齢・性別と独立に、人口比で割り当てる" },
  traits: { value: "年齢・年収・ネット利用から作った指標", note: "価値観(価格感度・新しもの好き等)は公的統計に無いため、傾向を仮定して乱数で付与" },
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
  let rest = n - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < rest; k++) out[order[k][1]]++;
  return out;
}

const lognormal = (rng, median, sigma) => median * Math.exp(sigma * rng.normal());
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

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
      // 最上位階級(90歳以上など)は若い側に寄せる
      const age = g.max == null ? g.min + Math.floor(span * rng.next() ** 2) : g.min + Math.floor(rng.next() * span);
      personas.push(buildPersona(D, A, rng, { id: personas.length + 1, age, sex, weight }));
    }
  });
  return personas;
}

function buildPersona(D, A, rng, base) {
  const { age, sex } = base;
  const p = { ...base };

  // 2) 居住地
  const pref = rng.pick(D.population.prefectures, (x) => x.pop);
  p.prefecture = pref.name;
  p.region = pref.region;

  // 3) 配偶関係(15歳以上)
  p.marital = "未婚";
  if (age >= 15) {
    const m = bandOf(D.marital.bands, age)?.[sex];
    if (m) {
      const r = rng.next();
      p.marital = r < m.never ? "未婚" : r < m.never + m.married ? "既婚" : "離別・死別";
    }
  }

  // 4) 就業
  const emp = age >= 15 ? bandOf(D.employment.bands, age)?.[sex] : null;
  if (age < 6) p.work = "未就学";
  else if (age < 15) p.work = "小中学生";
  else if (emp && rng.next() < emp.rate) p.work = rng.next() < emp.regularShare ? "正規雇用など" : "非正規雇用など";
  else if (age <= 22) p.work = "学生";
  else if (age >= 65) p.work = "無職(年金等)";
  else p.work = "無職・家事";
  const working = p.work === "正規雇用など" || p.work === "非正規雇用など";

  // 5) 本人の年収(万円)
  let median = 0;
  if (working) {
    const w = bandOf(D.wage.bands, age) ?? D.wage.bands[0];
    const monthly = p.work === "非正規雇用など" ? w[sex].nonRegular : w[sex].regular; // 千円/月
    const bonus = p.work === "非正規雇用など" ? D.wage.bonusMonths.nonRegular : D.wage.bonusMonths.regular;
    median = (monthly * (12 + bonus)) / 10;
    if (age <= 22 && p.work === "非正規雇用など") median *= 0.5; // 学生アルバイト等を想定
  } else if (age >= 65) median = A.pensionAnnualManYen.value[sex];
  else if (age >= 18) median = A.nonWorkingIncomeManYen.value;
  p.income = median > 0 ? Math.round(lognormal(rng, median, A.incomeSigma.value)) : 0;

  // 6) 世帯(単身かどうか・子どもの有無)
  // 統計は「その年齢・性別のうち単身世帯の人の割合」。既婚者の単身は少数とみなし、
  // 残りを未婚・離死別の人に割り当てる。
  const hh = bandOf(D.household.singleRate, age);
  const overall = hh ? hh[sex] : 0;
  const marriedShare = bandOf(D.marital.bands, age)?.[sex]?.married ?? 0;
  const pSingle = p.marital === "既婚"
    ? A.marriedSingleRate.value
    : clamp((overall - marriedShare * A.marriedSingleRate.value) / Math.max(1 - marriedShare, 0.05), 0, 0.95);
  p.single = age >= 18 && rng.next() < pSingle;
  if (p.single) p.household = "単身";
  else if (age < 18) p.household = "親と同居";
  else if (p.marital === "既婚") {
    const kids = age >= 25 && age <= 54 ? 0.68 : age < 25 ? 0.35 : 0.2;
    p.household = rng.next() < kids ? "夫婦と子" : "夫婦のみ";
  } else p.household = age < 35 ? "親と同居" : rng.next() < 0.3 ? "ひとり親と子" : "親族と同居";

  // 7) 月々の支出(円/月・1人あたり)
  const S = D.spending;
  let row, members;
  if (p.single) {
    row = bandOf(S.single[sex], age);
    members = 1;
  } else {
    // 子どもは親世代(40代)の世帯、それ以外は本人の年齢を世帯主年齢とみなす
    row = bandOf(S.twoPlus, age < 25 ? 47 : age);
    members = row.members;
  }
  const avgIncome = D.wage.overallAnnualManYen;
  const incomeFactor = p.income > 0 ? (p.income / avgIncome) ** A.spendIncomeElasticity.value : 1;
  p.spend = {};
  let total = 0;
  for (const key of CATEGORY_KEYS) {
    let v = (row.items[key] / members) * lognormal(rng, 1, A.spendSigma.value);
    if (age >= 18) v *= clamp(incomeFactor, 0.6, 1.8);
    // 教育費は、子ども本人と子育て世帯に寄せる
    if (key === "education" && !p.single) v *= age < 23 || p.household === "夫婦と子" || p.household === "ひとり親と子" ? 1.6 : 0.15;
    p.spend[key] = Math.round(v);
    total += p.spend[key];
  }
  p.spendTotal = total;

  // 8) デジタル利用
  const dg = bandOf(D.digital.bands, age);
  p.internet = dg ? rng.next() < dg.internet : false;
  p.sns = p.internet && dg ? rng.next() < dg.sns / Math.max(dg.internet, 0.01) : false;

  // 9) 価値観(0〜1)。統計に無いので仮定で付与
  const z = () => rng.normal() * 0.9;
  const inc = p.income > 0 ? Math.log(p.income / avgIncome) : -0.5;
  p.traits = {
    price: round2(sigmoid(0.3 - 0.8 * inc + z())), // 価格に敏感
    novelty: round2(sigmoid(1.2 - age / 32 + (p.sns ? 0.5 : 0) + z())), // 新しもの好き
    health: round2(sigmoid(-1.0 + age / 40 + (sex === "female" ? 0.3 : 0) + z())), // 健康志向
    quality: round2(sigmoid(-0.2 + 0.6 * inc + age / 120 + z())), // 品質・ブランド重視
    social: round2(sigmoid(0.4 - age / 60 + (p.sns ? 0.8 : -0.4) + z())), // 周りの評判に影響される
  };

  // 10) 新商品の採用タイプ(ロジャーズの5区分)。後で順位から割り当てる元になる点数
  p.innovScore = p.traits.novelty * 0.7 + p.traits.social * 0.15 + (p.internet ? 0.15 : 0) + rng.next() * 0.05;
  return p;
}

const round2 = (x) => Math.round(x * 100) / 100;

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

// AIに渡す・画面に出すための短い自己紹介
export function describePersona(p) {
  const sexLabel = p.sex === "male" ? "男性" : "女性";
  return `${p.age}歳・${sexLabel}・${p.prefecture}・${p.work}・${p.household}`;
}
