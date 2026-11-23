// モデルの検算テスト:生成したペルソナが元の統計と大きくずれていないかを確かめる
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { generatePersonas, assignAdopterTypes } from "../public/js/personas.js";
import { marketSize, totalSpendingCheck, stratifiedSample, aggregateReactions, reweightForYear } from "../public/js/market.js";
import { createSim, runMany, DEFAULT_PLAN } from "../public/js/diffusion.js";

const D = JSON.parse(fs.readFileSync(new URL("../data/japan.json", import.meta.url), "utf8"));
const P = assignAdopterTypes(generatePersonas(D, { n: 10000, seed: 1 }));
const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
const product = { category: "food", price: 9800, perYear: 12, target: { ageMin: 25, ageMax: 59, sex: "all" }, appeal: { health: 0.5 } };

test("総人口と男女比が統計と合う", () => {
  const total = sum(P, (p) => p.weight);
  assert.ok(Math.abs(total / 1000 - D.population.total) / D.population.total < 0.001);
  const male = sum(D.population.ageGroups, (g) => g.male) * 1000;
  assert.ok(Math.abs(sum(P.filter((p) => p.sex === "male"), (p) => p.weight) - male) / male < 0.01);
});

test("同じシード値なら同じ結果になる", () => {
  const again = generatePersonas(D, { n: 500, seed: 3 });
  assert.deepEqual(again, generatePersonas(D, { n: 500, seed: 3 }));
});

test("就業者数が労働力調査(約6,828万人)と1割以内で合う", () => {
  const workers = sum(P.filter((p) => p.working), (p) => p.weight);
  assert.ok(Math.abs(workers - 68.28e6) / 68.28e6 < 0.1, `就業者 ${workers}`);
});

test("家計支出の合計が現実的な範囲(150〜350兆円)に収まる", () => {
  const { total } = totalSpendingCheck(P);
  assert.ok(total > 150e12 && total < 350e12, `合計 ${total}`);
});

test("値上げすると購入見込みが減る", () => {
  const a = marketSize(P, product).potentialBuyers;
  const b = marketSize(P, { ...product, price: 30000 }).potentialBuyers;
  assert.ok(a > b && b >= 0);
});

test("層別抽出の重みの合計が対象人口と一致する", () => {
  const s = stratifiedSample(P, product.target, 40, 1);
  assert.equal(s.length, 40);
  const target = marketSize(P, product).targetPeople;
  assert.ok(Math.abs(sum(s, (p) => p.sampleWeight) - target) / target < 1e-9);
  const agg = aggregateReactions(s, s.map((p, i) => ({ id: p.id, intent: (i % 5) + 1, max_price_yen: 5000 + i * 100, reason: "", concern: "", voice: "" })),
    { price_yen: 9800, purchases_per_year: 12 });
  assert.ok(agg.buyers > 0 && agg.buyers < target);
});

test("普及シミュレーション:広告を増やすと利用者が増える", () => {
  const run = (net) => runMany(D, P, product, { ...DEFAULT_PLAN, ad: { tv: 0, net, store: 0 } }, { months: 24, runs: 5 }).series.at(-1).users.mid;
  const low = run(1_000_000), high = run(30_000_000);
  assert.ok(high > low, `${low} → ${high}`);
});

test("普及シミュレーション:利用者は対象人口を超えない", () => {
  const sim = createSim(D, P, product, { seed: 2 });
  for (let m = 0; m < 36; m++) sim.step({ ...DEFAULT_PLAN, ad: { tv: 5e8, net: 5e8, store: 0 } }, { randomEvents: true });
  assert.ok(sim.history.every((r) => r.users <= sim.targetPeople && r.awareRate <= 1));
});

test("将来人口:2050年は総人口が減り、推計値と合う", () => {
  const F = reweightForYear(P, D, "2050");
  const total = sum(F, (p) => p.weight) / 1000;
  const expect = sum(D.projection.years["2050"], (g) => g.male + g.female);
  assert.ok(Math.abs(total - expect) / expect < 0.01, `${total} vs ${expect}`);
});

