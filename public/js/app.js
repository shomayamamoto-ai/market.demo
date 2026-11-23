// 画面の制御
import { CATEGORIES, CATEGORY_LABEL, AGE_BANDS, ageBandOf } from "./constants.js";
import { generatePersonas, assignAdopterTypes, describePersona, validate, ADOPTER_TYPES, ASSUMPTIONS } from "./personas.js";
import {
  marketSize, totalSpendingCheck, stratifiedSample, personaForLLM, aggregateReactions,
  reweightForYear, inTarget, MARKET_ASSUMPTIONS,
} from "./market.js";
import { createSim, runMany, DIFFUSION_ASSUMPTIONS } from "./diffusion.js";
import { hbar, pyramid, line, combo, multiLine, vbar, esc } from "./charts.js";
import { MODES, PRESETS, ORG_ASSUMPTIONS, runOrg, trialOrg, sweepOrg, nationalSeparation } from "./org.js";
import { mountLab, trial, formatMetric, copyButton } from "./lab.js";
import { showStage, thin } from "./stage3d.js";
import { economy } from "./economy.js";
import { town } from "./town.js";
import { island } from "./island.js";
import { climb } from "./climb.js";
import { council } from "./council.js";
import { labor } from "./labor.js";
import { mountCustom, CUSTOM_ASSUMPTIONS, customChecks } from "./custom.js";
import { regime } from "./regime.js";
import { elders } from "./elders.js";
import { maker } from "./maker.js";
import { persist } from "./persist.js";
import { queue, spreadModel, schelling, newsvendor, laffer } from "./theory.js";
import { threshold, tournament, commons, split } from "./experiments.js";
import { future } from "./future.js";
import LITERATURE from "./literature-data.js";
import { CATALOG, BASIS_NOTE, findScreens, scoreboard } from "./guide.js";
import COHORT from "./cohort-data.js";
import { CHAIN_PRESETS, CHAIN_ASSUMPTIONS, CHAIN_REFERENCE, relay, runChain, trialChain, sweepLayers } from "./chain.js";
import { SOCIETY_PRESETS, SOCIETY_ASSUMPTIONS, runSociety, trialSociety, sweepTax } from "./society.js";
import { makeRng } from "./rng.js";
import { PURPOSES, buildReport } from "./report.js";
import JAPAN from "./japan-data.js";
import { createVisual, prepareCrowd } from "./visual.js";

const $ = (id) => document.getElementById(id);
const state = { opened: {}, D: null, base: [], personas: [], llm: false, materials: [], brief: null, ai: null, game: null };

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
    state.server = true;
    state.llm = s.llm;
    $("status").innerHTML = s.llm
      ? `AIモード:<b class="ok">使えます</b>(${esc(s.model)})`
      : `AIモード:<b class="ng">未設定</b>(統計モードはこのまま使えます)`;
  } catch {
    $("status").innerHTML = `AIモード:<b class="ng">この公開版では使えません</b>(統計モードはすべて使えます)`;
  }
  $("read-brief").disabled = $("run-ai").disabled = !state.llm;

  const years = [state.D.population.year, ...Object.keys(state.D.projection?.years ?? {})];
  $("year").innerHTML = years.map((y, i) => `<option value="${y}">${y}年${i ? "(将来推計)" : "(現在)"}</option>`).join("");
  $("p-category").innerHTML = CATEGORIES.map((c) => `<option value="${c.key}">${c.label}</option>`).join("");
  $("p-category").value = "food";

  $("o-preset").innerHTML = Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  $("o-preset").value = "fixedPush";
  $("o-preset").onchange = () => ($("o-push").value = Math.round(PRESETS[$("o-preset").value].rules.push * 100));
  $("c-preset").innerHTML = Object.entries(CHAIN_PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  $("c-preset").value = "shortcut";
  $("c-preset").onchange = () => { const r = CHAIN_PRESETS[$("c-preset").value].rules; $("c-layers").value = r.layers; $("c-rate").value = Math.round(r.rate * 100); };
  $("o-3d").onclick = () => busy("o-msg", () => org3d());
  $("t-3d").onclick = () => busy("t-msg", () => soc3d());
  $("c-3d").onclick = () => busy("c-msg", () => chain3d());
  buildHub();
  $("c-run").onclick = () => busy("c-msg", chainRun);
  $("c-compare").onclick = () => busy("c-msg", chainCompare);
  $("c-sweep").onclick = () => busy("c-msg", chainSweep);
  $("t-preset").innerHTML = Object.entries(SOCIETY_PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  $("t-preset").value = "heavy";
  $("t-preset").onchange = () => ($("t-tax").value = Math.round(SOCIETY_PRESETS[$("t-preset").value].rules.tax * 100));
  $("t-run").onclick = () => busy("t-msg", socRun);
  $("t-compare").onclick = () => busy("t-msg", socCompare);
  $("t-sweep").onclick = () => busy("t-msg", socSweep);
  $("o-run").onclick = () => busy("o-msg", orgRun);
  $("o-compare").onclick = () => busy("o-msg", orgCompare);
  $("o-sweep").onclick = () => busy("o-msg", orgSweep);
  $("v-set").onclick = () => gatherCrowd();
  // 入力を変えたら、その場で人を集め直す(古い条件のまま走らないようにする)
  $("v-start").onclick = () => { if (state.visual?.phase !== "wander" || state.visualKey !== visualKey()) gatherCrowd(); state.visual?.start(); };
  $("v-n").onchange = () => gatherCrowd();
  $("v-opt-add").onclick = () => { const o = visualOptions(); if (o.length >= 4) return; const last = o[o.length - 1]; state.vOpts = [...o.map((x) => ({ ...x })), { price: Math.round(last.price * 0.7), perYear: last.perYear }]; renderOptions(); gatherCrowd(); };
  $("v-opt-reset").onclick = () => { state.vOpts = null; renderOptions(); gatherCrowd(); };
  $("v-opts").oninput = (e) => {
    const row = e.target.closest("[data-opt]"); if (!row) return;
    state.vOpts ??= visualOptions().map((x) => ({ ...x }));
    const k = Number(row.dataset.opt), o = state.vOpts[k];
    o.price = Math.max(0, Number(row.querySelector(".o-price").value) || 0); o.perYear = Math.max(0.1, Number(row.querySelector(".o-per").value) || 1);
    clearTimeout(state.vTimer); state.vTimer = setTimeout(gatherCrowd, 400);
  };
  $("v-opts").onclick = (e) => { const b = e.target.closest(".o-del"); if (!b || !state.vOpts) return; state.vOpts.splice(Number(b.closest("[data-opt]").dataset.opt), 1); renderOptions(); gatherCrowd(); };
  $("v-speed").onchange = () => state.visual?.setSpeed(Number($("v-speed").value));
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
  $("print-report").hidden = !state.server; // 公開ページの中では印刷を呼び出せないため、サーバーで動かしているときだけ出す
  setPurpose("planning");

  regenerate();
  renderMarket();
  renderSources();
  buildGuide();
  buildNav();
}

// ---------- 画面の切り替え(大きな区分 → 画面) ----------
const NAV = [
  { key: "home", label: "はじめに", tabs: [["home", "はじめに"]] },
  { key: "custom", label: "自分で試す", tabs: [["custom", "オリジナルの実験"]] },
  { key: "japan", label: "仮想の日本", tabs: [["people", "人口とペルソナ"], ["market", "市場の規模感"]] },
  { key: "market", label: "市場を試す", tabs: [["sim", "お題と市場規模"], ["spread", "発売後の広がり"], ["visual", "3Dで見る"], ["game", "経営ゲーム"], ["report", "レポート"]] },
  { key: "rules", label: "制度を試す", tabs: [["org", "職場のルール"], ["tax", "税率と助け合い"], ["chain", "多重下請け"]] },
  { key: "behavior", label: "経済と行動", tabs: [] },
  { key: "theory", label: "理論で確かめる", tabs: [] },
  { key: "experiment", label: "実験と比べる", tabs: [] },
  { key: "source", label: "精度と出典", tabs: [["score", "精度の成績表"], ["source", "出典と仮定"]] },
];
const LABS = [economy, labor, maker, town, island, council, regime, elders, climb, persist];
const THEORY_LABS = [queue, spreadModel, schelling, newsvendor, laffer];
const EXPERIMENT_LABS = [commons, split, tournament, threshold];
function buildNav() {
  mountCustom({ getPersonas: () => state.personas, seedOf: () => Number($("seed").value) || 1, before: $("tab-score") });
  for (const def of LABS) { mountLab(def, { seedOf: () => Number($("seed").value) || 1 }); NAV.find((g) => g.key === "behavior").tabs.push([def.key, def.title]); }
  for (const def of EXPERIMENT_LABS) { mountLab(def, { seedOf: () => Number($("seed").value) || 1 }); NAV.find((g) => g.key === "experiment").tabs.push([def.key, def.title]); }
  mountLab(future, { seedOf: () => 1 }); NAV.find((g) => g.key === "japan").tabs.push([future.key, future.title]);
  for (const def of THEORY_LABS) { mountLab(def, { seedOf: () => Number($("seed").value) || 1 }); NAV.find((g) => g.key === "theory").tabs.push([def.key, def.title]); }
  $("toc").firstElementChild.innerHTML = NAV.map((g) =>
    `${g.tabs.length > 1 ? `<h2>${g.label}</h2>` : ""}<div class="grp" data-group="${g.key}">${g.tabs.map(([id, label]) => `<a href="#${id}" data-tab="${id}">${label}</a>`).join("")}</div>`).join("");
  document.querySelectorAll(".viewtabs button").forEach((b) => (b.onclick = () => (location.hash = NAV.find((g) => g.key === b.dataset.group).tabs[0][0])));
  window.addEventListener("hashchange", showTab);
  showTab();
}
function showTab() {
  const id = location.hash.slice(1);
  const group = NAV.find((g) => g.tabs.some(([t]) => t === id)) ?? NAV[0];
  const tab = group.tabs.some(([t]) => t === id) ? id : group.tabs[0][0];
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.id === `tab-${tab}`));
  document.querySelectorAll(".viewtabs button").forEach((b) => b.classList.toggle("on", b.dataset.group === group.key));
  document.querySelectorAll("#toc .grp").forEach((g) => g.classList.toggle("on", g.dataset.group === group.key));
  document.querySelectorAll("#toc a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
  $("toc").classList.toggle("solo", group.tabs.length < 2);
  // 「制度を試す」の2画面は、人数や期間の入力欄を共有する
  const slot = document.querySelector(`#tab-${tab} .slot`);
  if (slot) { slot.appendChild($("org-common")); $("org-common").hidden = false; }
  if (tab === "visual") { if (state.hubOn) state.hubPlay(); else openVisual(); } else state.visual?.run(false);
  // 初めて開いた画面は、標準の条件で結果を出しておく
  if (!state.opened[tab]) {
    state.opened[tab] = true;
    document.getElementById(`tab-${tab}`)?.dispatchEvent(new Event("lab:open"));
    const first = { sim: "run-stat", spread: "run-spread", org: "o-run", tax: "t-run", chain: "c-run", report: "run-report" }[tab];
    if (first) $(first).click();
  }
  if (document.activeElement?.blur && id) window.scrollTo({ top: 0 });
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
    kpi("就業している人", fmtPeople(sum(adults.filter((p) => p.working), (p) => p.weight)), "15歳以上");

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
  const fmtT = (t, v) => (t.unit === "people" ? fmtPeople(v) : t.unit === "yen" ? `${num(v)}円` : pct(v));
  $("validation").innerHTML = `<table><tr><th>項目</th><th class="num">このモデル</th><th class="num">公表値</th><th class="num">ずれ</th><th>公表値の出典</th></tr>${
    validate(state.D, state.base).map((t) => `<tr><td>${t.label}</td><td class="num">${fmtT(t, t.model)}</td><td class="num">${fmtT(t, t.value)}</td><td class="num ${Math.abs(t.error) > 0.1 ? "bad" : ""}">${t.error >= 0 ? "+" : ""}${num(t.error * 100, 1)}%</td><td>${esc(t.source)}</td></tr>`).join("")
  }</table>`;
  renderPersonaList(1);
}

