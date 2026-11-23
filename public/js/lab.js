// 実験室:1つのシナリオ定義(条件の一覧・1回分の計算・見せる指標)から、
// 「この条件で試す」「条件を比べる」の画面を組み立てる共通の部品。
import { multiLine, esc } from "./charts.js";
import { showStage } from "./stage3d.js";

const FMT = {
  pct: (v) => `${Math.round(v * 100)}%`,
  pct1: (v) => `${(v * 100).toFixed(1)}%`,
  num0: (v) => Math.round(v).toLocaleString("ja-JP"),
  num1: (v) => v.toFixed(1),
  num2: (v) => v.toFixed(2),
  man: (v) => `${Math.round(v / 1e4).toLocaleString("ja-JP")}万人`,
  people: (v) => `${Math.round(v).toLocaleString("ja-JP")}人`,
  people1000: (v) => `${Math.round(v * 1000).toLocaleString("ja-JP")}人`,
  houses: (v) => `${Math.round(v)}軒`,
  villages: (v) => `${v.toFixed(1)}村`,
  days: (v) => (v >= 9999 ? "届かず" : `${Math.round(v)}日`),
  points: (v) => `${Math.round(v)}点`,
  times: (v) => `${Math.round(v)}回`,
  min1: (v) => (Number.isFinite(v) ? `${v.toFixed(1)}分` : "行列が伸び続ける"),
  yen: (v) => `${Math.round(v).toLocaleString("ja-JP")}円`,
};
const fmt = (m, v) => (v == null || Number.isNaN(v) ? "―" : FMT[m.fmt](v));
export const formatMetric = fmt;

// 結果を文章としてコピーするボタン。押すとクリップボードに入れ、だめなら選べる形で見せる
export function copyButton(text) {
  const b = document.createElement("button");
  b.className = "copy-btn"; b.textContent = "結果をコピー";
  b.onclick = () => {
    const done = () => { b.textContent = "コピーしました"; setTimeout(() => (b.textContent = "結果をコピー"), 1600); };
    const fallback = () => { const t = document.createElement("textarea"); t.value = text; t.rows = 8; t.style.width = "100%"; b.after(t); t.select(); b.textContent = "下の文章を選んでコピーしてください"; };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch { fallback(); }
  };
  return b;
}

// 同じ条件で何回も試して平均する
export function trial(def, rules, runs, seed, years) {
  const sum = {}, series = [], cond = { n: 0, sum: {}, key: null };
  for (let r = 0; r < runs; r++) {
    const out = def.run(rules, seed * 1000 + r, years);
    for (const [k, v] of Object.entries(out.summary)) sum[k] = (sum[k] ?? 0) + v / runs;
    if (out.weightKey) { cond.n += out.summary[out.weightKey]; for (const [k, v] of Object.entries(out.summary)) cond.sum[k] = (cond.sum[k] ?? 0) + v * out.summary[out.weightKey]; cond.key = out.weightKey; }
    out.series.forEach((row, i) => {
      const s = (series[i] ??= { x: row.x });
      for (const [k, v] of Object.entries(row)) if (k !== "x") s[k] = (s[k] ?? 0) + v / runs;
    });
  }
  // 「広がった回だけの平均」のように、条件に合う回だけで平均し直す項目
  if (cond.key && cond.n > 0) for (const k of def.conditional ?? []) sum[k] = cond.sum[k] / cond.n;
  return { summary: sum, series };
}

// 理論値との照合表
export function verifyTable(def, summary, rules) {
  const rows = def.verify?.(summary, rules); if (!rows?.length) return "";
  const head = def.verifyHead ?? "理論値";
  const diff = (r) => (r.range ? (r.model >= r.range[0] - 1e-9 && r.model <= r.range[1] + 1e-9 ? "範囲内" : "範囲外") : !Number.isFinite(r.theory) || Math.abs(r.theory) < 1e-9 ? "―" : `${((r.model / r.theory - 1) * 100 >= 0 ? "+" : "")}${((r.model / r.theory - 1) * 100).toFixed(1)}%`);
  return `<h3>${esc(def.verifyTitle ?? "理論値との照合")}</h3><div class="table-scroll"><table class="verify"><tr><th>項目</th><th class="num">この計算</th><th class="num">${esc(head)}</th><th class="num">ずれ</th></tr>${
    rows.map((r) => `<tr><td>${esc(r.label)}${r.note ? `<br><small>${esc(r.note)}</small>` : ""}</td><td class="num">${FMT[r.fmt](r.model)}</td><td class="num">${r.theoryText ? esc(r.theoryText) : FMT[r.fmt](r.theory)}</td><td class="num">${diff(r)}</td></tr>`).join("")}</table></div>
    <p class="note">${esc(def.verifyNote ?? "理論値は数式から計算した値です。ずれが小さいほど、このツールの計算が理論どおりに動いていることを示します(現実に合っていることの証明ではありません)。")}</p>`;
}