// ---- 組織シミュレーター ----
import { PRESETS, trialOrg } from "../public/js/org.js";
const ORG = { n: 300, ages: [{ min: 22, max: 34, share: 35 }, { min: 35, max: 49, share: 40 }, { min: 50, max: 64, share: 25 }], mix: { ace: 0.2, std: 0.5, low: 0.3 }, seed: 1 };

test("組織:定額給で仕事を回しすぎるとエースがいなくなり、回さなければ残る", () => {
  const heavy = trialOrg(ORG, { ...PRESETS.fixedPush.rules, push: 0.8 }, 30, 10);
  const none = trialOrg(ORG, { ...PRESETS.fixedPush.rules, push: 0 }, 30, 10);
  assert.equal(heavy.wiped, 10);
  assert.equal(none.wiped, 0);
  assert.ok(none.productivity > heavy.productivity);
});

test("組織:歩合制ではエースが減らず、生産力が100%を下回らない", () => {
  const t = trialOrg(ORG, PRESETS.piece.rules, 30, 10);
  assert.ok(t.ace >= 0.19 && t.productivity >= 1);
});

// ---- 税率と助け合い ----
import { trialSociety } from "../public/js/society.js";
test("社会:助け合いのある税率20%は、税率0%より生産力が高く、税率80%では崩れる", () => {
  const cfg = { n: 300, ages: ORG.ages, seed: 1 };
  const p = (tax) => trialSociety(cfg, { tax }, 30, 10).last;
  assert.ok(p(0.2).productivity > p(0).productivity * 1.5);
  assert.ok(p(0.8).productivity < p(0).productivity);
  assert.ok(p(0.8).revenue < p(0.4).revenue); // 税率を上げすぎると税収が減る
});

// ---- 検算(公表値とのずれ) ----
import { validate } from "../public/js/personas.js";
test("検算:主な合計値が公表値の15%以内に収まる", () => {
  for (const t of validate(D, P)) assert.ok(Math.abs(t.error) < 0.15, `${t.label}: モデル ${t.model} / 公表 ${t.value}`);
});

// ---- 多重下請け ----
import { trialChain, relay } from "../public/js/chain.js";
import { sweepLayers, CHAIN_REFERENCE } from "../public/js/chain.js";
test("下請け:3段階で30%ずつ抜くと現場に届くのは34%で、働ける人もその水準まで減る", () => {
  const cfg = { n: 100, ages: ORG.ages, seed: 1 };
  assert.ok(Math.abs(relay(100, { layers: 3, rate: 0.3 }).delivered - 34.3) < 0.01);
  const direct = trialChain(cfg, { layers: 0, rate: 0.3 }, 30, 20), layered = trialChain(cfg, { layers: 3, rate: 0.3 }, 30, 20);
  assert.ok(direct.survivors > 0.999 && direct.collapsed === 0);
  assert.ok(Math.abs(layered.survivors - 0.34) < 0.05, `生存 ${layered.survivors}`);
  assert.ok(layered.strength < 0.6);
});

test("下請け:段数別の結果が、参考にした実験の値から大きく外れない", () => {
  const sw = sweepLayers({ n: 100, ages: ORG.ages, seed: 1 }, { rate: 0.3, shortcut: true }, CHAIN_REFERENCE.layers, 30, 100);
  sw.forEach((s, i) => {
    assert.ok(Math.abs(s.survivors * 100 - CHAIN_REFERENCE.survivors[i]) <= 6, `生存 ${i}段: ${s.survivors}`);
    assert.ok(Math.abs(s.strength * 100 - CHAIN_REFERENCE.strength[i]) <= 6, `強度 ${i}段: ${s.strength}`);
    assert.ok(Math.abs(s.collapsed - CHAIN_REFERENCE.collapsed[i]) <= 15, `崩落 ${i}段: ${s.collapsed}`);
  });
});

// ---- 経済と行動(共通の実験室) ----
import { trial } from "../public/js/lab.js";
import { economy } from "../public/js/economy.js";
import { town } from "../public/js/town.js";
import { island } from "../public/js/island.js";
import { council } from "../public/js/council.js";
import { climb } from "../public/js/climb.js";
const lab = (def, key, runs = 20) => trial(def, def.presets[key].rules, runs, 1, def.presets[key].years ?? def.years).summary;

