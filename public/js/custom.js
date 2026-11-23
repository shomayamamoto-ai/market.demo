// オリジナルの実験:お題と選択肢を自分で決めて、仮想の日本の1人ずつがどれを選ぶかを試す。
// 結果はあらかじめ決まっていない。1人ずつの家計・年齢・価値観と、周りの人の選択の積み重ねで決まる。
import { makeRng, clamp } from "./rng.js";
import { AGE_BANDS, ageBandOf } from "./constants.js";
import { stratifiedSample } from "./market.js";
import { multiLine, esc } from "./charts.js";
import { showStage, thin } from "./stage3d.js";
import { copyButton } from "./lab.js";

export const CUSTOM_ASSUMPTIONS = {
  money: { value: 3.5, note: "お金の得・損の効き方。この係数 × log(1 + 8 × 金額 ÷ その人の月のお金)×(0.6〜1.4:価格に敏感な人ほど大きい)。金額が大きくなるほど、1円あたりの効き方は小さくなる。月15万円で暮らす人にとって、月5,000円がおよそ「0.8」の重み" },
  base: { value: "支出と手取りの大きいほう", note: "「その人の月のお金」は、月の支出と、年収の8割を12で割った額の、大きいほうを使う" },
  effort: { value: 0.18, note: "手間1点あたりの重み。働いている人は1.3倍、65歳以上は1.2倍(時間や体力に余裕が少ないため)" },
  risk: { value: 0.18, note: "不安1点あたりの重み。年齢が高い人、収入が低い層ほど大きい(0.6+年齢÷100、下位4割は+0.3)" },
  novelty: { value: 0.6, note: "新しさ1点あたりの重み ×(その人の新しもの好き度 − 0.5)。新しいものが苦手な人にはマイナスに働く" },
  quality: { value: 0.6, note: "安心・品質1点あたりの重み ×(品質重視度 − 0.5)。これとは別に、全員に1点あたり0.08を足す" },
  social: { value: 0.3, note: "周りの影響。その選択肢を選んでいる人の割合 × 影響の強さ × その人の同調しやすさ × この係数" },
  inertia: { value: 0.18, note: "乗り換えの面倒さ1点あたり、いま選んでいるものに足す重み" },
  rethink: { value: 0.25, note: "毎月、選び直しを考える人の割合" },
  wordOfMouth: { value: 0.5, note: "知らない人が、選んでいる人の割合 × この係数の確率で、その月に口コミで知る" },
  noise: { value: "ガンベル分布", note: "数字にできない個人の事情。重みに加える乱数(ロジットモデルと同じ形)" },
  basis: { value: "仮定", note: "上の係数はすべて仮定で、現実のデータに合わせたものではない。人数の正確さではなく、「誰が動くか」「何を変えると結果が変わるか」を見るための道具" },
};

