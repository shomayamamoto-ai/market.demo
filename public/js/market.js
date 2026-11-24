// 市場規模の計算(統計モード)と、AIインタビュー結果の集計
import { makeRng, clamp } from "./rng.js";
import { AGE_BANDS, ageBandOf, CATEGORY_KEYS } from "./constants.js";

const PRICE = { pivot: 0.1, power: 2.6 };
export const MARKET_ASSUMPTIONS = {
  priceCurve: { value: "費目予算の10%で半減・べき2.6", note: "価格が、その費目の年間支出に占める割合で購入確率を下げる曲線。割合が10%を超えるあたりで、1%の値上げに対し1.3〜2.6%の減少になるよう設定(Tellis 1988; Bijmolt ほか 2005 の平均に合わせた)。ごく安い商品では価格の影響は小さい" },
  brandElasticity: { value: 2.62, note: "相場の価格から1%値上げしたときに、買う人が何%減るか。1,851件の推定をまとめたメタ分析の平均(Bijmolt, van Heerde & Pieters 2005)。それ以前のメタ分析では1.76(Tellis 1988)。同じ種類の商品の中で他社に移る分を含む、1つの商品についての値。相場の価格を入れたとき、または価格の違う案を比べるときに使う" },
  intentWeights: {
    value: { 5: 0.7, 4: 0.25, 3: 0.05, 2: 0, 1: 0 },
    note: "「買う」と答えた人が実際に買う割合。アンケートの意向は実際より高く出るため割り引く。実務資料では「必ず買う」70〜75%、「たぶん買う」25%の例があるが、査読論文での裏づけは確認できていない。意向と実際の購入の相関は平均0.49(Morwitz, Steckel & Gupta 2007、40研究。二次要約で確認)。自動車の購入確率を聞いた調査では、いちばん高い確率を答えた人でも、6か月以内に買ったのは55%だった(Juster 1966)",
  },
  wtpDiscount: {
    value: 0.8,
    note: "「払ってもよい」と答えた金額を実際の支払いに直す割引。仮の質問では実際より高く答える傾向があり、消費財で平均約21%、全体の中央値で1.35倍の過大と報告されている(Schmidt & Bijmolt 2020; Murphy et al. 2005)",
  },
  baseInterest: { value: 0.12, note: "統計モードで、条件が合う人のうち関心を持つ人の基準割合" },
};

// 対象条件に合うか
export function inTarget(p, t = {}) {
  if (p.age < (t.ageMin ?? 0) || p.age > (t.ageMax ?? 200)) return false;
  if (t.sex && t.sex !== "all" && p.sex !== t.sex) return false;
  if (t.onlineOnly && !p.internet) return false;
  if (t.regions?.length && !t.regions.includes(p.region)) return false;
  if (t.incomeMin && p.income < t.incomeMin) return false;
  if (t.works?.length && !t.works.includes(p.work)) return false;
  if (t.households?.length && !t.households.includes(p.household)) return false;
  return true;
}

// 統計モード:その人が(商品を知ったうえで)買う確率
// 価格と、その費目に普段使っている金額のつり合い + 価値観 から計算する簡易モデル
export function buyProbability(p, product) {
  if (!inTarget(p, product.target)) return 0;
  const yearCost = product.price * product.perYear;
  const budget = Math.max(p.spend[product.category] * 12, 1);
  const ratio = yearCost / budget; // その費目の年間支出に占める割合
  // 費目予算の10%で関心が半減。値上げへの反応が、実際の商品の研究(1%の値上げで1.8〜2.6%減)に近づく形にしている
  const affordAt = (price) => 1 / (1 + ((price * product.perYear) / budget / PRICE.pivot) ** PRICE.power);
  let afford = affordAt(product.price);
  // 相場の価格が分かっているときは、そこからの値上げ・値下げに、実際の商品の研究と同じ強さで反応させる(1%の値上げで約2.6%減)。
  // 値上げ側は、予算から見た買いやすさのほうが厳しければ、そちらに従う
  const ref = product.refPrice;
  if (ref > 0 && product.price > 0 && Math.abs(product.price / ref - 1) > 1e-9) {
    const rel = affordAt(ref) * (product.price / ref) ** -MARKET_ASSUMPTIONS.brandElasticity.value;
    afford = product.price > ref ? Math.min(afford, rel) : Math.min(rel, affordAt(ref) * 3);
  }
  const a = product.appeal ?? {};
  // 訴求点と価値観の相性(-1〜+1 程度)
  const fit =
    (a.novelty ?? 0) * (p.traits.novelty - 0.5) +
    (a.health ?? 0) * (p.traits.health - 0.5) +
    (a.quality ?? 0) * (p.traits.quality - 0.5) +
    (a.cheap ?? 0) * (p.traits.price - 0.5);
  const base = product.baseInterest ?? MARKET_ASSUMPTIONS.baseInterest.value;
  return clamp(base * afford * (1 + 1.5 * fit), 0, 0.95);
}

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

