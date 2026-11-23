// 画面の制御
import { CATEGORIES, CATEGORY_LABEL, AGE_BANDS, ageBandOf } from "./constants.js";
import { generatePersonas, assignAdopterTypes, describePersona, validate, ADOPTER_TYPES, ASSUMPTIONS } from "./personas.js";
import {
  marketSize, totalSpendingCheck, stratifiedSample, personaForLLM, aggregateReactions,
  reweightForYear, inTarget, MARKET_ASSUMPTIONS,
} from "./market.js";
import { createSim, runMany, DIFFUSION_ASSUMPTIONS } from "./diffusion.js";
import { hbar, pyramid, line, combo, multiLine, esc } from "./charts.js";
import { MODES, PRESETS, ORG_ASSUMPTIONS, runOrg, trialOrg, sweepOrg } from "./org.js";
import { SOCIETY_PRESETS, SOCIETY_ASSUMPTIONS, runSociety, trialSociety, sweepTax } from "./society.js";
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
  $("print-report").hidden = !state.server; // 公開ページの中では印刷を呼び出せないため、サーバーで動かしているときだけ出す
  setPurpose("planning");

  regenerate();
  renderMarket();
  renderSources();
  buildNav();
}

// ---------- 画面の切り替え(大きな区分 → 画面) ----------
const NAV = [
  { key: "home", label: "はじめに", tabs: [["home", "はじめに"]] },
  { key: "japan", label: "仮想の日本", tabs: [["people", "人口とペルソナ"], ["market", "市場の規模感"]] },
  { key: "market", label: "市場を試す", tabs: [["sim", "お題と市場規模"], ["spread", "発売後の広がり"], ["visual", "3Dで見る"], ["game", "経営ゲーム"], ["report", "レポート"]] },
  { key: "rules", label: "制度を試す", tabs: [["org", "職場のルール"], ["tax", "税率と助け合い"]] },
  { key: "source", label: "出典と仮定", tabs: [["source", "出典と仮定"]] },
];
function buildNav() {
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
  if (tab === "visual") openVisual(); else state.visual?.run(false);
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
    config: { n: clampInt(v("o-n"), 20, 5000), ages, mix: { ace, std: 1 - ace - low, low }, seed: Number($("seed").value) || 1 },
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
  $("t-out").innerHTML = ""; $("o-out").innerHTML = `<div class="analysis">
      <h2>${esc(presetLabel)}を${runs}回検証</h2>
      <p class="a-sub">${num(config.n)}人の職場で、早い人に回す割合 ${pct(rules.push, 0)}、${years}年後までを計算</p>
      <div class="a-cards">
        ${aCard(`${years}年後の生産力`, pct(t.productivity, 0), "最初を100%として")}
        ${aCard("エースの割合", pct(t.ace), `最初は${pct(config.mix.ace, 0)}`)}
        ${aCard("エースが全滅した回数", `${t.wiped}`, `/ ${runs}回`)}
        ${aCard("平均の労働時間", `${num(t.hours, 1)}時間`, "1日あたり")}
        ${aCard("過労による離脱", `${num(t.burnout)}人`, "期間中の延べ人数")}
      </div>
      <p class="a-note">数字は${runs}回の試行の平均です。</p></div>
    <div class="card"><h3>診断</h3><div class="advice"><ul>${(advice.length ? advice : ["このルールでは、働き方と生産力に大きな変化は出ませんでした。"]).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
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
}

function orgCompare() {
  const { config, years, runs } = orgConfig();
  const rows = Object.values(PRESETS).map((p) => ({ label: p.label, t: trialOrg(config, p.rules, years, runs), push: p.rules.push }));
  const best = rows.reduce((a, b) => (b.t.productivity > a.t.productivity ? b : a));
  const calm = rows.reduce((a, b) => (b.t.hours < a.t.hours ? b : a));
  $("t-out").innerHTML = ""; $("o-out").innerHTML = `<div class="analysis">
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
  $("t-out").innerHTML = ""; $("o-out").innerHTML = `<div class="analysis">
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
  $("o-out").innerHTML = ""; $("t-out").innerHTML = `<div class="analysis">
      <h2>${esc(label.slice(2))}を${runs}回検証</h2>
      <p class="a-sub">${num(config.n)}人の村、税率 ${pct(rules.tax, 0)}${rules.rebuildAt != null ? `(${rules.rebuildAt}年目に立て直し策を実施)` : ""}、${years}年後までを計算</p>
      <div class="a-cards">
        ${aCard(`${years}年後の生産力`, pct(L.productivity, 0), "全員が広場で働く場合を100%として")}
        ${aCard("森に挑戦する人", pct(L.risky, 0), `自分の畑だけの人は${pct(L.home, 0)}`)}
        ${aCard("1人あたりの税収", `${num(L.revenue, 2)}個`, `うち管理に${num(L.admin, 2)}個`)}
        ${aCard("人口", pct(L.population, 0), "最初を100%として")}
        ${aCard("助け合いの支払い", pct(L.trust, 0), "必要な額に対して")}
      </div><p class="a-note">数字は${runs}回の試行の平均です。食料の単位は「個」です。</p></div>
    <div class="card"><h3>診断</h3><div class="advice"><ul>${(advice.length ? advice : ["このルールでは、大きな問題は出ませんでした。"]).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="grid2" style="margin:0"><div><h3>働き方の割合</h3>${multiLine(["risky", "safe", "home"].map((m) => ({ name: CHOICE[m].label.split("(")[0], color: CHOICE[m].color, points: S.map((s, x) => ({ x, y: s[m] })) })), { xLabel: "年" })}</div>
      <div><h3>生産力と人口</h3>${multiLine([{ name: "生産力", color: "#1a8f5a", points: S.map((s, x) => ({ x, y: s.productivity })) }, { name: "人口", color: "#8b93a7", points: S.map((s, x) => ({ x, y: s.population })) }], { xLabel: "年" })}</div></div>
      <h3>1人ずつの選択(代表例:${runs}回のうちの1回)</h3>
      <div class="o-play"><button id="o-playbtn">再生</button><input id="o-year" type="range" min="0" max="${years}" value="0"><b id="o-year-label"></b></div>
      <div id="o-people" class="o-grid"></div>
      <p class="note">■ 緑=森 ■ 水色=広場 ■ 黄=自分の畑だけ ■ 灰=隣の村へ移った人(最大1,000人まで表示)。</p></div>`;
  playGrid(years, (y) => { const h = one.history[y]; return { label: `${y}年目 森 ${pct(h.risky, 0)}・生産力 ${pct(h.productivity, 0)}`, cells: h.choices.slice(0, 1000).map((c) => CHOICE[c].color) }; });
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
  $("o-out").innerHTML = ""; $("t-out").innerHTML = `<div class="analysis">
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
  $("o-out").innerHTML = ""; $("t-out").innerHTML = `<div class="analysis">
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
function renderSources() {
  $("sources").innerHTML = `<table><tr><th>データ</th><th>年次</th><th>出典</th><th>確かさ</th></tr>${
    state.D.sources.map((s) => `<tr><td>${esc(s.use)}</td><td>${esc(s.year)}</td><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</td><td>${esc(s.quality)}</td></tr>`).join("")
  }</table>`;
  const rows = [];
  const add = (group, obj) => Object.values(obj).forEach((a) => rows.push(`<tr><td>${group}</td><td>${esc(a.note)}</td><td>${esc(typeof a.value === "object" ? JSON.stringify(a.value) : String(a.value))}</td></tr>`));
  add("ペルソナ生成", ASSUMPTIONS);
  add("市場規模", MARKET_ASSUMPTIONS);
  add("普及シミュレーション", DIFFUSION_ASSUMPTIONS);
  add("組織シミュレーター", ORG_ASSUMPTIONS);
  add("税率と助け合い", SOCIETY_ASSUMPTIONS);
  (state.D.dataAssumptions ?? []).forEach((a) => rows.push(`<tr><td>データの補い方</td><td>${esc(a.note)}</td><td>${esc(a.value)}</td></tr>`));
  $("assumptions").innerHTML = `<table><tr><th>区分</th><th>内容</th><th>値</th></tr>${rows.join("")}</table>`;
  $("limits").innerHTML = state.D.limits.map((l) => `<li>${esc(l)}</li>`).join("");
}

init();
