// 画面の制御
import { CATEGORIES, CATEGORY_LABEL, AGE_BANDS, ageBandOf } from "./constants.js";
import { generatePersonas, assignAdopterTypes, describePersona, ADOPTER_TYPES, ASSUMPTIONS } from "./personas.js";
import {
  marketSize, totalSpendingCheck, stratifiedSample, personaForLLM, aggregateReactions,
  reweightForYear, inTarget, MARKET_ASSUMPTIONS,
} from "./market.js";
import { createSim, runMany, DIFFUSION_ASSUMPTIONS } from "./diffusion.js";
import { hbar, pyramid, line, esc } from "./charts.js";
import { makeRng } from "./rng.js";
import { PURPOSES, buildReport } from "./report.js";
import JAPAN from "./japan-data.js";
import { createVisual, prepareCrowd } from "./visual.js";

const $ = (id) => document.getElementById(id);
const state = { D: null, base: [], personas: [], llm: false, materials: [], brief: null, ai: null, game: null };

// ---------- 数字の表示 ----------
const num = (v, d = 0) => v.toLocaleString("ja-JP", { maximumFractionDigits: d, minimumFractionDigits: d });
export function fmtPeople(v) {
  if (v >= 1e8) return `${num(v / 1e8, 2)}億人`;
  if (v >= 1e4) return `${num(v / 1e4, v >= 1e6 ? 0 : 1)}万人`;
  return `${num(v)}人`;
}
export function fmtYen(v) {
  const a = Math.abs(v);
  if (a >= 1e12) return `${num(v / 1e12, 2)}兆円`;
  if (a >= 1e8) return `${num(v / 1e8, a >= 1e10 ? 0 : 1)}億円`;
  if (a >= 1e4) return `${num(v / 1e4)}万円`;
  return `${num(v)}円`;
}
const pct = (v, d = 1) => `${num(v * 100, d)}%`;
const kpi = (label, value, sub = "") => `<div class="kpi"><small>${label}</small><b>${value}</b><span>${sub}</span></div>`;
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

// ---------- 起動 ----------
async function init() {
  state.D = JAPAN;
  try {
    const res = await fetch("api/status");
    if (!res.ok) throw new Error("no server");
    const s = await res.json();
    state.llm = s.llm;
    $("status").innerHTML = s.llm
      ? `AIモード:<b class="ok">使えます</b>(${esc(s.model)})`
      : `AIモード:<b class="ng">未設定</b>(APIキーを設定すると、お題の読み取りとAIインタビューが使えます。統計モードはこのまま使えます)`;
  } catch {
    $("status").innerHTML = `AIモード:<b class="ng">この公開版では使えません</b>(統計モードはすべて使えます。AIモードは、APIキーを設定したサーバーで動かすと使えます)`;
  }
  $("read-brief").disabled = $("run-ai").disabled = !state.llm;

  const years = [state.D.population.year, ...Object.keys(state.D.projection?.years ?? {})];
  $("year").innerHTML = years.map((y, i) => `<option value="${y}">${y}年${i ? "(将来推計)" : "(現在)"}</option>`).join("");
  $("p-category").innerHTML = CATEGORIES.map((c) => `<option value="${c.key}">${c.label}</option>`).join("");
  $("p-category").value = "food";

  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.id === `tab-${b.dataset.tab}`));
    if (b.dataset.tab === "visual") openVisual();
    else state.visual?.run(false);
  }));
  $("v-set").onclick = () => gatherCrowd();
  $("v-start").onclick = () => { if (state.visual?.phase !== "wander") gatherCrowd(); state.visual?.start(); };
  $("v-speed").onchange = () => state.visual?.setSpeed(Number($("v-speed").value));
  $("v-ab").onchange = () => {
    $("v-price-b").disabled = $("v-per-b").disabled = !$("v-ab").checked;
    if ($("v-ab").checked && !$("v-price-b").value) { $("v-price-b").value = Math.round(currentProduct().price * 0.7); $("v-per-b").value = currentProduct().perYear; }
    gatherCrowd();
  };
  $("regen").onclick = regenerate;
  $("year").onchange = applyYear;
  $("shuffle").onclick = () => renderPersonaList(Math.floor(Math.random() * 1e9));
  ["f-age-min", "f-age-max", "f-sex"].forEach((id) => ($(id).onchange = () => renderPersonaList(1)));
  $("files").onchange = onFiles;
  $("read-brief").onclick = readBrief;
  $("run-stat").onclick = runStat;
  $("run-ai").onclick = runAI;
  $("run-spread").onclick = runSpread;
  $("g-start").onclick = startGame;
  $("g-next").onclick = nextQuarter;

  const opts = Object.entries(PURPOSES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  $("purpose").innerHTML = $("purpose2").innerHTML = opts;
  $("purpose").onchange = () => setPurpose($("purpose").value);
  $("purpose2").onchange = () => setPurpose($("purpose2").value);
  $("run-report").onclick = runReport;
  $("print-report").onclick = () => window.print();
  setPurpose("planning");

  regenerate();
  renderMarket();
  renderSources();
}

