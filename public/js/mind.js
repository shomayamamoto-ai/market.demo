// 心の状態:仮想の住民1人ずつに、性格(ビッグファイブ)、生活満足度、孤独感、心理的苦痛(K6)を付ける。
// 性格は年齢×性別の平均と散らばり(川本ほか 2015)に、性格どうしの相関を入れて引く。
// 満足度・孤独感・苦痛は、年齢×性別の値をそのまま使い、世帯の年収や配偶者の有無による差を、年齢×性別の平均を変えないように足す。
import MD from "./mind-data.js";
import { makeRng } from "./rng.js";
import { esc, multiLine } from "./charts.js";

export const TRAITS = [["E", "外向性"], ["A", "協調性"], ["C", "勤勉性"], ["N", "神経症傾向"], ["O", "開放性"]];
const K = TRAITS.map(([k]) => k);
// 性格どうしの相関の行列を分解して(コレスキー分解)、相関のある乱数を作る
const R = K.map((a) => K.map((b) => (a === b ? 1 : MD.corr[`${a}-${b}`] ?? MD.corr[`${b}-${a}`] ?? 0)));
const CH = (() => { const n = 5, L = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = R[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-9)) : s / L[j][j]; }
  return L; })();
const band10 = (age) => (age < 30 ? "20s" : age < 40 ? "30s" : age < 50 ? "40s" : age < 60 ? "50s" : age < 70 ? "60s" : "70s"); // 調査は23〜79歳。15〜22歳は20代、80歳以上は70代の値を使う(仮定)
const lifeBand = (age) => (age < 25 ? 15 : age < 35 ? 25 : age < 45 ? 35 : age < 60 ? 45 : 60);
const lonelyBand = (age) => (age < 20 ? "16-19" : age < 30 ? "20s" : age < 40 ? "30s" : age < 50 ? "40s" : age < 60 ? "50s" : age < 70 ? "60s" : age < 80 ? "70s" : "80+");
const k6Band = (sex, age) => { const t = MD.k6[sex], ks = Object.keys(t).map(Number).sort((a, b) => a - b); let b = ks[0]; for (const k of ks) if (age >= k) b = k; return t[b]; };
const INC = [[100, "<100万"], [300, "100-300万"], [500, "300-500万"], [700, "500-700万"], [1000, "700-1000万"], [Infinity, ">=1000万"]];
const lifeInc = (man) => MD.lifeIncome[INC.find(([hi]) => man < hi)[1]];
const empKey = (p) => (p.status === "regular" || p.status === "exec" || p.status === "self" ? "regular" : p.status === "nonRegular" ? "nonregular" : "not_working");
const maritalKey = (p) => (p.marital === "既婚" ? "married" : p.marital === "未婚" ? "never_married" : "other");
const lonelyMar = (sex, key) => { const t = MD.lonelyMarital[sex]; return key === "other" ? (t.widowed + t.divorced) / 2 : t[key]; }; // 離別と死別は分けていないので、2つの平均(仮定)

