// 普及シミュレーション(月ごとに進むターン制)。
// 「広告で知る → 周りの利用者を見て買う → 口コミで広がる」という流れを、
// ペルソナ1人ずつの状態(知らない/知っている/利用中/やめた)で追いかける。
// 考え方の土台は Bass の普及モデルと、ロジャーズの採用者5区分。
import { makeRng, clamp } from "./rng.js";
import { ageBandOf } from "./constants.js";
import { buyProbability, inTarget } from "./market.js";

export const DIFFUSION_ASSUMPTIONS = {
  p: { value: 0.03, note: "広告などに反応して自分から買い始める強さ(Bassモデルの革新係数・年あたり)。213の適用例の平均(Sultan, Farley & Lehmann 1990)。典型的な範囲は0.01〜0.03" },
  q: { value: 0.38, note: "周りの利用者に影響されて買い始める強さ(Bassモデルの模倣係数・年あたり)。同じ研究の平均。典型的な範囲は0.3〜0.5" },
  adopterMult: {
    value: { innovator: 5, early_adopter: 2.5, early_majority: 1, late_majority: 0.4, laggard: 0.1 },
    note: "採用タイプごとの「自分から買い始める強さ」の倍率",
  },
  costPerReach: { value: { tv: 3, net: 2, store: 6 }, note: "広告を1人に1回届けるのにかかる費用(円)" },
  adExponent: { value: 0.24, note: "広告の効き方の逓減。広告で商品を知る人の割合は、広告量のこの乗数に比例する(広告を2倍にしても、知る人は約1.2倍)。広告弾力性のメタ分析の長期の平均0.24(Sethuraman, Tellis & Briesch 2011、402推定。短期の平均は0.12)" },
  adBase: { value: 0.02, note: "広告の効き方の基準点。1か月に対象者の2%に届く広告量のときは、「広告費 ÷ 1人に届ける費用」のとおりに知られていく。これより多いと、増やした割には伸びない。基準点の置き方は仮定" },
  churnShape: { value: [1.25, 0.82, 0.56], note: "解約率の、続けた期間による違い(1年目・2年目・3年目以降の倍率)。定額制サービスの実際の継続率(1年後63.1%、2年後46.8%、3年後38.2%。Fader & Hardie 2007 の例。表の抜粋で確認、確かさ:中)を、初期値の月3%のときに再現するよう決めた。合わない人から先にやめるので、残った人はやめにくい" },
  churnRef: { value: "月3%(初期値)", note: "解約率の参考:米国の有料動画配信は2025年に月4.6%(Antenna調べ)。日本の業界別の値は確認できていない" },
  adRef: { value: "短期0.12・長期0.24", note: "広告の効き方の参考:広告費を1%増やしたときの売上の伸び(Sethuraman, Tellis & Briesch 2011)。消費財のテレビ広告では0.01〜0.02台という報告もある(Shapiro, Hitsch & Tuchman 2021)。このモデルでは、長期の平均0.24を「広告の効き方の逓減」として使っている" },
  wom: { value: 0.6, note: "口コミで商品を知る強さ(身近な層の利用率に比例)" },
  groupBlend: { value: 0.6, note: "周りの影響のうち、同じ地域・年代から受ける割合(残りは全国平均)" },
  events: {
    value: {
      buzz: { prob: 0.03, label: "SNSで話題に", note: "SNS利用者の認知が一気に広がる" },
      rival: { prob: 0.025, label: "競合が参入", note: "まだ買っていない見込み客の25%を失い、解約が増える" },
      slump: { prob: 0.015, label: "景気の冷え込み", note: "6か月間、買い始める人が30%減る" },
      trouble: { prob: 0.015, label: "品質トラブル", note: "利用者の8%が離れ、3か月間口コミが止まる" },
    },
    note: "ゲームモードで毎月起こりうる出来事と発生確率",
  },
};

export const DEFAULT_PLAN = {
  price: null, // null なら商品設定の価格
  ad: { tv: 0, net: 3_000_000, store: 0 }, // 月あたりの広告費(円)
  churn: 0.03, // 月あたりの解約率
  costRate: 0.4, // 原価率
  fixedCost: 2_000_000, // 月あたりの固定費(円)
};