function personaCard(p, extra = "") {
  const t = p.traits;
  const top = Object.entries(p.spend).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${CATEGORY_LABEL[k]} ${num(v)}円`).join(" / ");
  return `<div class="persona"><b>${esc(describePersona(p))}</b><br>
    <span class="tag">年収 ${num(p.income)}万円</span><span class="tag">${p.marital}</span>${p.savings != null ? `<span class="tag">貯蓄 ${num(p.savings)}万円</span>` : ""}
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
  const E = state.D.spending.elasticity;
  $("spend-elasticity").innerHTML = `<table><tr><th>費目</th><th class="num">支出弾力性</th><th>性質</th></tr>${CATEGORIES.map((k) => ({ k, e: E[k.key] })).sort((a, b) => a.e - b.e).map(({ k, e }) => `<tr><td>${k.label}</td><td class="num">${num(e, 2)}</td><td>${e < 1 ? "基礎的(暮らしに欠かせない)" : "選択的(余裕があると増える)"}</td></tr>`).join("")}</table>
    <p class="note">消費支出の総額が1%多い世帯が、その費目に何%多く使っているかを、家計調査(二人以上の世帯、年間収入18階級)から推定した値です。<br>収入の高い世帯は子育て世代が多いため、教育などは年齢の違いも混ざった値になっています。</p>`;
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
    if (f.size > 20 * 1024 * 1024) { setMsg("brief-msg", `${f.name} は20MBを超えているため追加できません。`, true); continue; }
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
    <p class="note">価格への敏感さ:このモデルでは、価格を1%上げると購入者が約${num(-m.elasticity, 2)}%減ります。<br>参考:実際の商品を調べた研究の平均は、1%の値上げで1.8〜2.6%の減少です(Tellis 1988; Bijmolt ほか 2005。同じ分野の他社商品へ乗り換える分を含む値)。</p>
    <p class="note">統計モードの試算です。「価格と普段の支出のつり合い」と「価値観との相性」から計算しています。<br>実際の売上は、商品を知ってもらえる割合(認知)で大きく変わります。「発売後の広がり」で確かめてください。</p>
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
    setMsg("ai-msg", "完了しました。「発売後の広がり」に結果を引き継げます。");
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
    
  }, 30);
}

// ---------- ⑧ 組織シミュレーター ----------
function busy(msgId, fn) {
  setMsg(msgId, "計算中です…");
  setTimeout(() => { try { fn(); setMsg(msgId, ""); } catch (err) { setMsg(msgId, err.message, true); } }, 30);
}
function orgConfig() {
  const v = (id) => Math.max(0, Number($(id).value) || 0);
  const ace = Math.min(100, v("o-ace")) / 100, low = Math.min(100 - ace * 100, v("o-low")) / 100;
  const ages = [{ min: 22, max: 34, share: v("o-young") }, { min: 35, max: 49, share: v("o-mid") }, { min: 50, max: 64, share: v("o-old") }];
  if (!ages.some((a) => a.share > 0)) throw new Error("年齢構成を入力してください。");
  return {
    config: { n: clampInt(v("o-n"), 20, 5000), ages, mix: { ace, std: 1 - ace - low, low }, seed: Number($("seed").value) || 1, natural: v("o-natural") >= 1 },
    years: clampInt(v("o-years"), 5, 100), runs: clampInt(v("o-runs"), 5, 200),
    rules: { ...PRESETS[$("o-preset").value].rules, push: Math.min(100, v("o-push")) / 100 },
    presetLabel: PRESETS[$("o-preset").value].label,
  };
}
const clampInt = (x, lo, hi) => Math.round(Math.min(hi, Math.max(lo, x)));
const aCard = (label, value, sub = "") => `<div class="a-card"><small>${label}</small><b>${value}</b> <i>${sub}</i></div>`;

function orgAdvice(t, rules, start) {
  const out = [];
  if (t.wiped / t.runs >= 0.5) out.push("このルールでは、エースの働き方が損になり、ほとんどの試行でエースがいなくなりました。本人の怠慢ではなく、ルールに対する合理的な選択の結果です。");
  else if (t.ace < start.ace * 0.7) out.push("エースの割合が、最初より3割以上減っています。頑張るほど損をする場面が残っている可能性があります。");
  else if (t.ace > start.ace * 1.3) out.push("エースの働き方を選ぶ人が増えています。成果が本人に返る仕組みが働いています。");
  if (rules.pay === "fixed" && rules.push > 0 && !rules.helpPay) out.push("定額給のまま仕事だけが早い人へ回っています。回す割合を下げるか、引き受けた分をその場で報いる仕組みを検討してください(「回す割合を変えて検証する」で、崩れ始める境目を確認できます)。");
  if (t.productivity < 0.9) out.push(`生産力は最初の${pct(t.productivity, 0)}まで下がりました。`);
  if (t.productivity > 1.1) out.push(`生産力は最初の${pct(t.productivity, 0)}まで伸びました。`);
  if (t.hours > 8.5) out.push(`平均の労働時間が1日${num(t.hours, 1)}時間に延びています。生産力が伸びていても、疲れの蓄積と離脱に注意が必要です。`);
  if (t.burnout / Math.max(1, 1) > 0 && t.burnout > 0.05 * start.n) out.push(`過労による離脱が、期間中に延べ${num(t.burnout)}人出ました。`);
  if (t.quit > 0.02 * start.n) out.push(`より条件の良い職場への転職が、延べ${num(t.quit)}人出ました。表彰だけでは引き止められていません。`);
  return out;
}