// 統計モードの市場規模
export function marketSize(personas, product) {
  const target = personas.filter((p) => inTarget(p, product.target));
  const yearCost = product.price * product.perYear;
  const people = sum(target, (p) => p.weight);
  const categorySpend = sum(target, (p) => p.weight * p.spend[product.category] * 12);
  const buyers = sum(target, (p) => p.weight * buyProbability(p, product));
  return {
    population: sum(personas, (p) => p.weight),
    targetPeople: people, // 対象人口
    categorySpend, // 対象者がその費目に使う年間総額(=取り合うお財布の大きさ)
    potentialBuyers: buyers, // 全員が商品を知った場合の購入者数
    potentialRevenue: buyers * yearCost,
    walletShare: categorySpend > 0 ? (buyers * yearCost) / categorySpend : 0,
    // 価格を1%上げたとき、購入者が何%減るか(このモデルが想定している価格への敏感さ)
    elasticity: buyers > 0 ? (sum(target, (p) => p.weight * buyProbability(p, { ...product, price: product.price * 1.01 })) / buyers - 1) / 0.01 : 0,
    breakdown: breakdown(target, (p) => p.weight * buyProbability(p, product)),
  };
}

// 年代×性別の内訳
export function breakdown(personas, valueOf) {
  const rows = AGE_BANDS.map((b) => ({ label: b.label, male: 0, female: 0, people: 0 }));
  const index = Object.fromEntries(rows.map((r) => [r.label, r]));
  for (const p of personas) {
    const r = index[ageBandOf(p.age)];
    r[p.sex] += valueOf(p);
    r.people += p.weight;
  }
  return rows;
}

// 家計全体の支出を合計して、国の統計(家計最終消費支出)と見比べるための検算値
export function totalSpendingCheck(personas) {
  const byCategory = {};
  for (const key of CATEGORY_KEYS) byCategory[key] = sum(personas, (p) => p.weight * p.spend[key] * 12);
  return { byCategory, total: Object.values(byCategory).reduce((a, b) => a + b, 0) };
}