function regenerate() {
  state.base = assignAdopterTypes(generatePersonas(state.D, { n: Number($("n").value), seed: Number($("seed").value) || 1 }));
  applyYear();
}
function applyYear() {
  const y = $("year").value;
  state.personas = String(y) === String(state.D.population.year) ? state.base : reweightForYear(state.base, state.D, y);
  renderPeople();
  renderSpending();
}

// ---------- ① 人口とペルソナ ----------
function renderPeople() {
  const P = state.personas;
  const total = sum(P, (p) => p.weight);
  const adults = P.filter((p) => p.age >= 15);
  const share = (list, f) => sum(list.filter(f), (p) => p.weight) / Math.max(sum(list, (p) => p.weight), 1);
  $("pop-kpi").innerHTML =
    kpi("再現した総人口", fmtPeople(total), `${$("year").value}年`) +
    kpi("ペルソナの人数", `${num(P.length)}人`, `1人が約${fmtPeople(total / P.length)}を代表`) +
    kpi("65歳以上の割合", pct(share(P, (p) => p.age >= 65))) +
    kpi("15〜64歳の割合", pct(share(P, (p) => p.age >= 15 && p.age < 65))) +
    kpi("就業している人", fmtPeople(sum(adults.filter((p) => p.work.includes("雇用")), (p) => p.weight)), "15歳以上");

  const groups = state.D.population.ageGroups.map((g) => ({
    label: g.max == null ? `${g.min}歳〜` : `${g.min}〜${g.max}`, min: g.min, max: g.max ?? 200, male: 0, female: 0,
  }));
  for (const p of P) groups.find((g) => p.age >= g.min && p.age <= g.max)[p.sex] += p.weight;
  $("pyramid").innerHTML = pyramid(groups, { fmt: (v) => `${num(v / 1e4)}万` });

  const count = (list, keyOf) => {
    const m = new Map();
    for (const p of list) m.set(keyOf(p), (m.get(keyOf(p)) || 0) + p.weight);
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  $("work-chart").innerHTML = hbar(count(adults, (p) => p.work), { fmt: fmtPeople });
  $("hh-chart").innerHTML = hbar(count(P, (p) => p.household), { fmt: fmtPeople, color: "var(--good)" });

  const bins = [[0, 100], [100, 200], [200, 300], [300, 400], [400, 500], [500, 700], [700, 1000], [1000, 1e9]];
  const grown = P.filter((p) => p.age >= 18);
  $("income-chart").innerHTML = hbar(bins.map(([lo, hi]) => ({
    label: hi > 1e8 ? `${lo}万円以上` : `${lo}〜${hi}万円`,
    value: sum(grown.filter((p) => p.income >= lo && p.income < hi), (p) => p.weight),
  })), { fmt: fmtPeople });
  $("adopter-chart").innerHTML = hbar(ADOPTER_TYPES.map((t) => ({
    label: t.label, value: sum(adults.filter((p) => p.adopter === t.key), (p) => p.weight),
  })), { fmt: fmtPeople, color: "var(--female)", labelWidth: 170 });
  renderPersonaList(1);
}

function personaCard(p, extra = "") {
  const t = p.traits;
  const top = Object.entries(p.spend).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${CATEGORY_LABEL[k]} ${num(v)}円`).join(" / ");
  return `<div class="persona"><b>${esc(describePersona(p))}</b><br>
    <span class="tag">年収 ${num(p.income)}万円</span><span class="tag">${p.marital}</span>
    <span class="tag">月の支出 ${num(p.spendTotal)}円</span><span class="tag">${p.internet ? (p.sns ? "ネット・SNS利用" : "ネット利用") : "ネット利用なし"}</span>
    <span class="tag">${ADOPTER_TYPES.find((a) => a.key === p.adopter)?.label ?? ""}</span><br>
    <span class="note">支出の上位:${top}<br>価格に敏感 ${t.price}/新しもの好き ${t.novelty}/健康志向 ${t.health}/品質重視 ${t.quality}</span>${extra}</div>`;
}
function renderPersonaList(seed) {
  const rng = makeRng(seed);
  const pool = state.personas.filter((p) => inTarget(p, { ageMin: Number($("f-age-min").value), ageMax: Number($("f-age-max").value), sex: $("f-sex").value }));
  const pick = [];
  const copy = [...pool];
  while (pick.length < 9 && copy.length) pick.push(copy.splice(Math.floor(rng.next() * copy.length), 1)[0]);
  $("persona-list").innerHTML = pick.map((p) => personaCard(p)).join("") || `<p class="note">条件に合う人がいません。</p>`;
}

// ---------- ② 市場 ----------
function renderMarket() {
  const I = state.D.industry;
  const okuyen = (v) => fmtYen(v * 1e8);
  $("industry-chart").innerHTML = hbar(I.census.rows.map((r) => ({ label: r.label, value: r.sales })), { fmt: okuyen, labelWidth: 210 });
  $("industry-note").innerHTML = `全産業の売上:${okuyen(I.census.total)}(${esc(I.census.yearNote)})。${esc(I.census.note)}<br>参考:${esc(I.corporate.note)}`;
  $("retail-chart").innerHTML = hbar(I.retail.rows.map((r) => ({ label: r.label, value: r.value })), { fmt: okuyen, color: "var(--good)" });
  $("retail-ind-chart").innerHTML = hbar(I.retail.industryRows, { fmt: okuyen, color: "var(--good)", labelWidth: 210 });
  $("sna-chart").innerHTML = hbar(I.householdConsumption.rows, { fmt: okuyen, color: "var(--sub)", labelWidth: 210 });
  $("retail-note").textContent = `小売業全体:${okuyen(I.retail.total)}(${I.retail.yearNote})`;
  $("ec-chart").innerHTML = hbar(I.ec.rows.map((r) => ({ label: r.label, value: r.value })), { fmt: okuyen, color: "var(--female)", labelWidth: 210 });
  $("ec-note").textContent = `BtoC-EC全体:${okuyen(I.ec.total)}(${I.ec.yearNote})。${I.ec.note}`;
}
function renderSpending() {
  const P = state.personas;
  const c = totalSpendingCheck(P);
  $("spend-chart").innerHTML = hbar(CATEGORIES.map((k) => ({ label: k.label, value: c.byCategory[k.key] })), { fmt: fmtYen });
  const ref = state.D.industry.householdConsumption;
  $("spend-check").innerHTML = `ペルソナ全員の年間支出の合計:<b>${fmtYen(c.total)}</b><br>` +
    (ref ? `参考:${esc(ref.label)} ${fmtYen(ref.value * 1e8)}。${esc(ref.note)}` : "");
  const rows = AGE_BANDS.map((b) => {
    const g = P.filter((p) => ageBandOf(p.age) === b.label);
    const w = Math.max(sum(g, (p) => p.weight), 1);
    return `<tr><td>${b.label}</td>${CATEGORIES.map((k) => `<td class="num">${num(sum(g, (p) => p.weight * p.spend[k.key]) / w)}</td>`).join("")}</tr>`;
  }).join("");
  $("spend-age").innerHTML = `<table><tr><th>年代</th>${CATEGORIES.map((k) => `<th class="num">${k.label}</th>`).join("")}</tr>${rows}</table><p class="note">単位:円/月</p>`;
}

// ---------- ③ お題シミュレーション ----------
async function api(path, body) {
  const res = await fetch(path.replace(/^\//, ""), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "エラーが発生しました。");
  return json.result;
}
const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1]);
  r.onerror = reject;
  r.readAsDataURL(file);
});
async function onFiles(e) {
  for (const f of e.target.files) {
    if (f.size > 20 * 1024 * 1024) { alert(`${f.name} は20MBを超えているため追加できません。`); continue; }
    const isPdf = f.name.toLowerCase().endsWith(".pdf");
    state.materials.push({ name: f.name, kind: isPdf ? "pdf" : "text", data: isPdf ? await toBase64(f) : await f.text() });
  }
  e.target.value = "";
  $("file-list").innerHTML = state.materials.map((m, i) => `<li>${esc(m.name)} <a href="#" data-i="${i}">×</a></li>`).join("");
  $("file-list").querySelectorAll("a").forEach((a) => (a.onclick = (ev) => {
    ev.preventDefault();
    state.materials.splice(Number(a.dataset.i), 1);
    onFiles({ target: { files: [], value: "" } });
  }));
}

async function readBrief() {
  const topic = $("topic").value.trim();
  if (!topic && !state.materials.length) return setMsg("brief-msg", "お題か資料を入力してください。", true);
  setMsg("brief-msg", "読み取り中です…(30秒ほどかかります)");
  $("read-brief").disabled = true;
  try {
    const b = (state.brief = await api("/api/brief", { topic, materials: state.materials }));
    $("p-name").value = b.title;
    $("p-category").value = b.category;
    $("p-price").value = Math.round(b.price_yen);
    $("p-per-year").value = b.purchases_per_year;
    $("p-age-min").value = Math.max(0, Math.round(b.target_age_min));
    $("p-age-max").value = Math.min(110, Math.round(b.target_age_max));
    $("p-sex").value = b.target_sex;
    $("p-online").checked = b.online_only;
    setPurpose(b.suggested_purpose, "AIがお題から用途を推測しました。違う場合は選び直してください。");
    const list = (title, items) => (items?.length ? `<h4>${title}</h4><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
    $("brief-box").innerHTML = `<div class="report"><p class="headline">${esc(b.title)}</p><p>${esc(b.summary)}</p>
      ${list("訴求点", b.selling_points)}${list("AIが推測で補った項目", b.assumptions)}${list("確認したい情報", b.missing_info)}</div>`;
    setMsg("brief-msg", "読み取りました。STEP 2 の内容を確認してください。");
    runStat();
  } catch (err) {
    setMsg("brief-msg", err.message, true);
  } finally {
    $("read-brief").disabled = false;
  }
}
function setMsg(id, text, isErr = false) {
  $(id).textContent = text;
  $(id).classList.toggle("err", isErr);
}

