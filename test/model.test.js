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
  const workers = sum(P.filter((p) => p.work.includes("雇用")), (p) => p.weight);
  assert.ok(Math.abs(workers - 68.28e6) / 68.28e6 < 0.1, `就業者 ${workers}`);
});

test("単身者数が国勢調査の単独世帯数(約2,115万)と2割以内で合う", () => {
  const singles = sum(P.filter((p) => p.single), (p) => p.weight);
  assert.ok(Math.abs(singles - 21.15e6) / 21.15e6 < 0.2, `単身 ${singles}`);
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
