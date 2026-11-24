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
  // 買う人が少なすぎる商品だと、数人分の差しか出ず偶然に左右されるので、月980円の商品で確かめる
  const cheap = { ...product, price: 980 };
  const run = (net) => runMany(D, P, cheap, { ...DEFAULT_PLAN, ad: { tv: 0, net, store: 0 } }, { months: 24, runs: 5 }).series.at(-1).users.mid;
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

import { CATALOG, findScreens, scoreboard } from "../public/js/guide.js";
test("お題から探す:言葉から合う画面が見つかる", () => {
  const top = (q) => findScreens(q)[0]?.tab;
  assert.equal(top("優秀な人が辞めていく"), "org"); assert.equal(top("レジの待ち時間"), "queue");
  assert.equal(top("2050年の人手不足"), "future"); assert.equal(top("在庫の廃棄を減らしたい"), "stock");
  assert.equal(new Set(CATALOG.map((c) => c.tab)).size, CATALOG.length);
});
test("精度の成績表:理論・公式推計との照合は、ほぼすべて5%以内", () => {
  const rows = scoreboard(D, P, [{ basis: "理論", defs: [queue, spreadModel, newsvendor, laffer] }, { basis: "公式推計", defs: [future] }]);
  const strict = rows.filter((r) => r.basis === "理論" || r.basis === "公式推計"), bad = strict.filter((r) => !(Math.abs(r.diff) <= 0.05 || Math.abs(r.points ?? 9) <= 0.5));
  assert.ok(strict.length > 40 && bad.length <= 1, bad.map((r) => `${r.model} ${r.label} ${r.diff}`).join("; "));
});

import { labor } from "../public/js/labor.js";
import { decide } from "../public/js/visual.js";
test("人手不足:報酬と体力の引き算で、人が集まるかどうかが決まる", () => {
  const f = (k) => trial(labor, labor.presets[k].rules, 20, 1, 40).summary;
  const market = f("market"), fixed = f("fixed"), helper = f("helper"), auto = f("auto");
  assert.ok(market.shortage < 0.05 && Math.abs(market.productivity - 1.84) < 0.12, `自由競争 ${market.productivity}`);
  assert.ok(fixed.shortage > 0.95 && Math.abs(fixed.productivity - 0.215) < 0.04, `固定 ${fixed.productivity}`);
  assert.ok(helper.alive < 4 && helper.uturn > 100, `助っ人 残った工場 ${helper.alive}`);
  assert.ok(auto.shortage < 0.05 && auto.workers < market.workers / 3 && auto.productivity > market.productivity, `自動 ${auto.productivity}`);
});
test("3D:選択肢が1つなら買う/買わない、4つならどれか1つか、どれも買わない", () => {
  const sample = P.slice(0, 600), base = { category: "food", price: 3000, perYear: 12, target: {}, appeal: {}, baseInterest: 0.12 };
  const one = decide(sample, [base], 1);
  assert.ok(one.every((d) => d.choice === 0 || d.choice === 1) && one.filter((d) => d.bought).every((d) => d.choice === 0));
  const four = decide(sample, [3000, 2000, 1000, 500].map((price) => ({ ...base, price })), 1);
  assert.ok(four.every((d) => d.choice === "none" || (d.choice >= 0 && d.choice <= 3)));
  const n = (k) => four.filter((d) => d.choice === k).length;
  assert.ok(n(3) > n(0), "安い案を選ぶ人のほうが多い");
});

import { TEMPLATES, runCustom, trialCustom, sensitivity } from "../public/js/custom.js";
test("オリジナルの実験:条件を変えると結果が動き、割合の合計は100%になる", () => {
  const cfg = { ...TEMPLATES.fourday, n: 600 }, t = trialCustom(P, cfg, 4, 1);
  near(t.mean.reduce((a, b) => a + b, 0), 1, 1e-6, "割合の合計");
  assert.ok(t.mean[0] < 0.99 && t.mean[0] > 0.3, `今のままが${t.mean[0]}`);
  const richer = JSON.parse(JSON.stringify(cfg)); richer.options[1].money = 20000;
  assert.ok(trialCustom(P, richer, 4, 1).mean[1] > t.mean[1] + 0.05, "給与が増える案にすると、選ぶ人が増える");
  const young = t.byAge[0].shares[0], old = t.byAge[t.byAge.length - 1].shares[0];
  assert.ok(young < old, "若い人ほど、今のままから動く");
  assert.deepEqual(runCustom(P, cfg, 3).final, runCustom(P, cfg, 3).final); // 同じシードなら同じ結果
  assert.equal(runCustom(P, { ...cfg, target: { ageMin: 150, ageMax: 160, sex: "all" } }, 1), null);
  assert.ok(sensitivity(P, cfg, 1, 2, 1).rows.length >= 5);
});