function currentProduct() {
  return {
    name: $("p-name").value || "新しい商品",
    category: $("p-category").value,
    price: Math.max(0, Number($("p-price").value) || 0),
    perYear: Math.max(0.1, Number($("p-per-year").value) || 1),
    target: { ageMin: Number($("p-age-min").value) || 0, ageMax: Number($("p-age-max").value) || 200, sex: $("p-sex").value, onlineOnly: $("p-online").checked },
    appeal: { novelty: +$("a-novelty").value, health: +$("a-health").value, quality: +$("a-quality").value, cheap: +$("a-cheap").value },
    baseInterest: Math.min(95, Math.max(1, Number($("a-base").value) || 12)) / 100,
  };
}
// AIインタビューに渡す商品概要(AIの読み取り結果に、画面で直した値を上書き)
function currentBrief() {
  const p = currentProduct();
  return {
    ...(state.brief ?? { summary: $("topic").value.trim() || p.name, selling_points: [] }),
    title: p.name, category: p.category, price_yen: p.price, purchases_per_year: p.perYear,
    target_age_min: p.target.ageMin, target_age_max: p.target.ageMax, target_sex: p.target.sex, online_only: p.target.onlineOnly,
  };
}

function breakdownTable(rows, unit = "購入見込み") {
  return `<div class="table-scroll"><table><tr><th>年代</th><th class="num">対象人口</th><th class="num">${unit}(男性)</th><th class="num">${unit}(女性)</th><th class="num">購入率</th></tr>${
    rows.filter((r) => r.people > 0).map((r) => `<tr><td>${r.label}</td><td class="num">${fmtPeople(r.people)}</td><td class="num">${fmtPeople(r.male)}</td><td class="num">${fmtPeople(r.female)}</td><td class="num">${pct((r.male + r.female) / r.people)}</td></tr>`).join("")
  }</table></div>`;
}