test("物価と賃金:給料が据え置きだと縮み、物価と一緒に上がれば伸びる", () => {
  const frozen = lab(economy, "frozen", 3), both = lab(economy, "both", 3);
  assert.ok(Math.abs(frozen.unemployment - 0.621) < 0.03 && Math.abs(frozen.productivity - 0.379) < 0.03);
  assert.ok(both.unemployment < 0.01 && both.productivity > 1.15);
  assert.ok(lab(economy, "handout", 3).productivity < 0.42 && lab(economy, "reform", 3).productivity > 2);
});

test("貯金と町:一斉に貯めると一度縮み、銀行に回る町が最も大きい", () => {
  const ant = lab(town, "ant"), grass = lab(town, "grass"), bank = lab(town, "bank"), half = lab(town, "half");
  assert.ok(ant.low < 140 && ant.houses > ant.low + 30);
  assert.ok(bank.houses > grass.houses && grass.houses > ant.houses);
  assert.ok(half.ants > half.grass);
});

test("交換と略奪:交換は自給自足の倍、略奪が広がると激減、仕返しがあると持ち直す", () => {
  const self = lab(island, "self"), trade = lab(island, "trade"), spread = lab(island, "spread"), tft = lab(island, "tft");
  assert.ok(trade.pop > self.pop * 1.9);
  assert.ok(spread.pop < self.pop * 0.5);
  assert.ok(tft.tft > 7 && tft.pop > spread.pop * 3);
});

test("村の決め方:平和なら寄り合いが豊か、戦いがあると王の村が増える", () => {
  const peace = lab(council, "peace"), war = lab(council, "war"), ally = lab(council, "ally");
  assert.ok(peace.hitCouncil > peace.hitKing + 0.04 && peace.popCouncil > peace.popKing * 1.5);
  assert.ok(war.nKing > war.nCouncil && ally.nCouncil > war.nCouncil);
  assert.equal(lab(council, "hard").nKing, 0);
});

test("学び方:なだらかな山ではふり返る人、でこぼこの山では数をこなす人が上へ行く", () => {
  assert.ok(lab(climb, "smooth_reflect", 40).day90 < lab(climb, "smooth_volume", 40).day90);
  assert.ok(lab(climb, "rugged_volume", 40).score > lab(climb, "rugged_reflect", 40).score * 1.8);
});

// ---- 理論で確かめる:シミュレーションが、数式の理論値と合うこと ----
import { queue, spreadModel, schelling, newsvendor, erlangC, finalSize } from "../public/js/theory.js";
const near = (model, theory, tol, what) => assert.ok(Math.abs(model - theory) <= tol, `${what}: ${model} / 理論 ${theory}`);

test("理論:待ち行列がアーランC式と合う", () => {
  near(erlangC(1, 0.5), 0.5, 1e-9, "M/M/1 の待たされる確率 = 混み具合");
  for (const key of ["two", "three", "four"]) {
    const r = queue.presets[key].rules, m = trial(queue, r, 20, 1, 480).summary, rows = queue.verify(m, r);
    for (const row of rows) near(row.model, row.theory, Math.max(0.01, Math.abs(row.theory) * 0.06), `${key} ${row.label}`);
  }
});

test("理論:感染の最終規模が、最終規模方程式と合う", () => {
  near(finalSize(2), 0.7968, 1e-3, "R0=2 の最終規模");
  for (const key of ["r15", "r25", "r40", "cut"]) {
    const r = spreadModel.presets[key].rules, m = trial(spreadModel, r, 60, 1, 120).summary, row = spreadModel.verify(m, r)[0];
    near(row.model, row.theory, 0.03, key);
  }
  assert.ok(trial(spreadModel, spreadModel.presets.r08.rules, 60, 1, 120).summary.took < 0.05);
});

test("理論:仕入れ量の利益が理論式と合い、臨界比の量で最大になる", () => {
  const p = (key) => { const r = newsvendor.presets[key].rules, m = trial(newsvendor, r, 30, 1, 60).summary; return { m, rows: newsvendor.verify(m, r) }; };
  for (const key of ["mean", "best", "more", "less"]) { const { rows } = p(key); near(rows[0].model, rows[0].theory, rows[0].theory * 0.005, `${key} 利益`); }
  assert.ok(p("best").m.profit > p("mean").m.profit && p("best").m.profit > p("more").m.profit);
});