function orgRun() {
  const { config, years, runs, rules, presetLabel } = orgConfig();
  const t = trialOrg(config, rules, years, runs);
  const one = runOrg(config, rules, years); // 画面で1人ずつ見せる代表例
  const S = t.series;
  const advice = orgAdvice(t, rules, { ace: config.mix.ace, n: config.n });
  $("t-out").innerHTML = $("c-out").innerHTML = ""; $("o-out").innerHTML = `<div class="analysis">
      <h2>${esc(presetLabel)}を${runs}回検証</h2>
      <p class="a-sub">${num(config.n)}人の職場で、早い人に回す割合 ${pct(rules.push, 0)}、${years}年後までを計算</p>
      <div class="a-cards">
        ${aCard(`${years}年後の生産力`, pct(t.productivity, 0), "最初を100%として")}
        ${aCard("エースの割合", pct(t.ace), `最初は${pct(config.mix.ace, 0)}`)}
        ${aCard("エースが全滅した回数", `${t.wiped}`, `/ ${runs}回`)}
        ${aCard("平均の労働時間", `${num(t.hours, 1)}時間`, "1日あたり。実績は一般労働者で8.4時間(月160.5時間÷19.2日、毎月勤労統計2025)")}
        ${aCard("過労による離脱", `${num(t.burnout)}人`, `期間中の延べ人数(年${pct(t.burnout / years / config.n)})`)}
        ${config.natural ? aCard("世間並みの入れ替わり", `年${num(t.natural / years)}人`, `年${pct(t.natural / years / config.n)}。年齢別の離職率の実績(雇用動向調査2025)を毎年当てはめた結果`) : aCard("世間並みの離職(参考)", `年${pct(nationalSeparation(config.ages))}`, `この年齢構成なら年${num(nationalSeparation(config.ages) * config.n)}人。計算には入れていません`)}
      </div>
      <p class="a-headline">${esc(advice[0] ?? "このルールでは、働き方と生産力に大きな変化は出ませんでした。")}</p>
      <p class="a-note">数字は${runs}回の試行の平均です。</p></div>
    <div class="card"><div class="form-row" id="o-copy"></div>${advice.length > 1 ? `<h3>ほかに読み取れること</h3><div class="advice"><ul>${advice.slice(1).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      <div class="grid2" style="margin:0"><div><h3>働き方の割合</h3>${multiLine(["ace", "std", "low"].map((m) => ({ name: MODES[m].label, color: MODES[m].color, points: S.map((s, x) => ({ x, y: s[m] })) })), { xLabel: "年" })}</div>
      <div><h3>生産力(最初 = 100%)</h3>${multiLine([{ name: "生産力", color: "#1a8f5a", points: S.map((s, x) => ({ x, y: s.productivity })) }], { xLabel: "年" })}</div></div>
      <h3>1人ずつの働き方(代表例:${runs}回のうちの1回)</h3>
      <div class="o-play"><button id="o-playbtn">再生</button><input id="o-year" type="range" min="0" max="${years}" value="0"><b id="o-year-label"></b></div>
      <div id="o-people" class="o-grid"></div>
      <p class="note">■ 青=エース ■ 水色=標準 ■ 黄=省エネ。四角1つが社員1人です(最大1,000人まで表示)。</p></div>`;
  const draw = () => {
    const y = Number($("o-year").value), h = one.history[y];
    $("o-year-label").textContent = `${y}年目 エース ${pct(h.share.ace)}・生産力 ${pct(h.productivity, 0)}`;
    $("o-people").innerHTML = h.modes.slice(0, 1000).map((m) => `<i style="background:${MODES[m].color}"></i>`).join("");
  };
  $("o-year").oninput = draw;
  let timer = null;
  $("o-playbtn").onclick = () => {
    if (timer) { clearInterval(timer); timer = null; $("o-playbtn").textContent = "再生"; return; }
    if (Number($("o-year").value) >= years) $("o-year").value = 0;
    $("o-playbtn").textContent = "停止";
    timer = setInterval(() => {
      if (!document.getElementById("o-year") || Number($("o-year").value) >= years) { clearInterval(timer); timer = null; if ($("o-playbtn")) $("o-playbtn").textContent = "再生"; return; }
      $("o-year").value = Number($("o-year").value) + 1; draw();
    }, 350);
  };
  draw();
  attachCopy("o-copy", "o-out");
}

function orgCompare() {
  const { config, years, runs } = orgConfig();
  const rows = Object.values(PRESETS).map((p) => ({ label: p.label, t: trialOrg(config, p.rules, years, runs), push: p.rules.push }));
  const best = rows.reduce((a, b) => (b.t.productivity > a.t.productivity ? b : a));
  const calm = rows.reduce((a, b) => (b.t.hours < a.t.hours ? b : a));
  $("t-out").innerHTML = $("c-out").innerHTML = ""; $("o-out").innerHTML = `<div class="analysis">
      <h2>4つのルールを${runs}回ずつ検証</h2>
      <p class="a-sub">${num(config.n)}人の職場、${years}年後。それぞれのルールの標準の設定で比べています</p>
      <div class="table-scroll"><table><tr><th>ルール</th><th class="num">生産力</th><th class="num">エースの割合</th><th class="num">エース全滅</th><th class="num">労働時間</th><th class="num">過労の離脱</th><th class="num">転職</th></tr>
      ${rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${pct(r.t.productivity, 0)}</td><td class="num">${pct(r.t.ace)}</td><td class="num">${r.t.wiped} / ${runs}回</td><td class="num">${num(r.t.hours, 1)}時間</td><td class="num">${num(r.t.burnout)}人</td><td class="num">${num(r.t.quit)}人</td></tr>`).join("")}</table></div>
      <div class="a-cards">${aCard("生産力が最も高い", pct(best.t.productivity, 0), esc(best.label))}${aCard("労働時間が最も短い", `${num(calm.t.hours, 1)}時間`, esc(calm.label))}</div>
      <p class="a-note">生産力は最初を100%とした値、離脱と転職は期間中の延べ人数(${runs}回の平均)です。</p></div>
    <div class="card"><h3>生産力の推移</h3>${multiLine(rows.map((r, i) => ({ name: r.label.slice(0, 1), color: ["#2f6fe4", "#e2574c", "#f2a53c", "#1a8f5a"][i], points: r.t.series.map((s, x) => ({ x, y: s.productivity })) })), { xLabel: "年" })}
      <h3>エースの割合の推移</h3>${multiLine(rows.map((r, i) => ({ name: r.label.slice(0, 1), color: ["#2f6fe4", "#e2574c", "#f2a53c", "#1a8f5a"][i], points: r.t.series.map((s, x) => ({ x, y: s.ace })) })), { xLabel: "年" })}</div>`;
}

function orgSweep() {
  const { config, years, runs, rules, presetLabel } = orgConfig();
  const values = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const sw = sweepOrg(config, rules, "push", values, years, runs);
  const safe = sw.filter((s) => s.wiped === 0), all = sw.filter((s) => s.wiped === runs), mid = sw.filter((s) => s.wiped > 0 && s.wiped < runs);
  const range = (list) => (list.length ? (list.length > 1 ? `${pct(list[0].value, 0)}〜${pct(list[list.length - 1].value, 0)}` : pct(list[0].value, 0)) : "―");
  const edge = safe.length && safe.length < sw.length ? safe[safe.length - 1].value : null;
  $("t-out").innerHTML = $("c-out").innerHTML = ""; $("o-out").innerHTML = `<div class="analysis">
      <h2>「早い人に回す割合」を変えて${runs}回ずつ検証</h2>
      <p class="a-sub">${esc(presetLabel)}のルールで、早く終わった人へ回す割合だけを0〜100%に変えた(${years}年後)</p>
      <p class="a-key">エースが全滅した回数(棒)と、${years}年後のエースの割合・生産力(線)</p>
      ${combo(sw.map((s) => ({ label: pct(s.value, 0), bar: s.wiped, a: s.productivity, b: s.ace })), { barMax: runs, legend: { a: "生産力(平均)", b: "エースの割合(平均)", bar: `エースが全滅した回数(${runs}回中)` }, xLabel: "早い人に回す割合(終わらない箱を、早く終わった人へ回す割合)" })}
      <div class="a-cards">
        ${aCard(`回す割合 ${range(safe)}`, safe.length ? "全滅 0" : "―", `/ ${runs}回`)}
        ${mid.map((s) => aCard(`回す割合 ${pct(s.value, 0)}`, `全滅 ${s.wiped}`, `/ ${runs}回`)).slice(0, 2).join("")}
        ${aCard(`回す割合 ${range(all)}`, all.length ? `全滅 ${runs}` : "―", `/ ${runs}回`)}
        ${aCard("回す割合100%の生産力", `平均${pct(sw[sw.length - 1].productivity)}`)}
      </div>
      <p class="a-note">${edge != null ? `このモデルの条件では、回す割合が${pct(edge, 0)}までならエースは残り、それを超えると崩れ始めます。` : safe.length ? "このルールでは、回す割合を100%にしてもエースは残りました。" : "このルールでは、回す割合が0%でもエースがいなくなる試行がありました。"}境目の位置は、「出典と仮定」にある係数で変わります。</p></div>`;
}

// 検証結果のパネルから、題名・数字・読み取りを集めてコピー用の文章にする
function attachCopy(slotId, outId) {
  const out = $(outId), panel = out.querySelector(".analysis");
  const lines = [panel.querySelector("h2").textContent + "(" + panel.querySelector(".a-sub").textContent + ")",
    ...[...panel.querySelectorAll(".a-card")].map((c) => `・${c.querySelector("small").textContent}:${c.querySelector("b").textContent} ${c.querySelector("i").textContent}`.trim()),
    `→ ${panel.querySelector(".a-headline").textContent}`, ...[...out.querySelectorAll(".advice li")].map((li) => `→ ${li.textContent}`), "※ 仮定にもとづく試算です。"];
  $(slotId).appendChild(copyButton(lines.join("\n")));
}

// ---------- 制度を試す:3Dで見る ----------
function org3d(o = {}) {
  const c = orgConfig(), { config, years } = c, rules = o.rules ?? c.rules, presetLabel = o.label ?? c.presetLabel;
  const stage = showStage(o.container ?? $("o-stage"), !o.container); if (!stage) return;
  const frames = thin(runOrg(config, rules, years).history).map((h) => ({
    label: `${h.year}年目`, caption: `${h.year}年目:エース ${pct(h.share.ace)}、生産力 ${pct(h.productivity, 0)}、1日の労働時間 ${num(h.hours, 1)}時間。`,
    gauges: [{ label: "生産力", text: pct(h.productivity, 0), value: h.productivity / 2.2, color: "#2f8f6b" }],
    zones: ["ace", "std", "low"].map((m) => ({ name: MODES[m].label, note: `(1日${MODES[m].boxes}箱)`, color: MODES[m].color, count: config.n * h.share[m], build: "factory" })),
  }));
  stage.setFrames(frames, { title: presetLabel.replace(/^. /, ""), sub: "働き方を変えた人が、場所を移ります。" });
}
function soc3d(o = {}) {
  const c = socConfig(), { config, years } = c, rules = o.rules ?? c.rules, label = o.label ?? c.label;
  const stage = showStage(o.container ?? $("t-stage"), !o.container); if (!stage) return;
  const frames = thin(runSociety(config, rules, years).history).map((h) => {
    const n = config.n * h.population;
    return { label: `${h.year}年目(税率 ${pct(h.tax, 0)})`, caption: `${h.year}年目:森に挑戦する人 ${pct(h.risky, 0)}、生産力 ${pct(h.productivity, 0)}、人口 ${pct(h.population, 0)}。`,
      gauges: [{ label: "生産力", text: pct(h.productivity, 0), value: h.productivity / 2.5, color: "#2f8f6b" }, { label: "助け合いの支払い", text: pct(h.trust, 0), value: h.trust, color: "#c9a45c" }],
      zones: ["risky", "safe", "home"].map((m) => ({ name: CHOICE[m].label.split("(")[0], color: CHOICE[m].color, count: n * h[m], build: { risky: "forest", safe: "plaza", home: "field" }[m] })) };
  });
  stage.setFrames(frames, { title: label.slice(2), sub: "隣の村へ移る人は、島の外へ出ていきます。", props: [{ kind: "house", color: "#c9a45c", x: 0, z: 0.42, label: "村の貯蔵庫", size: 1.6 }, { kind: "houses", color: "#c98bb5", x: -0.6, z: 0.5 }, { kind: "houses", color: "#6da7d8", x: 0.6, z: 0.5 }] });
}
function chain3d(o = {}) {
  const c = chainConfig(), { config, days } = c, rules = o.rules ?? c.rules, label = o.label ?? c.label;
  const stage = showStage(o.container ?? $("c-stage"), !o.container); if (!stage) return;
  const result = runChain(config, rules, days);
  const frames = result.history.map((h) => ({
    label: `${h.day}日目`, caption: `${h.day}日目:働いている人 ${pct(h.alive, 0)}、進み具合 ${pct(h.progress, 0)}、強度 ${pct(h.strength, 0)}${h.cut > 0.05 ? `。${pct(h.cut, 0)}の人が泥ブロックを使っています` : ""}。`,
    gauges: [{ label: "進み具合", text: pct(h.progress, 0), value: h.progress, color: "#4a7fb5" }, { label: "強度", text: pct(h.strength, 0), value: h.strength / 1.25, color: "#2f8f6b" }],
    bridge: { progress: h.progress, strength: h.strength, quality: h.progress > 0 ? h.strength / h.progress : 1 },
    zones: [{ name: "現場で働いている人", color: "#4a7fb5", count: config.n * h.alive, build: "site" }, { name: "倒れて離れた人", color: "#8b93a7", count: config.n * (1 - h.alive), build: "tent" }],
  }));
  // 最後に、引き渡した後のようすを1コマ足す
  const end = frames[frames.length - 1];
  frames.push({ ...end, label: "引き渡しのあと",
    bridge: { ...end.bridge, fallen: result.collapsed },
    caption: !result.complete ? `工期の${days}日では完成しませんでした(進み具合 ${pct(result.progress, 0)})。`
      : result.collapsed ? `引き渡しのあと、橋は崩れました。強度は${pct(result.strength, 0)}。やり直しの費用は、発注した側に返ってきます。`
      : `橋は崩れずに持ちこたえました。強度は${pct(result.strength, 0)}。` });
  const R = relay(config.n, rules), steps = [{ label: "発注者", note: ` 予算 ${num(config.n)}個`, color: "#c9a45c" }, ...R.steps.map((st) => ({ label: st.label, note: ` −${num(st.take)}個`, color: "#b4473b" }))];
  const props = steps.map((st, i) => ({ kind: "office", color: st.color, label: st.label, note: st.note, x: -0.72 + i * (1.1 / Math.max(steps.length - 1, 1)) * 0.75, z: 0.5, size: 1.15 }));
  stage.setFrames(frames, { title: label.slice(2), sub: `現場に届く予算は${pct(R.delivered / config.n, 0)}。`, bridge: true, props });
}

// ---------- ⑧-2 税率と助け合い ----------
const CHOICE = { risky: { label: "森(危険・多い)", color: "#1a8f5a" }, safe: { label: "広場(安全・少ない)", color: "#58c4dd" }, home: { label: "自分の畑だけ", color: "#f2c94c" }, gone: { label: "隣の村へ", color: "#3a4256" } };
function socConfig() {
  const { config, years, runs } = orgConfig();
  const preset = SOCIETY_PRESETS[$("t-preset").value];
  return { config: { n: config.n, ages: config.ages, seed: config.seed }, years, runs: Math.min(runs, 100), label: preset.label,
    rules: { ...preset.rules, tax: Math.min(95, Math.max(0, Number($("t-tax").value) || 0)) / 100 } };
}
function socAdvice(L, first, rules) {
  const out = [];
  if (rules.tax === 0) out.push("助け合いが無いため、けがを恐れて森に行く人が少なく、生産力は頭打ちです。");
  if (L.risky > 0.6 && rules.tax > 0 && rules.tax <= 0.4) out.push("けがをしても支えてもらえる安心があるため、多くの人が森に挑戦し、生産力が伸びています。");
  if (L.home > 0.3) out.push(`税のかからない「自分の畑だけ」を選ぶ人が${pct(L.home, 0)}います。働いても手元に残りにくく、挑戦する意味が薄れています。`);
  if (L.population < 0.8) out.push(`人口が最初の${pct(L.population, 0)}まで減りました。条件の良い隣の村へ、腕の良い人から移っています。`);
  if (L.trust < 0.7 && rules.tax > 0) out.push(`助け合いの支払いが、必要な額の${pct(L.trust, 0)}しかまかなえていません。税を払う人が減り、約束した保障を守れなくなっています。`);
  if (L.admin > 0.3 * Math.max(L.revenue, 1e-9)) out.push(`税収の${pct(L.admin / Math.max(L.revenue, 1e-9), 0)}が管理に使われ、助け合いに回っていません。`);
  if (L.productivity < first.productivity * 0.7) out.push(`生産力は、最初の年の${pct(L.productivity / first.productivity, 0)}まで落ちました。`);
  return out;
}
function socRun() {
  const { config, years, runs, rules, label } = socConfig();
  const t = trialSociety(config, rules, years, runs), L = t.last, S = t.series;
  const one = runSociety(config, rules, years);
  const advice = socAdvice(L, S[0], rules);
  $("o-out").innerHTML = $("c-out").innerHTML = ""; $("t-out").innerHTML = `<div class="analysis">
      <h2>${esc(label.slice(2))}を${runs}回検証</h2>
      <p class="a-sub">${num(config.n)}人の村、税率 ${pct(rules.tax, 0)}${rules.rebuildAt != null ? `(${rules.rebuildAt}年目に立て直し策を実施)` : ""}、${years}年後までを計算</p>
      <div class="a-cards">
        ${aCard(`${years}年後の生産力`, pct(L.productivity, 0), "全員が広場で働く場合を100%として")}
        ${aCard("森に挑戦する人", pct(L.risky, 0), `自分の畑だけの人は${pct(L.home, 0)}`)}
        ${aCard("1人あたりの税収", `${num(L.revenue, 2)}個`, `うち管理に${num(L.admin, 2)}個`)}
        ${aCard("人口", pct(L.population, 0), "最初を100%として")}
        ${aCard("助け合いの支払い", pct(L.trust, 0), "必要な額に対して")}
      </div><p class="a-headline">${esc(advice[0] ?? "この制度では、大きな問題は出ませんでした。")}</p>
      <p class="a-note">数字は${runs}回の試行の平均です。食料の単位は「個」です。</p></div>
    <div class="card"><div class="form-row" id="t-copy"></div>${advice.length > 1 ? `<h3>ほかに読み取れること</h3><div class="advice"><ul>${advice.slice(1).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      <div class="grid2" style="margin:0"><div><h3>働き方の割合</h3>${multiLine(["risky", "safe", "home"].map((m) => ({ name: CHOICE[m].label.split("(")[0], color: CHOICE[m].color, points: S.map((s, x) => ({ x, y: s[m] })) })), { xLabel: "年" })}</div>
      <div><h3>生産力と人口</h3>${multiLine([{ name: "生産力", color: "#1a8f5a", points: S.map((s, x) => ({ x, y: s.productivity })) }, { name: "人口", color: "#8b93a7", points: S.map((s, x) => ({ x, y: s.population })) }], { xLabel: "年" })}</div></div>
      <h3>1人ずつの選択(代表例:${runs}回のうちの1回)</h3>
      <div class="o-play"><button id="o-playbtn">再生</button><input id="o-year" type="range" min="0" max="${years}" value="0"><b id="o-year-label"></b></div>
      <div id="o-people" class="o-grid"></div>
      <p class="note">■ 緑=森 ■ 水色=広場 ■ 黄=自分の畑だけ ■ 灰=隣の村へ移った人(最大1,000人まで表示)。</p></div>`;
  playGrid(years, (y) => { const h = one.history[y]; return { label: `${y}年目 森 ${pct(h.risky, 0)}・生産力 ${pct(h.productivity, 0)}`, cells: h.choices.slice(0, 1000).map((c) => CHOICE[c].color) }; });
  attachCopy("t-copy", "t-out");
}
function playGrid(years, frameOf) {
  const draw = () => { const f = frameOf(Number($("o-year").value)); $("o-year-label").textContent = f.label; $("o-people").innerHTML = f.cells.map((c) => `<i style="background:${c}"></i>`).join(""); };
  $("o-year").oninput = draw;
  let timer = null;
  $("o-playbtn").onclick = () => {
    if (timer) { clearInterval(timer); timer = null; $("o-playbtn").textContent = "再生"; return; }
    if (Number($("o-year").value) >= years) $("o-year").value = 0;
    $("o-playbtn").textContent = "停止";
    timer = setInterval(() => {
      if (!document.getElementById("o-year") || Number($("o-year").value) >= years) { clearInterval(timer); timer = null; if ($("o-playbtn")) $("o-playbtn").textContent = "再生"; return; }
      $("o-year").value = Number($("o-year").value) + 1; draw();
    }, 350);
  };
  draw();
}
function socCompare() {
  const { config, years, runs } = socConfig();
  const colors = ["#8b93a7", "#1a8f5a", "#e2574c", "#f2a53c", "#b277d9", "#2f6fe4"];
  const rows = Object.values(SOCIETY_PRESETS).map((p) => ({ label: p.label, t: trialSociety(config, p.rules, years, runs) }));
  const best = rows.reduce((a, b) => (b.t.last.productivity > a.t.last.productivity ? b : a));
  $("o-out").innerHTML = $("c-out").innerHTML = ""; $("t-out").innerHTML = `<div class="analysis">
      <h2>6つの制度を${runs}回ずつ検証</h2>
      <p class="a-sub">${num(config.n)}人の村、${years}年後。Fは8年目に立て直し策(税率20%へ減税・管理の簡素化・挑戦への還元)を実施</p>
      <div class="table-scroll"><table><tr><th>制度</th><th class="num">生産力</th><th class="num">森に挑戦</th><th class="num">自分の畑だけ</th><th class="num">税収/人</th><th class="num">人口</th><th class="num">助け合いの支払い</th></tr>
      ${rows.map((r) => { const L = r.t.last; return `<tr><td>${esc(r.label)}</td><td class="num">${pct(L.productivity, 0)}</td><td class="num">${pct(L.risky, 0)}</td><td class="num">${pct(L.home, 0)}</td><td class="num">${num(L.revenue, 2)}個</td><td class="num">${pct(L.population, 0)}</td><td class="num">${pct(L.trust, 0)}</td></tr>`; }).join("")}</table></div>
      <div class="a-cards">${aCard("生産力が最も高い", pct(best.t.last.productivity, 0), esc(best.label))}</div>
      <p class="a-note">生産力は「全員が広場で働く場合」を100%、人口は最初を100%とした値です。</p></div>
    <div class="card"><h3>生産力の推移</h3>${multiLine(rows.map((r, i) => ({ name: r.label.slice(0, 1), color: colors[i], points: r.t.series.map((s, x) => ({ x, y: s.productivity })) })), { xLabel: "年" })}</div>`;
}
function socSweep() {
  const { config, years, runs, rules, label } = socConfig();
  const values = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  const sw = sweepTax(config, rules, values, years, runs);
  const maxRev = Math.max(...sw.map((s) => s.last.revenue), 1e-9);
  const top = sw.reduce((a, b) => (b.last.productivity > a.last.productivity ? b : a));
  const rev = sw.reduce((a, b) => (b.last.revenue > a.last.revenue ? b : a));
  const fall = sw.find((s) => s.value > top.value && s.last.productivity < top.last.productivity * 0.8);
  $("o-out").innerHTML = $("c-out").innerHTML = ""; $("t-out").innerHTML = `<div class="analysis">
      <h2>税率を変えて${runs}回ずつ検証</h2>
      <p class="a-sub">${esc(label.slice(2))}の条件で、税率だけを0〜80%に変えた(${years}年後)</p>
      <p class="a-key">1人あたりの税収(棒)と、${years}年後の生産力・森に挑戦する人の割合(線)</p>
      ${combo(sw.map((s) => ({ label: pct(s.value, 0), bar: Math.round((s.last.revenue / maxRev) * 100), a: s.last.productivity, b: s.last.risky })), { barMax: 100, barUnit: "", legend: { a: "生産力(平均)", b: "森に挑戦する人(平均)", bar: "税収(最大を100とした値)" }, xLabel: "税率" })}
      <div class="a-cards">
        ${aCard("生産力が最大の税率", pct(top.value, 0), `生産力 ${pct(top.last.productivity, 0)}`)}
        ${aCard("税収が最大の税率", pct(rev.value, 0), `1人あたり ${num(rev.last.revenue, 2)}個`)}
        ${aCard("税率0%の生産力", pct(sw[0].last.productivity, 0), "助け合いなし")}
        ${aCard("税率80%の生産力", pct(sw[sw.length - 1].last.productivity, 0), `税収 ${num(sw[sw.length - 1].last.revenue, 2)}個`)}
      </div>
      <p class="a-note">${fall ? `このモデルの条件では、税率${pct(fall.value, 0)}で生産力が最大時の8割を下回ります。` : ""}税率を上げても、ある所から税収は増えなくなります(ラッファー曲線と呼ばれる形)。山の位置は「出典と仮定」の係数で変わり、現実の税率の目安を示すものではありません。</p></div>`;
}

// ---------- ⑧-3 多重下請け ----------
function chainConfig() {
  const { config, runs } = orgConfig();
  const v = (id, lo, hi, d) => Math.min(hi, Math.max(lo, Number($(id).value) || d));
  const preset = CHAIN_PRESETS[$("c-preset").value];
  return { config: { n: Math.min(config.n, 2000), ages: config.ages, seed: config.seed }, runs: Math.min(runs, 100), days: Math.round(v("c-days", 10, 120, 30)), label: preset.label,
    rules: { ...preset.rules, layers: Math.round(v("c-layers", 0, 6, 0)), rate: v("c-rate", 0, 90, 0) / 100 } };
}
const chainOut = (html) => { $("o-out").innerHTML = $("t-out").innerHTML = ""; $("c-out").innerHTML = html; };
function relayTable(n, rules) {
  const r = relay(n, rules);
  return `<div class="table-scroll"><table><tr><th>予算の流れ</th><th class="num">1日あたり</th></tr><tr><td>発注者が出す予算</td><td class="num">${num(n)}個</td></tr>${
    r.steps.map((s) => `<tr><td>${s.label}の取り分</td><td class="num">−${num(s.take, 1)}個</td></tr>`).join("")}<tr><td><b>現場に届く</b></td><td class="num"><b>${num(r.delivered, 1)}個(${pct(r.delivered / n, 0)})</b></td></tr></table></div>`;
}
function chainRun() {
  const { config, runs, days, rules, label } = chainConfig();
  const t = trialChain(config, rules, days, runs), S = t.series;
  const one = runChain(config, rules, days);
  const advice = [];
  if (t.delivered < 0.7) advice.push(`予算の${pct(1 - t.delivered, 0)}が途中で抜かれ、現場には${pct(t.delivered, 0)}しか届いていません。現場で働き続けられる人数は、届く食料の量でほぼ決まります。`);
  if (t.survivors < 0.8) advice.push(`職人の${pct(1 - t.survivors, 0)}が倒れて現場を離れました。人が減ると工事が遅れ、遅れがさらに無理と手抜きを呼びます。`);
  if (t.collapsed > 0) advice.push(`${runs}回のうち${t.collapsed}回で、引き渡した後に崩れました。納期を数だけ合わせて守った結果、やり直しの費用が発注者に返ってきます。`);
  if (t.complete === 0 && t.progress < 1) advice.push(`工期内に引き渡せませんでした(進み具合 ${pct(t.progress, 0)})。`);
  if (rules.open) advice.push("横流しだけの段階が消え、実作業を担う業者だけが残っています。取り分は残りますが、支援によって現場の作業は速くなります。");
  if (!rules.open && rules.layers > 0) advice.push("価値を加えずに手数料だけを取る段階があるかを、元の予算と各段階の取り分を公開して確かめてください(条件Dで効果を試せます)。");
  chainOut(`<div class="analysis">
      <h2>${esc(label.slice(2))}を${runs}回検証</h2>
      <p class="a-sub">${num(config.n)}人の現場、${rules.open ? "透明化後" : `${rules.layers}段階で${pct(rules.rate, 0)}ずつ`}、工期${days}日</p>
      <div class="a-cards">
        ${aCard("現場に届く予算", pct(t.delivered, 0), "発注者の予算に対して")}
        ${aCard(`${days}日目に働いている人`, pct(t.survivors, 0), `${num(config.n * t.survivors)}人`)}
        ${aCard("工事の進み具合", pct(t.progress, 0), t.doneDay ? `平均${num(t.doneDay, 0)}日で完成` : "工期内に完成せず")}
        ${aCard("できあがりの強度", pct(t.strength, 0), "正規の材料で完成 = 100%")}
        ${aCard("引き渡し後に崩れた回数", `${t.collapsed}`, `/ ${runs}回`)}
      </div><p class="a-headline">${esc(advice[0] ?? "予算がそのまま現場に届き、工期どおりに正規の強度で完成しました。")}</p>
      <p class="a-note">数字は${runs}回の試行の平均です。</p></div>
    <div class="card"><div class="form-row" id="c-copy"></div>${advice.length > 1 ? `<h3>ほかに読み取れること</h3><div class="advice"><ul>${advice.slice(1).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      <div class="grid2" style="margin:0"><div><h3>予算のリレー</h3>${relayTable(config.n, rules)}</div>
      <div><h3>現場の推移</h3>${multiLine([{ name: "働いている人", color: "#4a7fb5", points: S.map((s, i) => ({ x: i + 1, y: s.alive })) }, { name: "進み具合", color: "#2f8f6b", points: S.map((s, i) => ({ x: i + 1, y: s.progress })) }, { name: "強度", color: "#b4473b", points: S.map((s, i) => ({ x: i + 1, y: s.strength })) }, { name: "手抜きをした人", color: "#c9a45c", points: S.map((s, i) => ({ x: i + 1, y: s.cut })) }], { xLabel: "日" })}</div></div>
      <h3>職人1人ずつの様子(代表例:${runs}回のうちの1回)</h3>
      <div class="o-play"><button id="o-playbtn">再生</button><input id="o-year" type="range" min="0" max="${days - 1}" value="0"><b id="o-year-label"></b></div>
      <div id="o-people" class="o-grid"></div>
      <p class="note">■ 青=働いている人 ■ 灰=倒れて現場を離れた人(最大1,000人まで表示)。</p></div>`);
  playGrid(days - 1, (d) => { const h = one.history[d]; return { label: `${h.day}日目 働いている人 ${pct(h.alive, 0)}・進み具合 ${pct(h.progress, 0)}`, cells: h.cells.slice(0, 1000).map((c) => (c === "ok" ? "#4a7fb5" : "#56423e")) }; });
  attachCopy("c-copy", "c-out");
}
function chainCompare() {
  const { config, runs, days } = chainConfig();
  const rows = Object.values(CHAIN_PRESETS).map((p) => ({ label: p.label, t: trialChain(config, p.rules, days, runs) }));
  const colors = ["#2f8f6b", "#c9a45c", "#b4473b", "#4a7fb5"];
  chainOut(`<div class="analysis">
      <h2>4つの条件を${runs}回ずつ検証</h2>
      <p class="a-sub">${num(config.n)}人の現場、工期${days}日。それぞれの条件の標準の設定で比べています</p>
      <div class="table-scroll"><table><tr><th>条件</th><th class="num">現場に届く予算</th><th class="num">働いている人</th><th class="num">進み具合</th><th class="num">強度</th><th class="num">崩れた回数</th></tr>
      ${rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${pct(r.t.delivered, 0)}</td><td class="num">${pct(r.t.survivors, 0)}</td><td class="num">${pct(r.t.progress, 0)}</td><td class="num">${pct(r.t.strength, 0)}</td><td class="num">${r.t.collapsed} / ${runs}回</td></tr>`).join("")}</table></div>
      <p class="a-note">強度は、正規の材料で工期どおりに完成した場合を100%とした値です。進み具合が80%以上なら、見かけ上は完成として引き渡される想定です。</p></div>
    <div class="card"><h3>働いている人の推移</h3>${multiLine(rows.map((r, i) => ({ name: r.label.slice(0, 1), color: colors[i], points: r.t.series.map((s, d) => ({ x: d + 1, y: s.alive })) })), { xLabel: "日" })}
      <h3>強度の推移</h3>${multiLine(rows.map((r, i) => ({ name: r.label.slice(0, 1), color: colors[i], points: r.t.series.map((s, d) => ({ x: d + 1, y: s.strength })) })), { xLabel: "日" })}</div>`);
}
function chainSweep() {
  const { config, runs, days, rules } = chainConfig();
  const sw = sweepLayers(config, { ...rules, open: false }, [0, 1, 2, 3, 4, 5], days, runs);
  const on = (s) => s.value === rules.layers;
  const rows = (f) => sw.map((s) => ({ label: `${s.value}段`, value: f(s), on: on(s) }));
  const cur = sw.find(on) ?? sw[3], R = CHAIN_REFERENCE;
  // 参考にした実験と同じ条件(100人・30日・30%・手抜きあり)のときだけ、数字を並べて見せる
  const same = config.n === 100 && days === 30 && Math.abs(rules.rate - 0.3) < 1e-9 && rules.shortcut;
  const refTable = same ? `<h3>参考にした実験の値との比較</h3><div class="table-scroll"><table><tr><th>段数</th>${sw.map((s) => `<th class="num">${s.value}段</th>`).join("")}</tr>
      <tr><td>働いている人:このモデル</td>${sw.map((s) => `<td class="num">${num(s.survivors * 100)}人</td>`).join("")}</tr><tr><td>働いている人:参考値</td>${R.survivors.map((v) => `<td class="num">${v}人</td>`).join("")}</tr>
      <tr><td>強度:このモデル</td>${sw.map((s) => `<td class="num">${pct(s.strength, 0)}</td>`).join("")}</tr><tr><td>強度:参考値</td>${R.strength.map((v) => `<td class="num">${v}%</td>`).join("")}</tr>
      <tr><td>崩れた回数:このモデル</td>${sw.map((s) => `<td class="num">${num((s.collapsed / runs) * 100)}回</td>`).join("")}</tr><tr><td>崩れた回数:参考値</td>${R.collapsed.map((v) => `<td class="num">${v}回</td>`).join("")}</tr></table></div>
      <p class="note">崩れた回数は100回あたりに直した値です。係数は、この参考値に近づくよう調整しています。</p>` : `<p class="note">人数100人・工期30日・1段階30%・手抜きあり(条件C)にすると、参考にした実験の値と並べて比べられます。</p>`;
  // 実際の現場の下請け次数の分布(国土交通省「重層下請構造実態調査」2025年度。建設専門紙の報道経由で確認、確かさ:中)
  const TIERS = { 土木: [26.9, 43.1, 24.4, 4.9, 0.8], 建築: [10.2, 25.4, 33.3, 21.5, 9.7] };
  const weighted = (dist, f) => dist.reduce((a, w, i) => a + (w / 100) * f(sw[i + 1]), 0);
  const tierTable = `<h3>実際の現場の次数の分布で平均すると</h3><div class="table-scroll"><table><tr><th>工事の種類</th><th class="num">1次</th><th class="num">2次</th><th class="num">3次</th><th class="num">4次</th><th class="num">5次以上</th><th class="num">働いている人</th><th class="num">強度</th><th class="num">崩れる割合</th></tr>${
    Object.entries(TIERS).map(([k, d]) => `<tr><td>${k}</td>${d.map((x) => `<td class="num">${x}%</td>`).join("")}<td class="num">${pct(weighted(d, (s) => s.survivors), 0)}</td><td class="num">${pct(weighted(d, (s) => s.strength), 0)}</td><td class="num">${pct(weighted(d, (s) => s.collapsed / runs), 0)}</td></tr>`).join("")}</table></div>
    <p class="note">次数の分布は実際の調査の値です(国土交通省「重層下請構造実態調査」2025年度、土木1,026件・建築433件。専門紙の報道経由で確認)。<br>ここでは「n次の業者が作業する現場 = 中抜きn段」と置いています。1段階で抜かれる割合(${pct(rules.rate, 0)})は入力した値で、実際の割合を示す公的な統計は見つかっていません。右の3列は、その前提での試算です。</p>`;
  chainOut(`<div class="card">
      <h2>中抜きの段数を変えて 各${runs}回</h2>
      <p class="note">職人${num(config.n)}人・予算${num(config.n)}個/日・1段階で${pct(rules.rate, 0)}・工期${days}日${rules.shortcut ? "・手抜きあり" : "・手抜きなし"}。濃い棒は、いま選んでいる段数です。</p>
      <div class="tri">
        <div><h3>働いている人 <small>単位:%</small></h3>${vbar(rows((s) => Math.round(s.survivors * 100)), { color: "var(--male)", max: 100 })}</div>
        <div><h3>できあがりの強度 <small>単位:%</small></h3>${vbar(rows((s) => Math.round(s.strength * 100)), { color: "var(--good)", max: Math.max(100, ...sw.map((s) => s.strength * 100)) })}</div>
        <div><h3>${runs}回中 崩れた回数 <small>単位:回</small></h3>${vbar(rows((s) => s.collapsed), { color: "var(--accent)", max: runs })}</div>
      </div>
      <div class="kpis">
        ${kpi(`${cur.value}段で現場に届く予算`, pct(cur.delivered, 0))}
        ${kpi(`${cur.value}段で働いている人`, pct(cur.survivors, 0))}
        ${kpi(`${cur.value}段の強度`, pct(cur.strength, 0))}
        ${kpi(`${cur.value}段で崩れた回数`, `${cur.collapsed}回`, `${runs}回中`)}
      </div>
      <p class="note">段数が増えるほど現場に届く予算が減り、働ける人が減ります。${rules.shortcut ? "人が減っても納期は変わらないため、泥ブロックで数を合わせるようになり、強度が下がって崩れやすくなります。" : "手抜きをしない場合は崩れませんが、工期内に完成しません。"}</p>
      ${tierTable}${refTable}</div>`);
}

// ---------- ⑦ 3Dビジュアル ----------
// 「3Dで見る」の画面で、どの内容でもその場で選んで検証できるようにする
const HUB = () => [
  { key: "product", label: "商品を試す(お題と市場規模の条件)" },
  { key: "org", initial: "fixedPush", label: "職場のルール", presets: PRESETS, play: org3d, param: { key: "push", label: "早い人に回す割合(%)", scale: 100, min: 0, max: 100, step: 10 } },
  { key: "tax", initial: "heavy", label: "税率と助け合い", presets: SOCIETY_PRESETS, play: soc3d, param: { key: "tax", label: "税率(%)", scale: 100, min: 0, max: 90, step: 10 } },
  { key: "chain", initial: "shortcut", label: "多重下請け", presets: CHAIN_PRESETS, play: chain3d, param: { key: "layers", label: "中抜きの段階数", scale: 1, min: 0, max: 6, step: 1 } },
  ...[...LABS, ...THEORY_LABS, ...EXPERIMENT_LABS, future].filter((def) => def.frames).map((def) => ({ key: def.key, label: def.title, presets: def.presets, def, param: def.params?.[0] && { ...def.params[0], scale: def.params[0].scale ?? 1 } })),
];
function buildHub() {
  const hub = HUB();
  $("v-hub").innerHTML = hub.map((h) => `<option value="${h.key}">${esc(h.label)}</option>`).join("");
  const current = () => hub.find((h) => h.key === $("v-hub").value);
  const fillPresets = () => {
    const h = current(), on = h.key !== "product";
    $("v-product").hidden = on; $("v-hub-stage").hidden = !on; $("v-hub-preset-wrap").hidden = !on; $("v-hub-again").hidden = !on;
    if (on) $("v-hub-preset").innerHTML = Object.entries(h.presets).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("");
    if (on && (h.initial ?? h.def?.initial)) $("v-hub-preset").value = h.initial ?? h.def.initial;
    fillParam();
  };
  const fillParam = () => {
    const h = current(), p = h.param, v = p && h.presets[$("v-hub-preset").value].rules[p.key];
    $("v-hub-param-wrap").hidden = !p || h.key === "product";
    $("v-hub-n-wrap").hidden = !h.play; // 人数を変えられるのは、職場・税率・下請けの3つ
    $("v-hub-n").value = $("o-n").value;
    if (p) { $("v-hub-param-label").textContent = p.label; Object.assign($("v-hub-param"), { min: p.min, max: p.max, step: p.step ?? 1, value: Math.round((v ?? 0) * p.scale) }); }
  };
  const play = () => {
    const h = current();
    if (h.key === "product") { state.hubOn = false; $("v-hub-summary").innerHTML = ""; openVisual(); $("v-hub-next").innerHTML = `条件を変えるには <a href="#sim">お題と市場規模</a> へ。`; return; }
    state.hubOn = true; state.visual?.run(false);
    const preset = h.presets[$("v-hub-preset").value], rules = { ...preset.rules };
    let changed = "";
    if (h.param) {
      const v = Math.min(h.param.max, Math.max(h.param.min, Number($("v-hub-param").value) || 0));
      // 条件の標準の値から変えたときは、題名にもそれを書く
      if (Math.round((preset.rules[h.param.key] ?? 0) * h.param.scale) !== v) changed = `(${h.param.label.replace(/\(.*?\)/, "")}を${v}に変更)`;
      rules[h.param.key] = v / h.param.scale;
    }
    const label = preset.label + changed, container = $("v-hub-stage");
    setMsg("v-hub-msg", "計算中です…");
    setTimeout(() => {
      try {
        if (h.play) h.play({ container, rules, label });
        else {
          const stage = showStage(container, false); if (!stage) return;
          const scene = h.def.frames(rules, Number($("seed").value) || 1, preset.years ?? h.def.years), title = label.replace(/^[A-Z] /, "");
          if (scene.terrain) stage.setTerrain({ ...scene.terrain, title }); else stage.setFrames(scene.frames, { ...scene.opts, title });
        }
        setMsg("v-hub-msg", "");
        hubSummary(h, rules, preset, label);
      } catch (err) { setMsg("v-hub-msg", err.message, true); }
    }, 30);
    $("v-hub-next").innerHTML = `上の3Dは、このうちの1回分です。100回の平均や条件どうしの比較は <a href="#${h.key}">${esc(h.label)}</a> へ。`;
  };
  $("v-hub").onchange = () => { fillPresets(); play(); };
  $("v-hub-preset").onchange = () => { fillParam(); play(); };
  $("v-hub-param").onchange = play;
  $("v-hub-n").onchange = () => { $("o-n").value = $("v-hub-n").value; play(); };
  $("v-hub-again").onclick = play;
  state.hubPlay = play;
  fillPresets();
}

// 3Dの下に、同じ条件を20回試した平均と、読み取れることを出す
function hubSummary(h, rules, preset, label) {
  const RUNS = 20, seed = Number($("seed").value) || 1;
  let cards = [], advice = [];
  if (h.def) {
    const t = trial(h.def, rules, RUNS, seed, preset.years ?? h.def.years);
    cards = h.def.metrics.map((m) => [m.label, formatMetric(m, t.summary[m.key]), m.sub ?? ""]);
    advice = h.def.advise?.(t.summary, rules) ?? [];
  } else if (h.key === "org") {
    const { config, years } = orgConfig(), t = trialOrg(config, rules, years, RUNS);
    cards = [[`${years}年後の生産力`, pct(t.productivity, 0), "最初を100%として"], ["エースの割合", pct(t.ace), `最初は${pct(config.mix.ace, 0)}`], ["エースが全滅した回数", `${t.wiped}回`, `${RUNS}回中`], ["平均の労働時間", `${num(t.hours, 1)}時間`, "1日あたり"]];
    advice = orgAdvice(t, rules, { ace: config.mix.ace, n: config.n });
  } else if (h.key === "tax") {
    const { config, years } = socConfig(), t = trialSociety(config, rules, years, RUNS), L = t.last;
    cards = [[`${years}年後の生産力`, pct(L.productivity, 0), "全員が広場で働く場合を100%"], ["森に挑戦する人", pct(L.risky, 0), `自分の畑だけ ${pct(L.home, 0)}`], ["1人あたりの税収", `${num(L.revenue, 2)}個`, `うち管理に${num(L.admin, 2)}個`], ["人口", pct(L.population, 0), "最初を100%として"]];
    advice = socAdvice(L, t.series[0], rules);
  } else {
    const { config, days } = chainConfig(), t = trialChain(config, rules, days, RUNS);
    cards = [["現場に届く予算", pct(t.delivered, 0), "発注者の予算に対して"], [`${days}日目に働いている人`, pct(t.survivors, 0), ""], ["できあがりの強度", pct(t.strength, 0), "正規の材料で完成 = 100%"], ["引き渡し後に崩れた回数", `${t.collapsed}回`, `${RUNS}回中`]];
    if (t.collapsed > 0) advice.push(`${RUNS}回のうち${t.collapsed}回で、引き渡した後に崩れました。`);
    if (t.delivered < 0.7) advice.push(`予算の${pct(1 - t.delivered, 0)}が途中で抜かれています。現場で働き続けられる人数は、届く予算でほぼ決まります。`);
    if (rules.open) advice.push("横流しだけの段階が消え、実作業を担う業者だけが残っています。");
  }
  $("v-hub-summary").innerHTML = `<h3>${esc(label.replace(/^[A-Z] /, ""))}を${RUNS}回試した平均</h3>
    <div class="kpis">${cards.map(([l, v, sub]) => kpi(l, v, sub)).join("")}</div>
    ${advice.length ? `<div class="advice"><ul>${advice.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}<div class="form-row" id="v-hub-copy"></div>`;
  $("v-hub-copy").appendChild(copyButton([`${h.label}:${label.replace(/^[A-Z] /, "")}(${RUNS}回の平均)`, ...cards.map(([l, v]) => `・${l}:${v}`), ...advice.map((x) => `→ ${x}`), "※ 仮定にもとづく試算です。"].join("\n")));
}

function openVisual() {
  if (state.hubOn) return; // ほかの内容を表示中は、商品の3Dを動かさない
  if (!state.visual) {
    state.visual = createVisual($("visual"), { fmtYen, fmtPeople, pct, num, esc });
    if (!state.visual) return;
    gatherCrowd();
  } else if (state.visualKey !== visualKey()) gatherCrowd();
  state.visual.run(true);
}
// いまの入力内容(商品の条件・B案・人数)を1つの文字列にしたもの。変わっていたら集め直す
const visualKey = () => JSON.stringify([currentProduct(), state.vOpts, $("v-n").value, $("year").value]);
// 3Dの選択肢(1〜4個)。まだ触っていなければ、「お題と市場規模」の価格と回数を1つ目に入れる
const OPT_NAMES = ["A案", "B案", "C案", "D案"], OPT_COLORS = ["青", "赤", "緑", "黄"], OPT_KEYS = ["blue", "red", "green", "yellow"];
function visualOptions() {
  if (state.vOpts) return state.vOpts;
  const p = currentProduct(); return [{ price: p.price, perYear: p.perYear }]; // 3Dで書き換えるまでは、お題の値にそのまま従う
}
function renderOptions() {
  const o = visualOptions();
  $("v-opts").innerHTML = o.map((x, k) => `<div class="v-opt ${OPT_KEYS[k]}" data-opt="${k}">
      <b>${OPT_COLORS[k]}ゲート<small>${o.length === 1 ? "買う" : OPT_NAMES[k]}</small></b>
      <label>価格(円) <input class="o-price" type="number" min="0" value="${x.price}"></label>
      <label>年間の回数 <input class="o-per" type="number" min="0.1" step="0.1" value="${x.perYear}"></label>
      ${k > 0 ? `<button type="button" class="o-del" aria-label="${OPT_NAMES[k]}を削除">削除</button>` : `<span></span>`}</div>`).join("")
    + (o.length === 1 ? `<div class="v-opt red"><b>赤ゲート<small>買わない</small></b><span class="o-fixed">選択肢を追加すると、赤ゲートはB案になります。</span></div>` : "");
  $("v-opt-add").disabled = o.length >= 4;
}
function gatherCrowd() {
  if (!state.visual) return;
  state.visualKey = visualKey();
  const product = currentProduct();
  if (!$("v-opts").contains(document.activeElement)) renderOptions(); // 入力中は書き換えない
  const options = visualOptions().map((x, k) => ({ ...product, price: x.price, perYear: x.perYear, label: OPT_NAMES[k] }));
  const ok = prepareCrowd(state.visual, {
    personas: state.personas, options, n: Number($("v-n").value), seed: Number($("seed").value) || 1,
    fmt: { fmtYen, fmtPeople, pct, num, esc },
  });
  if (!ok) $("visual").insertAdjacentHTML("beforeend", `<div class="v-caption">対象条件に合うペルソナがいません。「お題と市場規模」の条件を見直してください。</div>`);
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
    : `<p class="note">価格と広告費を決めて「3か月進める」を押してください。原価率・固定費・解約率は「発売後の広がり」の設定を使います。</p>`;
  $("g-log").innerHTML = g.log.join("");
}

// ---------- 出典と仮定 ----------
// ---------- お題から探す・精度の成績表 ----------
function buildGuide() {
  const item = (c) => `<a class="found" href="#${c.tab}"><b>${esc(c.title)}</b><span>${esc(c.desc)}</span><em>${esc(BASIS_NOTE[c.basis])}</em></a>`;
  const show = () => { const q = $("finder-q").value, hits = findScreens(q); $("finder-out").innerHTML = !q.trim() ? "" : hits.length ? hits.map(item).join("") : `<p class="note">合う画面が見つかりませんでした。「離職」「価格」「待ち時間」のような短い言葉で試してください。</p>`; };
  $("finder-q").oninput = show;
  $("finder-chips").innerHTML = ["優秀な人が辞めていく", "新商品の価格を決めたい", "値引き交渉", "レジの待ち時間", "2050年の人手不足", "新しい制度が社内に広がらない", "外注の中抜き", "在庫の廃棄を減らしたい"].map((x) => `<button type="button" class="chip">${esc(x)}</button>`).join("");
  $("finder-chips").onclick = (e) => { if (e.target.classList.contains("chip")) { $("finder-q").value = e.target.textContent; show(); } };
  const order = ["公的統計", "公式推計", "理論", "実験", "文献値と仮定", "動画の実験値", "仮定"];
  $("score-basis").innerHTML = `<table><tr><th>数字の根拠</th><th>画面</th></tr>${order.map((b) => `<tr><td>${esc(BASIS_NOTE[b])}</td><td>${CATALOG.filter((c) => c.basis === b).map((c) => `<a href="#${c.tab}">${esc(c.title)}</a>`).join("、")}</td></tr>`).join("")}</table>`;
  $("score-run").onclick = () => {
    $("score-msg").textContent = "計算しています…";
    setTimeout(() => {
      try {
        const rows = scoreboard(state.D, state.base, [{ basis: "動画の実験値", defs: LABS }, { basis: "理論", defs: THEORY_LABS }, { basis: "実験", defs: EXPERIMENT_LABS }, { basis: "公式推計", defs: [future] }], Number($("seed").value) || 1);
        rows.push(...customChecks(state.base, Number($("seed").value) || 1));
        const ok = (r) => (r.inRange != null ? r.inRange : Math.abs(r.diff) <= 0.05 || (r.points != null && Math.abs(r.points) <= (r.tol ?? 0.5))), order2 = ["公的統計", "公式推計", "理論", "実験", "調査", "動画の実験値"];
        const cell = (r) => (r.inRange != null ? (r.inRange ? "範囲内" : "範囲外") : `${r.diff >= 0 ? "+" : ""}${(r.diff * 100).toFixed(1)}%`);
        const med = (list) => { const v = list.filter((r) => r.diff != null).map((r) => Math.abs(r.diff)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };
        $("score-out").innerHTML = `<div class="analysis"><h2>${rows.length}項目を照合しました</h2>
          <div class="a-cards">${order2.map((b) => { const list = rows.filter((r) => r.basis === b); return aCard(BASIS_NOTE[b].replace(/\(.*/, ""), `${list.filter(ok).length} / ${list.length}`, `ずれ5%以内の項目。中央のずれ ${(med(list) * 100).toFixed(1)}%`); }).join("")}</div>
          <p class="a-headline">ずれが5%以内の項目は、${rows.length}項目のうち${rows.filter(ok).length}項目です。</p>
          <p class="a-note">割合(%)の項目は、差が0.5ポイント以内なら「5%以内」と同じ扱いにしています(0.3%と0.4%のような小さな数どうしの比較のため)。赤字は、それを超えた項目です。</p>
          <p class="a-note">「実際の調査と照合」のうち【検算用】の項目は、係数を決めたあとで取得した調査です。係数の見直しには一度も使っていないので、モデルの実力がそのまま出ます。</p>
          <p class="a-note">「動画の実験値」は、参考にした実験動画の数字に合わせて係数を調整したもので、現実との照合ではありません。</p></div>
          ${order2.map((b) => { const list = rows.filter((r) => r.basis === b).sort((x, y) => Math.abs(y.diff ?? 0) - Math.abs(x.diff ?? 0)); return `<div class="card"><h2>${esc(BASIS_NOTE[b])}(${list.length}項目)</h2><div class="table-scroll"><table class="verify"><tr><th>モデル・条件</th><th>項目</th><th class="num">この計算</th><th class="num">基準</th><th class="num">ずれ</th></tr>${
            list.map((r) => `<tr><td>${esc(r.model)}</td><td>${r.holdout ? "<b>【検算用】</b>" : ""}${esc(r.label)}${r.source ? `<small>${esc(r.source)}</small>` : ""}</td><td class="num">${r.a ?? ""}</td><td class="num">${esc(r.b ?? "")}</td><td class="num ${ok(r) ? "" : "bad"}">${cell(r)}</td></tr>`).join("")}</table></div></div>`; }).join("")}`;
        $("score-msg").textContent = "";
      } catch (e) { $("score-msg").textContent = `計算できませんでした:${e.message}`; }
    }, 30);
  };
}

function renderSources() {
  $("sources").innerHTML = `<table><tr><th>データ</th><th>年次</th><th>出典</th><th>確かさ</th></tr>${
    state.D.sources.map((s) => `<tr><td>${esc(s.use)}</td><td>${esc(s.year)}</td><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</td><td>${esc(s.quality)}</td></tr>`).join("")
  }</table>`;
  $("literature").innerHTML = `<table><tr><th>モデル</th><th>文献</th><th>文献から確認できた値</th></tr>${LITERATURE.map((m) => `<tr><td>${esc(m.name)}</td><td>${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.citation)}</a>` : esc(m.citation)}</td><td>${m.benchmarks.length ? `<ul class="facts">${m.benchmarks.map((b) => `<li>${esc(b.what)}(確かさ:${b.c})</li>`).join("")}</ul>` : "―"}${m.missing ? `<small>確認できなかった項目:${m.missing}件</small>` : ""}</td></tr>`).join("")}</table>`;
  $("sources").insertAdjacentHTML("beforeend", `<table><tr><th>将来人口の計算に使うデータ</th></tr>${COHORT.sources.map((x) => `<tr><td><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a></td></tr>`).join("")}</table>`);
  const rows = [];
  const add = (group, obj) => Object.values(obj).forEach((a) => rows.push(`<tr><td>${group}</td><td>${esc(a.note)}</td><td>${esc(typeof a.value === "object" ? JSON.stringify(a.value) : String(a.value))}</td></tr>`));
  add("ペルソナ生成", ASSUMPTIONS);
  add("オリジナルの実験", CUSTOM_ASSUMPTIONS);
  add("市場規模", MARKET_ASSUMPTIONS);
  add("普及シミュレーション", DIFFUSION_ASSUMPTIONS);
  add("組織シミュレーター", ORG_ASSUMPTIONS);
  add("税率と助け合い", SOCIETY_ASSUMPTIONS);
  add("多重下請け", CHAIN_ASSUMPTIONS);
  for (const def of [...LABS, ...THEORY_LABS, ...EXPERIMENT_LABS, future]) add(def.title, def.assumptions);
  (state.D.dataAssumptions ?? []).forEach((a) => rows.push(`<tr><td>データの補い方</td><td>${esc(a.note)}</td><td>${esc(a.value)}</td></tr>`));
  $("assumptions").innerHTML = `<table><tr><th>区分</th><th>内容</th><th>値</th></tr>${rows.join("")}</table>`;
  $("limits").innerHTML = state.D.limits.map((l) => `<li>${esc(l)}</li>`).join("");
}

init();