const opt = (name, money, effort, risk, novelty, quality) => ({ name, money, effort, risk, novelty, quality });
export const TEMPLATES = {
  blank: { label: "白紙から作る", title: "", target: { ageMin: 18, ageMax: 79, sex: "all", workOnly: false }, social: 5, inertia: 5, aware: 20, spread: 10, months: 24,
    options: [opt("今のまま", 0, 0, 0, 0, 5), opt("新しい案", 0, 3, 3, 5, 5)] },
  subscription: { label: "例:都度払いを月額制に変える", title: "月額制(サブスク)を始めたら、どれだけ移るか", target: { ageMin: 18, ageMax: 69, sex: "all", workOnly: false }, social: 4, inertia: 5, aware: 30, spread: 12, months: 24,
    options: [opt("今のまま(都度払い)", 0, 2, 0, 0, 5), opt("月額制・標準", 1500, 0, 3, 5, 5), opt("月額制・上位", -1500, 0, 3, 6, 8)] },
  fourday: { label: "例:週休3日制(給与1割減)を選べるようにする", title: "週休3日制を選べるようにしたら、誰が選ぶか", target: { ageMin: 20, ageMax: 64, sex: "all", workOnly: true }, social: 6, inertia: 6, aware: 80, spread: 20, months: 24,
    options: [opt("今のまま(週5日)", 0, 5, 0, 0, 5), opt("週休3日(給与1割減)", -30000, 1, 5, 6, 5), opt("週休3日(給与そのまま・1日10時間)", 0, 7, 3, 5, 5)] },
  remote: { label: "例:出社・在宅・自由選択", title: "働く場所を選べるようにしたら、どう分かれるか", target: { ageMin: 20, ageMax: 64, sex: "all", workOnly: true }, social: 7, inertia: 4, aware: 90, spread: 20, months: 18,
    options: [opt("毎日出社", 0, 6, 0, 0, 6), opt("週2日在宅", 5000, 4, 2, 4, 5), opt("原則在宅(手当なし)", 12000, 2, 5, 6, 4)] },
  cashless: { label: "例:現金のみの店がキャッシュレスを入れる", title: "キャッシュレス決済を入れたら、客はどう払うか", target: { ageMin: 15, ageMax: 89, sex: "all", workOnly: false }, social: 5, inertia: 6, aware: 50, spread: 15, months: 24,
    options: [opt("現金で払う", 0, 3, 0, 0, 7), opt("スマホ決済(1%還元)", 500, 1, 4, 6, 4), opt("カードで払う", 300, 2, 2, 2, 6)] },
  benefit: { label: "例:福利厚生を3つから選ぶ", title: "福利厚生を選択制にしたら、どれが選ばれるか", target: { ageMin: 20, ageMax: 64, sex: "all", workOnly: true }, social: 3, inertia: 2, aware: 100, spread: 30, months: 12,
    options: [opt("何も選ばない", 0, 0, 0, 0, 3), opt("家賃補助 月1万円", 10000, 2, 0, 1, 5), opt("学び直し支援 月1万円分", 6000, 5, 1, 7, 6), opt("健康支援 月1万円分", 5000, 3, 0, 3, 8)] },
};
const COLORS = ["#8b93a7", "#b4473b", "#2f8f6b", "#c9a45c"];

// 1人が、ある選択肢に感じる重み(周りの影響と乗り換えの面倒さを除く、その人固有の部分)
function baseUtility(p, o) {
  const A = CUSTOM_ASSUMPTIONS, t = p.traits;
  const monthly = Math.max(p.spendTotal, (p.income * 10000 * 0.8) / 12, 50000), ratio = Math.abs(o.money) / monthly;
  return Math.sign(o.money) * A.money.value * Math.log(1 + 8 * ratio) * (0.6 + 0.8 * t.price)
    - o.effort * A.effort.value * (p.working ? 1.3 : 1) * (p.age >= 65 ? 1.2 : 1)
    - o.risk * A.risk.value * (0.6 + p.age / 100 + (p.tier <= 1 ? 0.3 : 0))
    + o.novelty * A.novelty.value * (t.novelty - 0.5)
    + o.quality * (A.quality.value * (t.quality - 0.5) + 0.08);
}

// 1回分の実験。config: { target, n, months, social, inertia, aware, spread, options[] }。options[0] が「今のまま」
export function runCustom(personas, config, seed = 1, keep = false) {
  const A = CUSTOM_ASSUMPTIONS, rng = makeRng(seed), K = config.options.length;
  const pool = config.target.workOnly ? personas.filter((p) => p.working) : personas;
  const sample = stratifiedSample(pool, { ageMin: config.target.ageMin, ageMax: config.target.ageMax, sex: config.target.sex }, config.n ?? 1000, seed);
  if (!sample.length) return null;
  const gumbel = () => -Math.log(-Math.log(clamp(rng.next(), 1e-9, 1 - 1e-9)));
  const people = sample.map((p) => ({ p, base: config.options.map((o) => baseUtility(p, o)), taste: config.options.map(() => gumbel()), // その人だけの好み(期間中は変わらない)
    aware: config.options.map((_, k) => k === 0 || rng.next() < config.aware / 100), choice: 0 }));
  const W = people.reduce((a, x) => a + x.p.sampleWeight, 0);
  const shareOf = () => { const s = Array(K).fill(0); for (const x of people) s[x.choice] += x.p.sampleWeight / W; return s; };
  const series = [{ x: 0, shares: shareOf() }];
  for (let m = 1; m <= config.months; m++) {
    const share = series[m - 1].shares;
    for (const x of people) {
      for (let k = 1; k < K; k++) if (!x.aware[k] && rng.next() < config.spread / 100 + A.wordOfMouth.value * share[k] * (0.5 + x.p.traits.social)) x.aware[k] = true;
      if (rng.next() > A.rethink.value) continue;
      let best = x.choice, top = -Infinity;
      for (let k = 0; k < K; k++) {
        if (!x.aware[k]) continue;
        const u = x.base[k] + x.taste[k] + A.social.value * config.social * share[k] * x.p.traits.social + (k === x.choice ? A.inertia.value * config.inertia : 0) + gumbel() * 0.35;
        if (u > top) { top = u; best = k; }
      }
      x.choice = best;
    }
    series.push({ x: m, shares: shareOf() });
  }
  const final = series[config.months].shares;
  const group = (list) => { const w = list.reduce((a, x) => a + x.p.sampleWeight, 0), s = Array(K).fill(0); for (const x of list) s[x.choice] += x.p.sampleWeight / Math.max(w, 1e-9); return { n: list.length, shares: s }; };
  const byAge = AGE_BANDS.map((b) => ({ label: b.label, ...group(people.filter((x) => ageBandOf(x.p.age) === b.label)) })).filter((g) => g.n >= 15);
  const byTier = ["低い", "やや低い", "中くらい", "やや高い", "高い"].map((label, t) => ({ label, ...group(people.filter((x) => x.p.tier === t)) })).filter((g) => g.n >= 15);
  const bySex = [["male", "男性"], ["female", "女性"]].map(([k, label]) => ({ label, ...group(people.filter((x) => x.p.sex === k)) })).filter((g) => g.n >= 15);
  return { series, final, byAge, byTier, bySex, n: people.length, population: W, unaware: config.options.map((_, k) => people.filter((x) => !x.aware[k]).reduce((a, x) => a + x.p.sampleWeight, 0) / W), people: keep ? people : null };
}