// メディアの年代別の届きやすさ(全体平均=1)。データが無ければ1
function mediaAffinity(D, p) {
  const m = D.media?.bands;
  if (!m) return { tv: 1, net: p.internet ? 1 : 0 };
  const b = m.find((x) => p.age >= x.min && p.age <= (x.max ?? 200)) ?? (p.age < m[0].min ? m[0] : m[m.length - 1]);
  return { tv: b.tv / D.media.mean.tv, net: p.internet ? b.net / D.media.mean.net : 0 };
}

export function createSim(D, personas, product, opts = {}) {
  const A = DIFFUSION_ASSUMPTIONS;
  const rng = makeRng(opts.seed ?? 1);
  const calib = opts.segmentProb ?? null; // AIインタビューで得た層別の購入確率
  const basePrice = product.price;

  const probAt = (p, price) => {
    const now = buyProbability(p, { ...product, price, refPrice: product.refPrice ?? basePrice }); // 発売後の値上げ・値下げは、最初の価格を相場として反応させる
    if (!calib) return now;
    const ref = buyProbability(p, product);
    const seg = calib[`${ageBandOf(p.age)}|${p.sex}`] ?? 0;
    return clamp(ref > 0 ? seg * (now / ref) : seg, 0, 0.95);
  };

  const agents = personas
    .filter((p) => inTarget(p, product.target))
    .map((p) => ({
      p,
      w: p.weight,
      u: rng.next(), // この人の「買う気になりやすさ」(小さいほど買いやすい)
      group: `${p.region}|${ageBandOf(p.age)}`,
      aff: mediaAffinity(D, p),
      aware: false,
      active: false,
      since: 0, // 利用を始めた月
      everBought: false,
      lost: false, // 競合に流れた
    }));
  const targetPeople = agents.reduce((a, x) => a + x.w, 0);

  const sim = {
    month: 0,
    price: basePrice,
    history: [],
    cumProfit: 0,
    targetPeople,
    flags: { slumpUntil: 0, womStopUntil: 0, rival: false, extraChurn: 0 },
  };

  sim.step = (plan = DEFAULT_PLAN, { randomEvents = false, forceEvent = null } = {}) => {
    sim.month++;
    const price = plan.price ?? basePrice;
    sim.price = price;
    const F = sim.flags;
    let event = null;

    // --- 出来事(ゲームモード) ---
    const fire = (key) => {
      event = key;
      if (key === "buzz") for (const a of agents) if (a.p.sns && rng.next() < 0.35) a.aware = true;
      if (key === "rival") {
        F.rival = true;
        F.extraChurn = 0.015;
        for (const a of agents) if (!a.everBought && rng.next() < 0.25) a.lost = true;
      }
      if (key === "slump") F.slumpUntil = sim.month + 6;
      if (key === "trouble") {
        F.womStopUntil = sim.month + 3;
        for (const a of agents) if (a.active && rng.next() < 0.08) a.active = false;
      }
    };
    if (forceEvent) fire(forceEvent);
    else if (randomEvents && sim.month > 2) {
      for (const [key, e] of Object.entries(A.events.value)) {
        if (key === "rival" && F.rival) continue;
        if (rng.next() < e.prob) { fire(key); break; }
      }
    }

    // --- 周りの利用率(地域×年代ごと、全国) ---
    const g = new Map();
    let allW = 0, allActive = 0;
    for (const a of agents) {
      let s = g.get(a.group);
      if (!s) g.set(a.group, (s = { w: 0, active: 0 }));
      s.w += a.w;
      allW += a.w;
      if (a.active) { s.active += a.w; allActive += a.w; }
    }
    const globalF = allW ? allActive / allW : 0;
    const blend = A.groupBlend.value;

    // --- 広告の届く割合 ---
    const reach = {};
    for (const ch of ["tv", "net", "store"]) {
      const persons = (plan.ad?.[ch] ?? 0) / A.costPerReach.value[ch];
      // 広告は、増やすほど効きにくくなる。届く割合 ∝ 広告量の β 乗(β は広告弾力性の文献値)。基準の広告量では、単純に「広告費 ÷ 1人あたりの費用」と同じになるようにそろえる
      const E = targetPeople > 0 ? persons / targetPeople : 0, E0 = A.adBase.value;
      reach[ch] = E > 0 ? 1 - Math.exp(-(E0 ** (1 - A.adExponent.value)) * E ** A.adExponent.value) : 0;
    }
    const slump = sim.month <= F.slumpUntil ? 0.7 : 1;
    const womOn = sim.month > F.womStopUntil;
    const churn = clamp((plan.churn ?? 0) + F.extraChurn, 0, 1);
    // 続けている期間が長い人ほど、やめにくい(合わない人から先にやめていくため)
    const T = A.churnShape.value, tenure = (months) => (months <= 12 ? T[0] : months <= 24 ? T[1] : T[2]);

    let newBuyers = 0;
    for (const a of agents) {
      const s = g.get(a.group);
      const localF = blend * (s.w ? s.active / s.w : 0) + (1 - blend) * globalF;
      // 1) 知る(広告・口コミ)
      if (!a.aware) {
        const miss =
          (1 - clamp(reach.tv * a.aff.tv, 0, 1)) *
          (1 - clamp(reach.net * a.aff.net, 0, 1)) *
          (1 - reach.store) *
          (womOn ? Math.exp(-A.wom.value * localF * (0.5 + a.p.traits.social)) : 1);
        if (rng.next() < 1 - miss) a.aware = true;
      }
      // 2) やめる
      if (a.active && rng.next() < clamp(churn * tenure(sim.month - a.since), 0, 1)) a.active = false;
      // 3) 買い始める(知っていて、価格に納得でき、まだ利用していない人)
      else if (a.aware && !a.active && !a.lost && a.u < probAt(a.p, price)) {
        const again = a.everBought ? 0.3 : 1; // 一度やめた人は戻りにくい
        const hazard =
          ((A.p.value * A.adopterMult.value[a.p.adopter] + (womOn ? A.q.value * localF * 4 : 0)) / 12) * slump * again * 4;
        if (rng.next() < clamp(hazard, 0, 1)) {
          a.active = true;
          a.since = sim.month;
          a.everBought = true;
          newBuyers += a.w;
        }
      }
    }

    // --- 集計と損益 ---
    let aware = 0, active = 0, ever = 0;
    for (const a of agents) {
      if (a.aware) aware += a.w;
      if (a.active) active += a.w;
      if (a.everBought) ever += a.w;
    }
    const revenue = (active * price * product.perYear) / 12;
    const adCost = (plan.ad?.tv ?? 0) + (plan.ad?.net ?? 0) + (plan.ad?.store ?? 0);
    const profit = revenue * (1 - (plan.costRate ?? 0)) - adCost - (plan.fixedCost ?? 0);
    sim.cumProfit += profit;
    const rec = {
      month: sim.month, price, event,
      awareRate: targetPeople ? aware / targetPeople : 0,
      users: active, everBought: ever, newBuyers,
      revenue, adCost, profit, cumProfit: sim.cumProfit,
    };
    sim.history.push(rec);
    return rec;
  };

  // 利用者の内訳(年代別)
  sim.usersByBand = () => {
    const out = {};
    for (const a of agents) if (a.active) out[ageBandOf(a.p.age)] = (out[ageBandOf(a.p.age)] || 0) + a.w;
    return out;
  };
  return sim;
}

// 同じ計画で、乱数を変えて何回も試す(結果の幅を見る)
// plans: 月ごとの計画の配列、または全期間共通の計画1つ
export function runMany(D, personas, product, plans, { months = 36, runs = 20, seed = 1, randomEvents = false, segmentProb = null } = {}) {
  const all = [];
  for (let r = 0; r < runs; r++) {
    const sim = createSim(D, personas, product, { seed: seed * 1000 + r, segmentProb });
    for (let m = 0; m < months; m++) sim.step(Array.isArray(plans) ? plans[Math.min(m, plans.length - 1)] : plans, { randomEvents });
    all.push(sim.history);
  }
  const pct = (values, q) => {
    const s = [...values].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
  };
  const fields = ["users", "revenue", "profit", "cumProfit", "awareRate", "everBought"];
  const series = [];
  for (let m = 0; m < months; m++) {
    const row = { month: m + 1 };
    for (const f of fields) {
      const v = all.map((h) => h[m][f]);
      row[f] = { low: pct(v, 0.1), mid: pct(v, 0.5), high: pct(v, 0.9) };
    }
    series.push(row);
  }
  return { series, runs };
}