test("理論:住み分けは、弱い好みでも希望を大きく超えて分かれる", () => {
  const m = trial(schelling, schelling.presets.t30.rules, 10, 1, 40).summary;
  assert.ok(m.similar > 0.65 && m.unhappy < 0.02, `仲間の割合 ${m.similar}`);
});

test("理論:寄り合いの的中率が、多数決の理論値と合う", () => {
  const m = trial(council, council.presets.peace.rules, 30, 1, 300).summary;
  near(m.hitCouncil, m.theoryCouncil, 0.01, "寄り合い");
  near(m.hitKing, 0.9, 0.02, "王");
});

// ---- 実験と比べる・将来人口 ----
import { threshold, tournament, commons, split } from "../public/js/experiments.js";
import { future } from "../public/js/future.js";

test("実験:閾値モデルが原論文の結果を再現する", () => {
  const f = (k) => trial(threshold, threshold.presets[k].rules, 5, 1, 100).summary;
  assert.equal(f("uniform").final, 100); assert.equal(f("shifted").final, 1);
  assert.ok(f("narrow").expected < 7 && f("wide").expected > 99);
});

test("実験:総当たり戦の点数が、点数表からの手計算と合う", () => {
  const r = tournament.presets.standard.rules, m = trial(tournament, r, 5, 1, 200).summary;
  for (const row of tournament.verify(m, r)) assert.equal(row.model, row.theory, row.label);
  assert.ok(m.tft > m.alld, "しっぺ返しは、いつも裏切りより得点が高い");
});

test("実験:公共財ゲームが、罰なしで崩れ、罰ありで保たれる(文献値の範囲)", () => {
  const none = trial(commons, commons.presets.none.rules, 20, 1, 10).summary, pun = trial(commons, commons.presets.punish.rules, 20, 1, 10).summary;
  assert.ok(none.last < 4 && none.zero > 0.53 && none.zero < 0.75, `罰なし ${none.last} ${none.zero}`);
  assert.ok(pun.last >= 17.5 && pun.rate > 0.5 && pun.rate < 0.95, `罰あり ${pun.last} ${pun.rate}`);
});

test("実験:最後通牒ゲームが、実験の平均(提案40%・拒否16%)に近い", () => {
  const m = trial(split, split.presets.standard.rules, 10, 1, 1).summary;
  near(m.offer, 0.40, 0.02, "提案"); near(m.reject, 0.16, 0.02, "拒否");
});

test("将来人口:自前の推計が、公式推計と総人口で1%以内に合う", () => {
  const r = future.presets.medium.rules, m = future.run(r).summary;
  for (const row of future.verify(m, r).filter((x) => x.label.endsWith("総人口"))) near(row.model / row.theory, 1, 0.01, row.label);
  assert.ok(future.run(future.presets.high.rules).summary.p2070 > m.p2070 && future.run(future.presets.closed.rules).summary.p2070 < m.p2070);
});

import { laffer } from "../public/js/theory.js";
import { nationalSeparation } from "../public/js/org.js";
test("理論:税収が最大になる税率が 1÷(1+弾力性) と合う", () => {
  for (const key of ["t30", "t80", "react", "high"]) {
    const r = laffer.presets[key].rules, m = trial(laffer, r, 3, 1, 100).summary;
    for (const row of laffer.verify(m, r)) near(row.model, row.theory, 0.015, `${key} ${row.label}`);
  }
});
test("実データ:給付金の消費割合と離職率", () => {
  const p = (k) => trial(economy, economy.presets[k].rules, 10, 1, 30).summary.topProductivity;
  assert.ok(p("handout09") > p("handout20"), "消費に回る割合が高いほど、生産力が戻る");
  near(nationalSeparation([{ min: 22, max: 64, share: 1 }]), 0.12, 0.03, "22〜64歳の離職率");
  assert.ok(nationalSeparation([{ min: 22, max: 29, share: 1 }]) > nationalSeparation([{ min: 40, max: 49, share: 1 }]));
});