function runStat() {
  const product = currentProduct();
  const m = marketSize(state.personas, product);
  $("stat-result").innerHTML = `
    <div class="kpis">
      ${kpi("対象人口", fmtPeople(m.targetPeople), `総人口の${pct(m.targetPeople / m.population)}`)}
      ${kpi(`対象者の「${CATEGORY_LABEL[product.category]}」年間支出`, fmtYen(m.categorySpend), "取り合うお財布の大きさ")}
      ${kpi("購入見込み(全員が知った場合)", fmtPeople(m.potentialBuyers), `対象の${pct(m.targetPeople ? m.potentialBuyers / m.targetPeople : 0)}`)}
      ${kpi("年間売上の上限の目安", fmtYen(m.potentialRevenue), `費目支出の${pct(m.walletShare)}`)}
    </div>
    <p class="note">統計モードの試算です。「価格と普段の支出のつり合い」と「価値観との相性」から計算しています。<br>実際の売上は、商品を知ってもらえる割合(認知)で大きく変わります。④の普及シミュレーションで確かめてください。</p>
    ${breakdownTable(m.breakdown)}`;
}

async function runAI() {
  const product = currentProduct();
  const brief = currentBrief();
  const k = Number($("k").value);
  const sample = stratifiedSample(state.personas, product.target, k, Number($("seed").value) || 1);
  if (!sample.length) return setMsg("ai-msg", "対象条件に合うペルソナがいません。", true);
  $("run-ai").disabled = true;
  $("ai-progress").hidden = false;
  const bar = $("ai-progress").firstElementChild;
  bar.style.width = "0";
  const reactions = [];
  const batches = [];
  for (let i = 0; i < sample.length; i += 10) batches.push(sample.slice(i, i + 10));
  let done = 0;
  try {
    // 3組ずつ並行して問い合わせる
    for (let i = 0; i < batches.length; i += 3) {
      setMsg("ai-msg", `インタビュー中… ${done}/${sample.length}人`);
      const results = await Promise.all(batches.slice(i, i + 3).map((b) =>
        api("/api/react", { brief, personas: b.map(personaForLLM), materials: state.materials })));
      for (const r of results) { reactions.push(...r); done += r.length; }
      bar.style.width = `${(done / sample.length) * 90}%`;
    }
    const agg = aggregateReactions(sample, reactions, brief);
    state.ai = { agg, sample, reactions, brief };
    renderAI();
    setMsg("ai-msg", "レポートを作成中…");
    const report = await api("/api/report", {
      brief,
      purpose: $("purpose").value,
      aggregate: { ...agg, demandCurve: agg.demandCurve.slice(0, 30), segmentProb: undefined },
      reactions: reactions.map((r) => ({ ...r, persona: describePersona(sample.find((p) => p.id === r.id) ?? {}) })),
    });
    state.ai.report = report;
    renderAI();
    bar.style.width = "100%";
    $("s-calib").checked = true;
    setMsg("ai-msg", "完了しました。④の普及シミュレーションに結果を引き継げます。");
  } catch (err) {
    setMsg("ai-msg", err.message, true);
  } finally {
    $("run-ai").disabled = false;
  }
}