import { regime } from "../public/js/regime.js";
import { elders } from "../public/js/elders.js";
import { maker } from "../public/js/maker.js";
import { persist } from "../public/js/persist.js";
import { customChecks, CUSTOM_ASSUMPTIONS } from "../public/js/custom.js";
test("国の仕組み:最初は社会主義が先行し、あとで民主主義が追い抜く", () => {
  const f = (k) => trial(regime, regime.presets[k].rules, 20, 1, 300).summary, base = f("base"), both = f("both");
  assert.ok(base.soc100 > base.dem100 && base.dem300 > base.soc300 && base.crossed > 0.7, `${base.dem100} ${base.soc100} ${base.dem300} ${base.soc300}`);
  assert.ok(f("noCoup").cross < base.cross - 50 && both.soc300 > both.dem300 && f("noError").soc300 < base.dem300);
});
test("長寿の村:飢饉を覚えている村は被害が小さい", () => {
  const f = (k) => trial(elders, elders.presets[k].rules, 20, 1, 200).summary, long = f("long"), uba = f("ubasute");
  assert.ok(long.avg > uba.avg + 10 && long.lost < uba.lost && f("hidden").lost < uba.lost, `${long.avg} ${uba.avg}`);
  near(f("calmLong").pop100 / f("calmUbasute").pop100, 1, 0.1, "飢饉がなければ互角");
});
test("工場と工房:品質をかけない工場は負け、ちょうどよくかけた工場は勝つ", () => {
  const f = (k) => trial(maker, maker.presets[k].rules, 15, 1, 60).summary, none = f("none"), good = f("good");
  assert.ok(none.factory < none.workshop && none.bustFactory > 9 && none.bustWorkshop < 1);
  assert.ok(good.factory > good.workshop && f("over").factory < good.factory && f("grow").factory > good.factory && f("shrink").factory < f("shrink").workshop);
});
test("続けるか見極めるか:理由なく動く人は実らず、向き不向きが小さいと愚直が勝つ", () => {
  const base = trial(persist, persist.presets.base.rules, 3, 1, 40).summary, flat = trial(persist, persist.presets.flat.rules, 3, 1, 40).summary;
  assert.ok(base.lost < base.stay && base.trend < base.stay && base.bestJudge > base.bestStay);
  assert.ok(flat.stay >= flat.judge - 0.5 && flat.stay > flat.three);
});
test("オリジナルの実験:損は得より重く、調査との照合が計算できる", () => {
  near(CUSTOM_ASSUMPTIONS.loss.value, 1.955, 1e-9, "損失回避");
  const rows = customChecks(P, 1);
  assert.ok(rows.length >= 5 && rows.every((r) => Number.isFinite(r.points)));
});

import { robustness } from "../public/js/custom.js";
test("オリジナルの実験:点数をゆらしたときの幅が出る", () => {
  const r = robustness(P, { ...TEMPLATES.benefit, n: 600 }, 6, 1);
  assert.ok(r.lo.every((v, k) => v <= r.hi[k]) && r.stable >= 0 && r.stable <= 1 && r.hi[r.top] > 0);
});

import { anchor } from "../public/js/custom.js";
test("オリジナルの実験:実際の割合に合わせると、その割合を再現する", () => {
  const cfg = { ...TEMPLATES.cashless, n: 800, months: 12, social: 0, inertia: 0, aware: 100, spread: 100 };
  cfg.options = cfg.options.map((o, k) => (k === 1 ? { ...o, known: 40 } : { ...o }));
  const a = anchor(P, cfg, 1);
  assert.ok(a.anchored && Math.abs(a.config.options[1].asc) > 0);
  near(trialCustom(P, a.config, 4, 1).mean[1], 0.40, 0.03, "合わせた割合");
  assert.equal(anchor(P, { ...TEMPLATES.cashless, n: 300 }, 1).anchored, false);
});

import { marketingChecks } from "../public/js/guide.js";
import { buyProbability as buyProb } from "../public/js/market.js";
test("マーケティングの文献値:値上げと広告への反応が、メタ分析の値に近い", () => {
  const rows = marketingChecks(D, P, 1);
  assert.ok(Math.abs(rows[0].diff) < 0.1 && Math.abs(rows[1].diff) < 0.1, `価格 ${rows[0].a} ${rows[1].a}`);
  assert.ok(Number(rows[2].a) > 0 && Number(rows[2].a) < 0.45, `広告 ${rows[2].a}`);
  const p0 = P.find((p) => p.age === 40), base = { category: "food", price: 3000, perYear: 12, target: {}, appeal: {}, baseInterest: 0.12 };
  assert.equal(buyProb(p0, base), buyProb(p0, { ...base, refPrice: 3000 })); // 相場と同じ価格なら、相場を入れても結果は変わらない
});