// 年齢×性別の組ごとに、平均を変えずに個人差を足す
function centerWithin(personas, cellOf, rawOf, targetOf, set) {
  const cells = new Map();
  for (const p of personas) { const c = cellOf(p); if (c == null) continue; if (!cells.has(c)) cells.set(c, []); cells.get(c).push(p); }
  for (const [c, list] of cells) {
    const w = list.reduce((a, p) => a + p.weight, 0), raws = list.map(rawOf), m = list.reduce((a, p, i) => a + p.weight * raws[i], 0) / w, t = targetOf(list[0]);
    list.forEach((p, i) => set(p, raws[i], m, t));
  }
}
export function attachMind(personas, seed = 1) {
  if (!personas?.length) return personas;
  const rng = makeRng((seed * 7919 + 17) >>> 0);
  for (const p of personas) {
    p.mind = {};
    if (p.age < 15) continue;
    const e = K.map(() => rng.normal()), z = K.map((_, i) => CH[i].reduce((a, v, j) => a + v * (e[j] ?? 0), 0)), b = band10(p.age), sex = p.sex === "female" ? "female" : "male";
    p.mind.big5 = Object.fromEntries(K.map((k, i) => { const [m, sd] = MD.big5[k][sex][b]; return [k, Math.round(Math.min(14, Math.max(2, m + sd * z[i])) * 10) / 10]; }));
  }
  const adult = (p) => p.age >= 15, sexOf = (p) => (p.sex === "female" ? "female" : "male");
  // 生活満足度(0〜10の平均の見込み):世帯の年収と、配偶者の有無×働き方(64歳以下)による差を足す
  centerWithin(personas, (p) => (adult(p) ? `${sexOf(p)}${lifeBand(p.age)}` : null),
    (p) => lifeInc(p.householdIncome ?? p.income ?? 0) + (p.age <= 64 ? MD.lifeSpouse[sexOf(p)][empKey(p)][p.marital === "既婚" ? "spouse" : "no_spouse"] - 5.5 : 0),
    (p) => MD.life[sexOf(p)][lifeBand(p.age)], (p, raw, m, t) => (p.mind.life = Math.round((t + raw - m) * 100) / 100));
  // 孤独感(「しばしば・常に」感じる見込み、16歳以上):配偶関係による差を足す。世帯の種類と年収は使わない(あとで照合に使うため)
  centerWithin(personas, (p) => (p.age >= 16 ? `${sexOf(p)}${lonelyBand(p.age)}` : null), (p) => lonelyMar(sexOf(p), maritalKey(p)),
    (p) => MD.lonely[sexOf(p)][lonelyBand(p.age)] / 100, (p, raw, m, t) => (p.mind.lonely = m > 0 ? Math.min(0.9, (t * raw) / m) : t));
  // 心理的苦痛(K6が10点以上の見込み、12歳以上)
  for (const p of personas) if (p.age >= 12) p.mind.distress = k6Band(sexOf(p), p.age) / 100;
  return personas;
}
// 照合:当てはめに使っていない分け方(世帯の種類、世帯の年収)で、孤独感の割合を比べる
const HH = { single: "single", coupleOnly: "couple_only", coupleKids: "couple_and_children", singleParent: "single_parent_and_children" };
const LINC = [[100, "<100万"], [200, "100-199万"], [300, "200-299万"], [400, "300-399万"], [500, "400-499万"], [700, "500-699万"], [1000, "700-999万"], [1500, "1000-1499万"], [Infinity, ">=1500万"]];
export function mindChecks(personas) {
  const P = personas.filter((p) => p.mind?.lonely != null), avg = (list, f) => { const w = list.reduce((a, p) => a + p.weight, 0); return w ? list.reduce((a, p) => a + p.weight * f(p), 0) / w : null; };
  const rows = [{ label: "孤独感(全体、16歳以上)", model: avg(P, (p) => p.mind.lonely), value: MD.lonelyAll / 100, holdout: false }];
  for (const [k, key] of Object.entries(HH)) rows.push({ label: `孤独感:${{ single: "一人暮らし", coupleOnly: "夫婦のみ", coupleKids: "夫婦と子", singleParent: "ひとり親と子" }[k]}`, model: avg(P.filter((p) => p.householdType === k), (p) => p.mind.lonely), value: MD.lonelyHousehold[key] / 100, holdout: true });
  for (const [lo, hi, key] of [[0, 200, "100-199万"], [500, 700, "500-699万"], [1000, 1500, "1000-1499万"]]) rows.push({ label: `孤独感:世帯年収 ${key}`, model: avg(P.filter((p) => (p.householdIncome ?? 0) >= lo && (p.householdIncome ?? 0) < hi), (p) => p.mind.lonely), value: MD.lonelyIncome[key] / 100, holdout: true });
  const L = personas.filter((p) => p.mind?.life != null);
  for (const [lo, hi, key] of [[0, 300, "100-300万"], [500, 700, "500-700万"], [1000, 1e9, ">=1000万"]]) rows.push({ label: `生活満足度:世帯年収 ${key}`, model: avg(L.filter((p) => (p.householdIncome ?? 0) >= lo && (p.householdIncome ?? 0) < hi), (p) => p.mind.life), value: MD.lifeIncome[key], unit: "点", holdout: false });
  return rows.filter((r) => r.model != null);
}