function renderAI() {
  const { agg, sample, reactions, brief, report } = state.ai;
  const labels = { 1: "絶対に買わない", 2: "たぶん買わない", 3: "どちらとも言えない", 4: "たぶん買う", 5: "絶対に買う" };
  const colors = { 1: "var(--bad)", 2: "var(--bad)", 3: "var(--sub)", 4: "var(--good)", 5: "var(--good)" };
  const list = (title, items) => (items?.length ? `<h4>${title}</h4><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  const byId = new Map(reactions.map((r) => [r.id, r]));
  const cards = [...sample].sort((a, b) => (byId.get(b.id)?.intent ?? 0) - (byId.get(a.id)?.intent ?? 0)).map((p) => {
    const r = byId.get(p.id);
    if (!r) return "";
    const i = Math.min(5, Math.max(1, Math.round(r.intent)));
    return personaCard(p, `<div class="voice"><span class="intent i${i}">${labels[i]}</span>(上限 ${num(r.max_price_yen)}円)<br>
      「${esc(r.voice)}」<br><span class="note">理由:${esc(r.reason)}${r.concern ? `<br>不安:${esc(r.concern)}` : ""}</span></div>`);
  }).join("");
  $("ai-result").innerHTML = `
    <div class="kpis">
      ${kpi("インタビューした人数", `${agg.sampleSize}人`, `対象 ${fmtPeople(agg.targetPeople)} を代表`)}
      ${kpi("購入見込み(全員が知った場合)", fmtPeople(agg.buyers), `対象の${pct(agg.buyerRate)}`)}
      ${kpi("年間売上の上限の目安", fmtYen(agg.revenue))}
      ${kpi("売上が最大になる価格の目安", agg.bestPrice ? `${num(agg.bestPrice)}円` : "―", `現在 ${num(brief.price_yen)}円`)}
    </div>
    <p class="note">「買う」という回答は実際より多く出やすいため、割り引いて人数に直しています(割引率は「出典と仮定」を参照)。</p>
    ${report ? `<div class="report"><p class="headline">${esc(report.headline)}</p>${list("読み取れること", report.findings)}${list("反応が良かった層", report.promising_segments)}${list("ためらう理由", report.barriers)}${list("改善案", report.suggestions)}${list("この結果を疑うべき点", report.counterpoints)}</div>` : ""}
    <h3>購入意向の分布</h3>${hbar(agg.intentDist.map((d) => ({ label: labels[d.intent], value: d.share, color: colors[d.intent] })), { fmt: (v) => pct(v) })}
    ${agg.demandCurve.length > 1 ? `<h3>価格と売上の関係(払ってもよい上限額から作成)</h3>${line(agg.demandCurve.map((d) => ({ x: d.price, mid: d.revenue })), { fmt: fmtYen, xLabel: "価格(円)" })}` : ""}
    <h3>年代別の内訳</h3>${breakdownTable(agg.breakdown)}
    <h3>1人ずつの声</h3><div class="persona-list">${cards}</div>`;
}

// ---------- ④ 普及シミュレーション ----------
const man = (id) => (Number($(id).value) || 0) * 10000;
function currentPlan() {
  return {
    ad: { tv: man("s-tv"), net: man("s-net"), store: man("s-store") },
    churn: (Number($("s-churn").value) || 0) / 100,
    costRate: (Number($("s-cost").value) || 0) / 100,
    fixedCost: man("s-fixed"),
  };
}
function computeSpread(product, plan) {
  const months = Math.min(120, Math.max(6, Number($("s-months").value) || 36));
  const useCalib = Boolean($("s-calib").checked && state.ai);
  const out = runMany(state.D, state.personas, product, plan, {
    months, runs: Math.min(100, Math.max(1, Number($("s-runs").value) || 20)),
    seed: Number($("seed").value) || 1, randomEvents: $("s-events").checked,
    segmentProb: useCalib ? state.ai.agg.segmentProb : null,
  });
  return { out, months, useCalib };
}
function runSpread() {
  const product = currentProduct();
  const plan = currentPlan();
  $("spread-result").innerHTML = `<p class="note">計算中です…</p>`;
  setTimeout(() => {
    const { out, months, useCalib } = computeSpread(product, plan);
    const last = out.series[out.series.length - 1];
    const peak = out.series.reduce((a, b) => (b.users.mid > a.users.mid ? b : a));
    const breakEven = out.series.find((s) => s.cumProfit.mid > 0);
    const s = (f) => out.series.map((r) => ({ x: r.month, ...r[f] }));
    $("spread-result").innerHTML = `
      <div class="kpis">
        ${kpi(`${months}か月後の利用者`, fmtPeople(last.users.mid), `幅 ${fmtPeople(last.users.low)}〜${fmtPeople(last.users.high)}`)}
        ${kpi("利用者のピーク", fmtPeople(peak.users.mid), `${peak.month}か月目`)}
        ${kpi(`${months}か月後の月間売上`, fmtYen(last.revenue.mid), `幅 ${fmtYen(last.revenue.low)}〜${fmtYen(last.revenue.high)}`)}
        ${kpi("累計の利益", fmtYen(last.cumProfit.mid), breakEven ? `${breakEven.month}か月目に黒字化` : "期間内に黒字化せず")}
        ${kpi("認知率", pct(last.awareRate.mid), "対象者のうち商品を知っている人")}
      </div>
      <p class="note">${useCalib ? "AIインタビューの結果(年代・性別ごとの購入率)を反映しています。" : "統計モードの購入確率を使っています。"}
      線は${out.runs}回の試行の中央値、帯は下位10%〜上位10%の幅です。</p>
      <h3>利用者数</h3>${line(s("users"), { fmt: fmtPeople, xLabel: "発売からの月数" })}
      <h3>月間売上</h3>${line(s("revenue"), { fmt: fmtYen, xLabel: "発売からの月数", color: "var(--good)" })}
      <h3>累計の利益</h3>${line(s("cumProfit"), { fmt: fmtYen, xLabel: "発売からの月数", color: "var(--female)", zero: true })}`;
  }, 30);
}

// ---------- ⑥ 用途別レポート ----------
function setPurpose(key, note = "") {
  if (!PURPOSES[key]) key = "planning";
  $("purpose").value = $("purpose2").value = key;
  $("purpose-note").textContent = note;
  $("purpose-focus").textContent = `${PURPOSES[key].label}:${PURPOSES[key].focus}`;
  $("loan-box").open = key === "bank";
}
function runReport() {
  const product = currentProduct(), plan = currentPlan(), purpose = $("purpose2").value;
  $("report-out").innerHTML = `<p class="note">計算中です…</p>`;
  setTimeout(() => {
    const { out, useCalib } = computeSpread(product, plan);
    const amount = man("l-amount");
    $("report-out").innerHTML = buildReport({
      purpose, product, plan, spread: out, personas: state.personas, year: $("year").value,
      topic: state.brief?.summary || $("topic").value.trim(),
      ai: useCalib ? state.ai : null,
      loan: purpose === "bank" && amount > 0
        ? { amount, rate: Number($("l-rate").value) || 0, years: Math.max(1, Number($("l-years").value) || 5), grace: Math.max(0, Number($("l-grace").value) || 0) }
        : null,
      fmt: { fmtYen, fmtPeople, pct, num, esc },
    });
    $("print-report").disabled = false;
  }, 30);
}

// ---------- ⑦ 3Dビジュアル ----------
function openVisual() {
  if (!state.visual) {
    state.visual = createVisual($("visual"), { fmtYen, fmtPeople, pct, num, esc });
    if (!state.visual) return;
    gatherCrowd();
  }
  state.visual.run(true);
}
function gatherCrowd() {
  if (!state.visual) return;
  const productA = currentProduct();
  const productB = $("v-ab").checked
    ? { ...productA, price: Math.max(0, Number($("v-price-b").value) || 0), perYear: Math.max(0.1, Number($("v-per-b").value) || productA.perYear) }
    : null;
  const ok = prepareCrowd(state.visual, {
    personas: state.personas, productA, productB, n: Number($("v-n").value), seed: Number($("seed").value) || 1,
    fmt: { fmtYen, fmtPeople, pct, num, esc },
  });
  if (!ok) alert("対象条件に合うペルソナがいません。③の条件を見直してください。");
  state.visual.setSpeed(Number($("v-speed").value));
}

// ---------- ⑤ 経営ゲーム ----------
function startGame() {
  const product = currentProduct();
  state.game = {
    product,
    sim: createSim(state.D, state.personas, product, {
      seed: Number($("g-seed").value) || 7,
      segmentProb: $("s-calib").checked && state.ai ? state.ai.agg.segmentProb : null,
    }),
    log: [],
  };
  $("g-price").value = product.price;
  $("game-board").hidden = false;
  $("g-next").disabled = false;
  renderGame();
}
function nextQuarter() {
  const g = state.game;
  const plan = {
    price: Math.max(0, Number($("g-price").value) || 0),
    ad: { tv: man("g-tv"), net: man("g-net"), store: man("g-store") },
    churn: (Number($("s-churn").value) || 0) / 100,
    costRate: (Number($("s-cost").value) || 0) / 100,
    fixedCost: man("s-fixed"),
  };
  const E = DIFFUSION_ASSUMPTIONS.events.value;
  let profit = 0;
  for (let i = 0; i < 3; i++) {
    const r = g.sim.step(plan, { randomEvents: true });
    profit += r.profit;
    if (r.event) g.log.unshift(`<li><span class="ev">${r.month}か月目:${E[r.event].label}</span> ― ${E[r.event].note}</li>`);
  }
  const last = g.sim.history[g.sim.history.length - 1];
  g.log.unshift(`<li>${last.month - 2}〜${last.month}か月目:価格 ${num(plan.price)}円、広告 ${fmtYen(last.adCost)}/月 → 利用者 ${fmtPeople(last.users)}、この期の利益 ${fmtYen(profit)}</li>`);
  if (last.month >= 60) {
    $("g-next").disabled = true;
    g.log.unshift(`<li><b>5年が経過しました。最終的な累計利益は ${fmtYen(last.cumProfit)} です。</b></li>`);
  }
  renderGame();
}
function renderGame() {
  const g = state.game, h = g.sim.history, last = h[h.length - 1];
  $("g-kpi").innerHTML =
    kpi("経過", `${last?.month ?? 0}か月`, "5年(60か月)で終了") +
    kpi("利用者", fmtPeople(last?.users ?? 0), `対象 ${fmtPeople(g.sim.targetPeople)}`) +
    kpi("認知率", pct(last?.awareRate ?? 0)) +
    kpi("月間売上", fmtYen(last?.revenue ?? 0)) +
    kpi("累計の利益", fmtYen(last?.cumProfit ?? 0));
  const E = DIFFUSION_ASSUMPTIONS.events.value;
  const marks = h.filter((r) => r.event).map((r) => ({ x: r.month, label: E[r.event].label }));
  $("g-chart").innerHTML = h.length > 1
    ? `<h3>利用者数</h3>${line(h.map((r) => ({ x: r.month, mid: r.users })), { fmt: fmtPeople, xLabel: "月", marks })}
       <h3>累計の利益</h3>${line(h.map((r) => ({ x: r.month, mid: r.cumProfit })), { fmt: fmtYen, xLabel: "月", color: "var(--female)", zero: true })}`
    : `<p class="note">価格と広告費を決めて「3か月進める」を押してください。原価率・固定費・解約率は④の設定を使います。</p>`;
  $("g-log").innerHTML = g.log.join("");
}

// ---------- 出典と仮定 ----------
function renderSources() {
  $("sources").innerHTML = `<table><tr><th>データ</th><th>年次</th><th>出典</th><th>確かさ</th></tr>${
    state.D.sources.map((s) => `<tr><td>${esc(s.use)}</td><td>${esc(s.year)}</td><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</td><td>${esc(s.quality)}</td></tr>`).join("")
  }</table>`;
  const rows = [];
  const add = (group, obj) => Object.values(obj).forEach((a) => rows.push(`<tr><td>${group}</td><td>${esc(a.note)}</td><td>${esc(typeof a.value === "object" ? JSON.stringify(a.value) : String(a.value))}</td></tr>`));
  add("ペルソナ生成", ASSUMPTIONS);
  add("市場規模", MARKET_ASSUMPTIONS);
  add("普及シミュレーション", DIFFUSION_ASSUMPTIONS);
  (state.D.dataAssumptions ?? []).forEach((a) => rows.push(`<tr><td>データの補い方</td><td>${esc(a.note)}</td><td>${esc(a.value)}</td></tr>`));
  $("assumptions").innerHTML = `<table><tr><th>区分</th><th>内容</th><th>値</th></tr>${rows.join("")}</table>`;
  $("limits").innerHTML = state.D.limits.map((l) => `<li>${esc(l)}</li>`).join("");
}

init();