export function mountLab(def, { seedOf }) {
  const id = (s) => `lab-${def.key}-${s}`;
  const el = document.createElement("section");
  el.id = `tab-${def.key}`;
  el.className = "tab";
  el.innerHTML = `<div class="page-head"><h1>${esc(def.title)}</h1><p>${esc(def.lead)}</p></div>
    <div class="card">
      <div class="form-grid">
        <label>条件 <select id="${id("preset")}">${Object.entries(def.presets).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}</select></label>
        ${(def.params ?? []).map((p) => `<label>${esc(p.label)} <input id="${id(p.key)}" type="number" value="${p.value}" min="${p.min}" max="${p.max}" step="${p.step ?? 1}"></label>`).join("")}
      </div>
      <details><summary>詳細設定(試行回数)</summary><div class="form-grid"><label>試行回数 <input id="${id("runs")}" type="number" value="${def.runs ?? 30}" min="1" max="200"></label></div></details>
      <p class="note">${def.note}</p>
      <div class="form-row"><button id="${id("run")}" class="primary">この条件で試す</button><button id="${id("compare")}">${Object.keys(def.presets).length}つの条件を比べる</button>${def.frames ? `<button id="${id("3d")}">3Dで見る</button>` : ""}</div>
      <p id="${id("msg")}" class="msg"></p>
    </div><div id="${id("stage")}"></div><div id="${id("out")}"></div>`;
  document.querySelector("main").insertBefore(el, document.getElementById("tab-source"));
  const $ = (s) => document.getElementById(id(s));
  if (def.initial) $("preset").value = def.initial;
  const applyPreset = () => { for (const p of def.params ?? []) { const v = def.presets[$("preset").value].rules[p.key]; if (v != null) $(p.key).value = p.scale ? v * p.scale : v; } };
  $("preset").onchange = applyPreset;
  applyPreset();

  const read = () => {
    const key = $("preset").value, preset = def.presets[key];
    const rules = { ...preset.rules };
    for (const p of def.params ?? []) { const v = Math.min(p.max, Math.max(p.min, Number($(p.key).value) || 0)); rules[p.key] = p.scale ? v / p.scale : v; }
    // 条件の標準の値から変えた数値は、題名にも書く
    const changed = (def.params ?? []).filter((p) => preset.rules[p.key] != null && Math.abs(preset.rules[p.key] - rules[p.key]) > 1e-9).map((p) => `${p.label.replace(/\(.*?\)/, "")}を${Number($(p.key).value)}に変更`);
    const title = preset.label.replace(/^[A-Z] /, "") + (changed.length ? `(${changed.join("、")})` : "");
    return { key, preset, rules, title, runs: Math.min(200, Math.max(1, Math.round(Number($("runs").value) || 30))), years: preset.years ?? def.years };
  };
  const busy = (fn) => { $("msg").textContent = "計算中です…"; setTimeout(() => { try { fn(); $("msg").textContent = ""; } catch (e) { $("msg").textContent = e.message; } }, 30); };
  const ref = (key, m) => { const v = def.reference?.[key]?.[m.key]; return v == null ? "" : `参考 ${fmt(m, v)}`; };
  const card = (label, value, sub = "") => `<div class="a-card"><small>${label}</small><b>${value}</b> <i>${sub}</i></div>`;

  $("run").onclick = () => busy(() => {
    const { key, preset, rules, runs, years, title } = read();
    const t = trial(def, rules, runs, seedOf(), years);
    const advice = def.advise?.(t.summary, rules) ?? [];
    $("out").innerHTML = `<div class="analysis">
        <h2>${esc(title)}を${runs}回検証</h2>
        <p class="a-sub">${def.xLabel ?? "世代"}:${years}まで計算。数字は${runs}回の試行の平均です</p>
        <div class="a-cards">${def.metrics.map((m) => card(m.label, fmt(m, t.summary[m.key]), [m.sub, ref(key, m)].filter(Boolean).join("・"))).join("")}</div>
        ${advice[0] ? `<p class="a-headline">${esc(advice[0])}</p>` : ""}
        ${def.reference?.[key] ? `<p class="a-note">「参考」は、もとにした実験で示されていた値です。係数はこの値に近づくよう調整していますが、一致はしません。</p>` : ""}</div>
      <div class="card"><div class="form-row" id="${id("copy")}"></div>${verifyTable(def, t.summary, rules)}${def.extra?.(rules, seedOf()) ?? ""}${advice.length > 1 ? `<h3>ほかに読み取れること</h3><div class="advice"><ul>${advice.slice(1).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
        ${def.charts.map((c) => `<h3>${esc(c.title)}</h3>${multiLine(c.lines.map((l) => ({ name: l.name, color: l.color, points: t.series.map((s) => ({ x: s.x, y: s[l.key] ?? 0 })) })), { xLabel: def.xLabel ?? "世代", fmt: FMT[c.fmt ?? "pct"] })}`).join("")}</div>`;
    const text = [`${def.title}:${title}(${runs}回の平均、${def.xLabel ?? "世代"} ${years}まで)`,
      ...def.metrics.map((m) => `・${m.label}:${fmt(m, t.summary[m.key])}`), ...advice.map((x) => `→ ${x}`), "※ 仮定にもとづく試算です。"].join("\n");
    $("copy").appendChild(copyButton(text));
  });

  if (def.frames) $("3d").onclick = () => busy(() => {
    const { rules, years, title } = read();
    const stage = showStage($("stage"));
    if (!stage) return;
    const scene = def.frames(rules, seedOf(), years);
    if (scene.terrain) stage.setTerrain({ ...scene.terrain, title });
    else stage.setFrames(scene.frames, { ...scene.opts, title });
  });

  // 初めて開いたときに、標準の条件の結果を出しておく(空の画面で待たせない)
  el.addEventListener("lab:open", () => { if (!$("out").innerHTML) $("run").click(); });

  $("compare").onclick = () => busy(() => {
    const { runs } = read();
    const rows = Object.entries(def.presets).map(([key, p]) => ({ key, p, t: trial(def, p.rules, runs, seedOf(), p.years ?? def.years) }));
    const colors = ["#2f8f6b", "#b4473b", "#c9a45c", "#4a7fb5", "#8a6fb3", "#58a6a6", "#a0705a"];
    const c0 = def.charts[0], l0 = c0.lines[0];
    $("out").innerHTML = `<div class="analysis">
        <h2>${rows.length}つの条件を${runs}回ずつ検証</h2>
        <p class="a-sub">それぞれの条件の標準の設定で比べています。( )内は、もとにした実験で示されていた値です</p>
        <div class="table-scroll"><table><tr><th>条件</th>${def.metrics.map((m) => `<th class="num">${m.label}</th>`).join("")}</tr>
        ${rows.map((r) => `<tr><td>${esc(r.p.label)}</td>${def.metrics.map((m) => { const v = def.reference?.[r.key]?.[m.key]; return `<td class="num">${fmt(m, r.t.summary[m.key])}${v == null ? "" : `<br><small>(${fmt(m, v)})</small>`}</td>`; }).join("")}</tr>`).join("")}</table></div></div>
      <div class="card"><h3>${esc(l0.name)}の推移</h3>${multiLine(rows.map((r, i) => ({ name: r.p.label.slice(0, 1), color: colors[i % colors.length], points: r.t.series.map((s) => ({ x: s.x, y: s[l0.key] ?? 0 })) })), { xLabel: def.xLabel ?? "世代", fmt: FMT[c0.fmt ?? "pct"] })}</div>`;
  });
}