// AIインタビュー用に、対象者から年代×性別の比率を保って k 人選ぶ
export function stratifiedSample(personas, target, k, seed = 1) {
  const rng = makeRng(seed);
  const pool = personas.filter((p) => inTarget(p, target));
  if (pool.length <= k) return pool.map((p) => ({ ...p, sampleWeight: p.weight }));
  const groups = new Map();
  for (const p of pool) {
    const key = `${ageBandOf(p.age)}|${p.sex}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const totalWeight = sum(pool, (p) => p.weight);
  const picked = [];
  const entries = [...groups.values()].sort((a, b) => b.length - a.length);
  let remaining = k;
  entries.forEach((members, i) => {
    const share = Math.round((members.length / pool.length) * k);
    const take = i === entries.length - 1 ? remaining : Math.min(Math.max(share, 1), remaining, members.length);
    remaining -= take;
    const copy = [...members];
    for (let j = 0; j < take && copy.length; j++) picked.push(copy.splice(Math.floor(rng.next() * copy.length), 1)[0]);
  });
  // 選ばれた1人が代表する実人数(層ごとに補正)
  const counts = new Map();
  for (const p of picked) counts.set(`${ageBandOf(p.age)}|${p.sex}`, (counts.get(`${ageBandOf(p.age)}|${p.sex}`) || 0) + 1);
  return picked.map((p) => {
    const key = `${ageBandOf(p.age)}|${p.sex}`;
    const groupWeight = sum(groups.get(key), (q) => q.weight);
    return { ...p, sampleWeight: groupWeight / counts.get(key), targetWeight: totalWeight };
  });
}

// AIに渡すペルソナ情報(必要な項目だけ)
export function personaForLLM(p) {
  return {
    id: p.id,
    年齢: p.age,
    性別: p.sex === "male" ? "男性" : "女性",
    居住地: p.prefecture,
    就業: p.work,
    本人年収_万円: p.income,
    配偶関係: p.marital,
    世帯: p.household,
    世帯年収の見込み_万円: p.householdIncome,
    世帯の貯蓄_万円: p.savings,
    ネットで買い物: p.ec,
    月の支出_円: p.spend,
    ネット利用: p.internet,
    SNS利用: p.sns,
    価値観_0から1: {
      価格に敏感: p.traits.price,
      新しもの好き: p.traits.novelty,
      健康志向: p.traits.health,
      品質重視: p.traits.quality,
      評判に影響される: p.traits.social,
    },
  };
}

// AIインタビュー結果を人口に引き伸ばして集計する
export function aggregateReactions(sample, reactions, brief, intentWeights = MARKET_ASSUMPTIONS.intentWeights.value) {
  const byId = new Map(reactions.map((r) => [r.id, r]));
  const rows = [];
  for (const p of sample) {
    const r = byId.get(p.id);
    if (!r) continue;
    const intent = clamp(Math.round(r.intent), 1, 5);
    rows.push({ p, r: { ...r, intent }, prob: intentWeights[intent] ?? 0 });
  }
  const people = sum(rows, (x) => x.p.sampleWeight);
  const buyers = sum(rows, (x) => x.p.sampleWeight * x.prob);
  const yearCost = brief.price_yen * brief.purchases_per_year;
  const intentDist = [1, 2, 3, 4, 5].map((i) => ({
    intent: i,
    share: people ? sum(rows.filter((x) => x.r.intent === i), (x) => x.p.sampleWeight) / people : 0,
  }));
  // 価格を変えたら買う人がどう変わるか(各人の「払ってもよい上限」から作る需要曲線)
  // 「払ってもよい上限」は実際より高く答えやすいので、割り引いてから使う
  const wtp = (x) => Math.round((x.r.max_price_yen * MARKET_ASSUMPTIONS.wtpDiscount.value) / 10) * 10;
  const interested = rows.filter((x) => x.r.max_price_yen > 0);
  const prices = [...new Set(interested.map(wtp))].sort((a, b) => a - b);
  const demandCurve = prices.map((price) => {
    const q = sum(interested.filter((x) => wtp(x) >= price), (x) => x.p.sampleWeight * Math.max(x.prob, 0.05));
    return { price, buyers: q, revenue: q * price * brief.purchases_per_year };
  });
  const best = demandCurve.reduce((a, b) => (b.revenue > (a?.revenue ?? -1) ? b : a), null);
  return {
    sampleSize: rows.length,
    targetPeople: people,
    buyers,
    buyerRate: people ? buyers / people : 0,
    revenue: buyers * yearCost,
    intentDist,
    demandCurve,
    bestPrice: best?.price ?? null,
    breakdown: breakdown(rows.map((x) => ({ ...x.p, weight: x.p.sampleWeight, _prob: x.prob })), (p) => p.weight * p._prob),
    // 層ごとの購入確率(普及シミュレーションに引き継ぐ)
    segmentProb: segmentProb(rows),
  };
}

function segmentProb(rows) {
  const acc = {};
  for (const x of rows) {
    const key = `${ageBandOf(x.p.age)}|${x.p.sex}`;
    acc[key] ??= { w: 0, v: 0 };
    acc[key].w += x.p.sampleWeight;
    acc[key].v += x.p.sampleWeight * x.prob;
  }
  return Object.fromEntries(Object.entries(acc).map(([k, a]) => [k, a.w ? a.v / a.w : 0]));
}

// 将来人口:年齢5歳階級×性別の人口比で、ペルソナ1人が代表する人数を付け替える
export function reweightForYear(personas, D, year) {
  const proj = D.projection?.years?.[year];
  if (!proj) return personas;
  const base = D.population.ageGroups;
  const find = (groups, age) => groups.find((g) => age >= g.min && age <= (g.max ?? 200)) ?? groups[groups.length - 1];
  // 将来推計の階級に合わせて、現在人口を同じ区切りで合計する
  const baseTotal = (g, sex) => sum(base.filter((b) => b.min >= g.min && (g.max == null || (b.max ?? 200) <= g.max)), (b) => b[sex]);
  return personas.map((p) => {
    const g = find(proj, p.age);
    const now = baseTotal(g, p.sex);
    return { ...p, weight: now > 0 ? p.weight * (g[p.sex] / now) : p.weight };
  });
}