// 同じ条件で何回も試し、平均と、ぶれの幅(最小〜最大)を出す
export function trialCustom(personas, config, runs = 10, seed = 1) {
  const K = config.options.length, outs = [];
  for (let r = 0; r < runs; r++) { const o = runCustom(personas, config, seed * 100 + r); if (!o) return null; outs.push(o); }
  const avg = (f) => outs.reduce((a, o) => a + f(o), 0) / outs.length;
  const mean = Array.from({ length: K }, (_, k) => avg((o) => o.final[k]));
  const merge = (key) => outs[0][key].map((g, i) => ({ label: g.label, n: g.n, shares: g.shares.map((_, k) => avg((o) => o[key][i]?.shares[k] ?? 0)) }));
  return { mean, lo: mean.map((_, k) => Math.min(...outs.map((o) => o.final[k]))), hi: mean.map((_, k) => Math.max(...outs.map((o) => o.final[k]))),
    series: outs[0].series.map((s, i) => ({ x: s.x, shares: s.shares.map((_, k) => avg((o) => o.series[i].shares[k])) })),
    byAge: merge("byAge"), byTier: merge("byTier"), bySex: merge("bySex"), n: outs[0].n, population: outs[0].population, unaware: outs[0].unaware.map((_, k) => avg((o) => o.unaware[k])), runs };
}

// 何を変えると結果が動くか:条件を1つずつ変えて、注目する選択肢の割合がどれだけ変わるかを比べる
export function sensitivity(personas, config, focus, runs = 4, seed = 1) {
  const base = trialCustom(personas, config, runs, seed).mean[focus], o = config.options[focus], out = [];
  const tryIt = (label, change) => { const c = JSON.parse(JSON.stringify(config)); change(c, c.options[focus]); out.push({ label, delta: trialCustom(personas, c, runs, seed).mean[focus] - base }); };
  const step = Math.max(1000, Math.round(Math.abs(o.money) * 0.3 / 500) * 500);
  tryIt(`お金の得を月${step.toLocaleString("ja-JP")}円ふやす`, (c, x) => { x.money += step; });
  if (o.effort > 0) tryIt(`手間を${Math.min(2, o.effort)}点へらす`, (c, x) => { x.effort = Math.max(0, x.effort - 2); });
  if (o.risk > 0) tryIt(`不安を${Math.min(2, o.risk)}点へらす`, (c, x) => { x.risk = Math.max(0, x.risk - 2); });
  tryIt("安心・品質を2点上げる", (c, x) => { x.quality = Math.min(10, x.quality + 2); });
  if (config.aware < 100) tryIt("最初に知っている人を20ポイントふやす", (c) => { c.aware = Math.min(100, c.aware + 20); });
  if (config.inertia > 0) tryIt("乗り換えの面倒さを2点へらす", (c) => { c.inertia = Math.max(0, c.inertia - 2); });
  tryIt("周りの影響を3点強める", (c) => { c.social = Math.min(10, c.social + 3); });
  return { base, rows: out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) };
}