export function mountMind({ before, getPersonas }) {
  const el = document.createElement("section"); el.id = "tab-mind"; el.className = "tab";
  el.innerHTML = `<div class="page-head"><h1>心の状態</h1><p>仮想の住民1人ずつに、性格(ビッグファイブ)、生活満足度、孤独感、心理的苦痛を付けます。どれも日本の調査の年齢・性別ごとの値から作り、当てはめに使っていない分け方で照合します。</p></div>
    <div class="card"><div class="kpis">
      <div class="kpi"><small>生活満足度(0〜10点)</small><b>${MD.lifeOverall}点</b><span>2026年。35〜44歳が最も低く、60歳以上が最も高い</span></div>
      <div class="kpi"><small>孤独を「しばしば・常に」感じる人</small><b>${MD.lonelyAll}%</b><span>2025年。一人暮らしは${MD.lonelyHousehold.single}%</span></div>
      <div class="kpi"><small>心理的苦痛(K6が10点以上)</small><b>${MD.k6All}%</b><span>2025年。30〜34歳が最も高い</span></div></div>
      <h3>年齢ごとの生活満足度</h3><div id="md-life"></div><h3>年齢ごとの、孤独を感じる人と心理的苦痛のある人</h3><div id="md-lonely"></div>
      <p class="note">出典:内閣府「満足度・生活の質に関する調査」2026年、内閣官房「人々のつながりに関する基礎調査」2025年(e-Stat)、厚生労働省「国民生活基礎調査」2025年。孤独は「高齢者の問題」と思われがちですが、日本の調査では30〜50代が最も多く、70代が最も少ない結果です。</p></div>
    <div class="card"><h2>性格(ビッグファイブ)</h2><div id="md-big5"></div>
      <p class="note">出典:川本哲也ほか(2015)「ビッグ・ファイブ・パーソナリティ特性の年齢差と性差」発達心理学研究 26(2)(TIPI-J、23〜79歳の4,588人、各特性2〜14点)。年齢と性別で説明できるのは、性格の個人差の1〜5%だけです。つまり、同じ年齢・性別でも性格はほとんどばらばらです。性格どうしの相関(例:勤勉性と神経症傾向 −0.29)も入れて引いています。</p></div>
    <div class="card"><h2>仮想の住民で照合</h2><div id="md-check" class="table-scroll"></div></div>
    <div class="card"><h2>研究でわかっていること</h2><ul class="facts">
      <li>勤勉性・外向性が1標準偏差高いと、年収が約3〜5%高い(Lee & Ohtake、RIETI 14-E-023、日本と米国の調査)。</li>
      <li>勤勉性が高い人ほど、支払いの遅れや債務超過が少なく、神経症傾向が高い人ほど多い(1標準偏差で約2〜4ポイント。米国の若年層、Xu ほか)。</li>
      <li>性格と「新しいものを取り入れる力」の相関は、開放性0.41、外向性0.35(職場・学生の革新性のメタ分析。消費者の新商品の購入そのものではありません)。</li>
      <li>「日本人は同調しやすい」という通説は、日米の比較研究10件のうち、日本の方が同調的と示したものはなく、3件はむしろ日本の学生の方が個人主義的だった(高野・纓坂 1997)。このツールでは、日本の住民に「同調しやすさ」を上乗せしていません。</li>
      <li>生活満足度は、配偶者の有無で0.8〜1.8点違い、年収の全範囲の差(5.0→6.7点)と同じくらい大きい(内閣府 2025年)。</li>
      <li>確認できなかったこと:日本で、性格と貯蓄・衝動買い・ブランドへのこだわり・ネット通販を結びつけた研究。そのため、このツールでは性格を「購入の判断」にはまだ使っていません。</li></ul></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  el.addEventListener("lab:open", () => {
    const sexes = [["male", "男性", "#2f6fd0"], ["female", "女性", "#b4473b"]];
    if (!$("md-life").innerHTML) {
      $("md-life").innerHTML = multiLine(sexes.map(([s, n, c]) => ({ name: n, color: c, points: Object.entries(MD.life[s]).map(([a, v]) => ({ x: Number(a), y: v })) })), { xLabel: "年齢(区切りの始まり)", fmt: (v) => `${v.toFixed(1)}点` });
      const mid = { "16-19": 17, "20s": 25, "30s": 35, "40s": 45, "50s": 55, "60s": 65, "70s": 75, "80+": 85 };
      $("md-lonely").innerHTML = multiLine([...sexes.map(([s, n, c]) => ({ name: `孤独(${n})`, color: c, points: Object.entries(MD.lonely[s]).filter(([k]) => mid[k]).map(([k, v]) => ({ x: mid[k], y: v / 100 })) })),
        ...sexes.map(([s, n, c]) => ({ name: `苦痛(${n})`, color: s === "male" ? "#7fa7e0" : "#e09a90", points: Object.entries(MD.k6[s]).map(([a, v]) => ({ x: Number(a) + 2, y: v / 100 })) }))], { xLabel: "年齢" });
      const bands = ["20s", "30s", "40s", "50s", "60s", "70s"], bx = (b) => Number(b.slice(0, 2)) + 5;
      $("md-big5").innerHTML = TRAITS.map(([k, name]) => `<h3>${name}</h3>` + multiLine(sexes.map(([s, n, c]) => ({ name: n, color: c, points: bands.map((b) => ({ x: bx(b), y: MD.big5[k][s][b][0] })) })), { xLabel: "年齢", fmt: (v) => v.toFixed(1) })).join("");
    }
    const P = getPersonas?.() ?? [];
    if (P.length && P[0].mind) {
      const rows = mindChecks(P), f = (r, v) => (r.unit ? `${v.toFixed(2)}${r.unit}` : `${(v * 100).toFixed(1)}%`);
      $("md-check").innerHTML = `<table class="verify"><tr><th>項目</th><th class="num">仮想の住民</th><th class="num">調査</th></tr>${rows.map((r) => `<tr><td>${r.holdout ? "<b>【検算用】</b>" : ""}${esc(r.label)}</td><td class="num">${f(r, r.model)}</td><td class="num">${f(r, r.value)}</td></tr>`).join("")}</table>
        <p class="note">【検算用】は、住民を作るときに使っていない分け方です。孤独感は「年齢×性別」と「配偶関係」だけから作り、世帯の種類と年収では一度も合わせていません。それでも一人暮らしで高く、年収が高いほど低い、という調査の形が出るかを見ています。</p>`;
    }
  });
  return { tabs: [["mind", "心の状態"]] };
}