import { takeHome, burdenTable, consumptionTaxTable, voteTable } from "../public/js/politics.js";
import POLICY from "../public/js/policy-data.js";
test("政治と経済:手取り、消費税、投票の計算", () => {
  const t = takeHome({ income: 500, age: 40, status: "regular", marital: "未婚", working: true });
  near(t.net / t.income, 0.78, 0.02, "年収500万円の手取りの割合");
  near(t.social / t.income, 0.0915 + 0.0495 + 0.0081 + 0.00115 + 0.005, 1e-6, "社会保険料率(40〜64歳)");
  const rows = burdenTable(P); assert.ok(rows.every((r, i) => i === 0 || r.total >= rows[i - 1].total - 0.01), "年収が高いほど負担率が高い");
  const same = consumptionTaxTable(P, { standard: 0.1, reduced: 0.08 }), zero = consumptionTaxTable(P, { standard: 0.1, reduced: 0 });
  near(same.total1 / same.total0, 1, 1e-9, "いまの税率なら変化なし"); assert.ok(zero.total1 < zero.total0 && zero.real > 0);
  const e = POLICY.turnout["衆院選"].at(-1), v = voteTable(P, e.pct);
  near(v.turnout * 100, e.pct["全体"], 2, "全体の投票率"); assert.ok(v.old.votes > v.old.voters && v.young.votes < v.young.voters);
});

import { dhondt, prSeats, simulate, fitK, electionChecks } from "../public/js/elections.js";
import ELECTIONS from "../public/js/election-data.js";
test("得票と議席:ドント式と、過去の選挙の再現", () => {
  assert.deepEqual(dhondt([100, 80, 30, 20], 8), [4, 3, 1, 0]); // 100/1,80/1,100/2,80/2,100/3,30/1,80/3,100/4
  for (const e of ELECTIONS.elections) { assert.equal(Object.values(prSeats(e)).reduce((a, b) => a + b, 0), e.pr.seats); const r = simulate(e); assert.equal(r.rows.reduce((a, x) => a + x.total, 0), r.seats); }
  const e46 = ELECTIONS.elections.find((e) => e.name.includes("46")), pr = prSeats(e46);
  for (const [name, , seats] of e46.pr.parties) assert.equal(pr[name] ?? 0, seats, name); // 第46回は全ブロックで公式の配分と一致
  const rows = electionChecks(); assert.ok(rows[0].a.startsWith("76 / 88"));
  assert.ok(fitK(ELECTIONS.elections.at(-1)).k > 1);
});

import { discount, weightOf, psychologyChecks } from "../public/js/custom.js";
test("オリジナルの実験: あとのお金は小さく、まれな確率は大きく感じる", () => {
  assert.equal(discount(0), 1);
  assert.ok(Math.abs(discount(12) - 0.95 / 1.06) < 1e-9);
  assert.ok(discount(6) > discount(24));
  assert.equal(weightOf(1), 1);
  assert.equal(weightOf(0), 0);
  assert.ok(Math.abs(weightOf(0.01) - 0.055) < 0.002); // Tversky & Kahneman (1992) の値
  assert.ok(weightOf(0.9) < 0.9);
  assert.ok(psychologyChecks().every((r) => Math.abs(r.diff) * 100 <= r.tol));
  const t = trialCustom(P, { ...TEMPLATES.reward, n: 800 }, 3, 1);
  assert.ok(t.mean[3] > t.mean[1], "期待値が同じなら、まれに大きく当たる形のほうが選ばれる");
  const flat = trialCustom(P, { ...TEMPLATES.fourday, n: 800 }, 2, 1), same = trialCustom(P, { ...TEMPLATES.fourday, n: 800, options: TEMPLATES.fourday.options.map((o) => ({ ...o, delay: undefined, chance: undefined })) }, 2, 1);
  assert.deepEqual(flat.mean, same.mean); // 何も入れなければ、これまでと同じ結果
});

import { TRAIT_COEF } from "../public/js/personas.js";
test("価値観:若い人ほど価格を重視し、女性のほうが周りに合わせやすい(消費者意識基本調査の向き)", () => {
  const share = (f, k) => { const g = P.filter(f), w = g.reduce((a, p) => a + p.weight, 0); return g.reduce((a, p) => a + p.weight * p.traits[k], 0) / w; };
  assert.ok(share((p) => p.age >= 15 && p.age < 30, "price") > share((p) => p.age >= 70, "price"));
  assert.ok(share((p) => p.sex === "female" && p.age >= 15, "social") > share((p) => p.sex === "male" && p.age >= 15, "social"));
  assert.ok(TRAIT_COEF.price.age < 0);
});