// ---------- 画面 ----------
export function mountCustom({ getPersonas, seedOf, before }) {
  const el = document.createElement("section");
  el.id = "tab-custom"; el.className = "tab";
  el.innerHTML = `<div class="page-head"><h1>オリジナルの実験</h1><p>お題と選択肢を自分で決めて、仮想の日本の1人ずつがどれを選ぶかを試します。結果は、あらかじめ決まっていません。</p></div>
    <div class="card">
      <div class="form-grid"><label class="wide">お題 <input id="x-title" type="text" placeholder="例:週休3日制を選べるようにしたら、誰が選ぶか"></label>
        <label>ひな形から始める <select id="x-template">${Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join("")}</select></label></div>
      <h3>だれに聞くか</h3>
      <div class="form-grid"><label>年齢(下限) <input id="x-age-min" type="number" min="0" max="100"></label><label>年齢(上限) <input id="x-age-max" type="number" min="0" max="120"></label>
        <label>性別 <select id="x-sex"><option value="all">すべて</option><option value="male">男性</option><option value="female">女性</option></select></label>
        <label>働いている人だけ <select id="x-work"><option value="0">いいえ</option><option value="1">はい</option></select></label></div>
      <h3>選択肢(2〜4つ)</h3>
      <p class="note">1つ目は「今のまま」です。全員がここから始まります。点数は0〜10で、その選択肢を選んだ人にとっての大きさを入れてください。<br>「毎月のお金」は、その人の得ならプラス、負担ならマイナスの金額です。</p>
      <div id="x-opts"></div>
      <div class="form-row"><button id="x-add" type="button">選択肢を追加</button></div>
      <details><summary>広がり方の設定</summary><div class="form-grid">
        <label>周りの影響の強さ(0〜10) <input id="x-social" type="number" min="0" max="10"></label><label>乗り換えの面倒さ(0〜10) <input id="x-inertia" type="number" min="0" max="10"></label>
        <label>最初に知っている人(%) <input id="x-aware" type="number" min="0" max="100"></label><label>毎月、新しく知る人(%) <input id="x-spread" type="number" min="0" max="100"></label>
        <label>期間(月) <input id="x-months" type="number" min="1" max="120"></label><label>試行回数 <input id="x-runs" type="number" min="1" max="50" value="10"></label></div></details>
      <div class="form-row"><button id="x-run" class="primary">この条件で試す</button><button id="x-3d">3Dで見る</button></div>
      <p id="x-msg" class="msg"></p>
    </div>
    <div id="x-stage"></div><div id="x-out"></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  let options = [];
  const FIELDS = [["money", "毎月のお金(円)", -1e7, 1e7, 500], ["effort", "手間・負担", 0, 10, 1], ["risk", "不安・リスク", 0, 10, 1], ["novelty", "新しさ", 0, 10, 1], ["quality", "安心・品質", 0, 10, 1]];
  const renderOptions = () => {
    $("x-opts").innerHTML = options.map((o, k) => `<div class="x-opt" data-k="${k}" style="border-left-color:${COLORS[k]}">
        <label class="x-name">${k === 0 ? "今のまま" : `選択肢${k + 1}`} <input data-f="name" type="text" value="${esc(o.name)}"></label>
        ${FIELDS.map(([f, label, min, max, step]) => `<label>${label} <input data-f="${f}" type="number" min="${min}" max="${max}" step="${step}" value="${o[f]}"></label>`).join("")}
        ${k >= 2 ? `<button type="button" class="x-del">削除</button>` : ""}</div>`).join("");
    $("x-add").disabled = options.length >= 4;
  };
  const load = (key) => {
    const t = TEMPLATES[key];
    $("x-title").value = t.title; $("x-age-min").value = t.target.ageMin; $("x-age-max").value = t.target.ageMax; $("x-sex").value = t.target.sex; $("x-work").value = t.target.workOnly ? "1" : "0";
    $("x-social").value = t.social; $("x-inertia").value = t.inertia; $("x-aware").value = t.aware; $("x-spread").value = t.spread; $("x-months").value = t.months;
    options = t.options.map((o) => ({ ...o })); renderOptions(); $("x-out").innerHTML = ""; $("x-stage").innerHTML = "";
  };
  $("x-template").onchange = () => load($("x-template").value);
  $("x-opts").oninput = (e) => { const row = e.target.closest("[data-k]"), f = e.target.dataset.f; if (!row || !f) return; const o = options[Number(row.dataset.k)]; o[f] = f === "name" ? e.target.value : Number(e.target.value) || 0; };
  $("x-opts").onclick = (e) => { if (!e.target.classList.contains("x-del")) return; options.splice(Number(e.target.closest("[data-k]").dataset.k), 1); renderOptions(); };
  $("x-add").onclick = () => { if (options.length < 4) { options.push(opt(`案${options.length}`, 0, 3, 3, 5, 5)); renderOptions(); } };
  const num = (id, lo, hi, d) => clamp(Number($(id).value) || d, lo, hi);
  const read = () => ({
    title: $("x-title").value.trim() || "オリジナルの実験",
    target: { ageMin: num("x-age-min", 0, 120, 0), ageMax: num("x-age-max", 0, 120, 120), sex: $("x-sex").value, workOnly: $("x-work").value === "1" },
    social: clamp(Number($("x-social").value) || 0, 0, 10), inertia: clamp(Number($("x-inertia").value) || 0, 0, 10), aware: clamp(Number($("x-aware").value) || 0, 0, 100), spread: clamp(Number($("x-spread").value) || 0, 0, 100),
    months: Math.round(num("x-months", 1, 120, 24)), n: 1000,
    options: options.map((o, k) => ({ ...o, name: o.name.trim() || (k === 0 ? "今のまま" : `選択肢${k + 1}`), effort: clamp(o.effort, 0, 10), risk: clamp(o.risk, 0, 10), novelty: clamp(o.novelty, 0, 10), quality: clamp(o.quality, 0, 10) })),
  });
  const pct = (v) => `${(v * 100).toFixed(1)}%`, people = (v) => (v >= 1e8 ? `${(v / 1e8).toFixed(2)}億人` : `${Math.round(v / 1e4).toLocaleString("ja-JP")}万人`);
  const busy = (fn) => { $("x-msg").textContent = "計算しています…"; setTimeout(() => { try { fn(); $("x-msg").textContent = ""; } catch (e) { $("x-msg").textContent = e.message; } }, 30); };

  $("x-run").onclick = () => busy(() => {
    const config = read(), runs = Math.round(num("x-runs", 1, 50, 10)), t = trialCustom(getPersonas(), config, runs, seedOf());
    if (!t) throw new Error("条件に合う人がいません。年齢や性別の条件を広げてください。");
    const O = config.options, K = O.length, order = O.map((o, k) => k).sort((a, b) => t.mean[b] - t.mean[a]);
    const focus = order.find((k) => k > 0) ?? 1, sens = sensitivity(getPersonas(), config, focus, Math.min(4, runs), seedOf());
    const table = (title, rows) => `<h3>${title}</h3><div class="table-scroll"><table class="verify"><tr><th></th>${O.map((o) => `<th class="num">${esc(o.name)}</th>`).join("")}</tr>${rows.map((g) => { const top = g.shares.indexOf(Math.max(...g.shares)); return `<tr><td>${esc(g.label)}</td>${g.shares.map((s, k) => `<td class="num">${k === top ? `<b>${pct(s)}</b>` : pct(s)}</td>`).join("")}</tr>`; }).join("")}</table></div>`;
    const spread = (g) => Math.max(...g.map((x) => x.shares[focus])) - Math.min(...g.map((x) => x.shares[focus]));
    const dims = [["年代", t.byAge], ["収入の層", t.byTier], ["性別", t.bySex]].filter(([, g]) => g.length >= 2).map(([name, g]) => ({ name, g, gap: spread(g) })).sort((a, b) => b.gap - a.gap);
    const d0 = dims[0], hiG = d0 && [...d0.g].sort((a, b) => b.shares[focus] - a.shares[focus])[0], loG = d0 && [...d0.g].sort((a, b) => a.shares[focus] - b.shares[focus])[0];
    const moved = 1 - t.mean[0], wide = Math.max(...t.hi.map((h, k) => h - t.lo[k]));
    const findings = [
      `${config.months}か月後、「${O[order[0]].name}」が${pct(t.mean[order[0]])}でいちばん多くなりました。今のままから動いた人は${pct(moved)}(約${people(moved * t.population)})です。`,
      d0 && `「${O[focus].name}」への反応がいちばん分かれるのは${d0.name}です。${hiG.label}では${pct(hiG.shares[focus])}、${loG.label}では${pct(loG.shares[focus])}でした。`,
      sens.rows[0] && `「${O[focus].name}」を増やすのにいちばん効くのは「${sens.rows[0].label}」で、${sens.rows[0].delta >= 0 ? "+" : ""}${(sens.rows[0].delta * 100).toFixed(1)}ポイントです。`,
      t.unaware.slice(1).some((u) => u > 0.2) && `期間が終わっても、${O.map((o, k) => (k > 0 && t.unaware[k] > 0.2 ? `「${o.name}」を${pct(t.unaware[k])}の人が知らないまま` : null)).filter(Boolean).join("、")}です。中身より先に、知らせ方が壁になっています。`,
      wide > 0.08 ? `同じ条件でも、試行によって最大${(wide * 100).toFixed(0)}ポイントの差が出ました。最初に動く人の偶然で、結果が変わる条件です。` : `${runs}回の試行で、結果の差は最大${(wide * 100).toFixed(1)}ポイントでした。偶然には左右されにくい条件です。`,
    ].filter(Boolean);
    $("x-out").innerHTML = `<div class="analysis"><h2>${esc(config.title)}</h2>
        <p class="a-note">対象 約${people(t.population)}(仮想の${t.n.toLocaleString("ja-JP")}人で計算)。${runs}回の試行の平均です。</p>
        <div class="a-cards">${O.map((o, k) => `<div class="a-card"><small>${esc(o.name)}</small><b>${pct(t.mean[k])}</b> <i>約${people(t.mean[k] * t.population)}。試行による幅 ${pct(t.lo[k])}〜${pct(t.hi[k])}</i></div>`).join("")}</div>
        <p class="a-headline">${esc(findings[0])}</p></div>
      <div class="card"><div class="form-row" id="x-copy"></div>
        <h3>読み取れること</h3><div class="advice"><ul>${findings.slice(1).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <h3>選ぶ人の割合の推移</h3>${multiLine(O.map((o, k) => ({ name: o.name, color: COLORS[k], points: t.series.map((s) => ({ x: s.x, y: s.shares[k] })) })), { xLabel: "月" })}
        ${dims.map((d) => table(`${d.name}ごとの選び方`, d.g)).join("")}
        <h3>何を変えると「${esc(O[focus].name)}」が増えるか</h3>
        <div class="table-scroll"><table class="verify"><tr><th>変えること</th><th class="num">割合の変化</th></tr>${sens.rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${r.delta >= 0 ? "+" : ""}${(r.delta * 100).toFixed(1)}ポイント</td></tr>`).join("")}</table></div>
        <p class="note">いまの条件での割合は${pct(sens.base)}です。条件を1つだけ変えて、同じ人たちで計算し直した差です。<br>重みの係数はすべて仮定です(一覧は「出典と仮定」)。人数そのものより、「誰が動くか」と「何が効くか」の順番を見てください。</p></div>`;
    $("x-copy").appendChild(copyButton([`${config.title}(${config.months}か月後、${runs}回の平均)`, ...O.map((o, k) => `・${o.name}:${pct(t.mean[k])}(約${people(t.mean[k] * t.population)})`), ...findings.map((x) => `→ ${x}`), "※ 仮定にもとづく試算です。"].join("\n")));
  });

  $("x-3d").onclick = () => busy(() => {
    const config = read(), out = runCustom(getPersonas(), config, seedOf());
    if (!out) throw new Error("条件に合う人がいません。年齢や性別の条件を広げてください。");
    const stage = showStage($("x-stage")); if (!stage) return;
    const builds = ["houses", "market", "hall", "office"];
    const frames = thin(out.series, 49).map((s) => ({ label: `${s.x}か月目`, caption: `${s.x}か月目:${config.options.map((o, k) => `${o.name} ${pct(s.shares[k])}`).join("、")}。`,
      zones: config.options.map((o, k) => ({ name: o.name, color: COLORS[k], count: s.shares[k] * 500, build: builds[k] })) }));
    stage.setFrames(frames, { title: config.title, sub: "人形1体が、対象者の0.2%を表します。", maxFigures: 500 });
  });

  load("blank");
  return { load, el };
}
