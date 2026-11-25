// 依存ライブラリなしの小さなSVGグラフ部品
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// 横棒グラフ rows: [{label, value, note?}]
export function hbar(rows, { fmt = (v) => v, color = "var(--accent)", labelWidth = 150 } = {}) {
  const W = 640, rowH = 26, max = Math.max(...rows.map((r) => r.value), 1e-9);
  const barW = W - labelWidth - 110;
  const body = rows.map((r, i) => {
    const y = i * rowH + 4, w = Math.max((r.value / max) * barW, 1);
    return `<text x="${labelWidth - 6}" y="${y + 14}" text-anchor="end">${esc(r.label)}</text>
      <rect x="${labelWidth}" y="${y}" width="${w}" height="${rowH - 8}" rx="3" fill="${r.color || color}"/>
      <text x="${labelWidth + w + 6}" y="${y + 14}">${esc(fmt(r.value))}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${rows.length * rowH + 8}" role="img">${body}</svg>`;
}

// 人口ピラミッド rows: [{label, male, female}]
export function pyramid(rows, { fmt = (v) => v } = {}) {
  const W = 640, rowH = 20, mid = W / 2, gap = 34, half = mid - gap - 60;
  const max = Math.max(...rows.flatMap((r) => [r.male, r.female]), 1e-9);
  const ordered = [...rows].reverse();
  const body = ordered.map((r, i) => {
    const y = i * rowH + 18, wm = (r.male / max) * half, wf = (r.female / max) * half;
    return `<text x="${mid}" y="${y + 12}" text-anchor="middle" class="sub">${esc(r.label)}</text>
      <rect x="${mid - gap - wm}" y="${y}" width="${wm}" height="${rowH - 4}" rx="2" fill="var(--male)"/>
      <rect x="${mid + gap}" y="${y}" width="${wf}" height="${rowH - 4}" rx="2" fill="var(--female)"/>
      <text x="${mid - gap - wm - 4}" y="${y + 12}" text-anchor="end" class="sub">${esc(fmt(r.male))}</text>
      <text x="${mid + gap + wf + 4}" y="${y + 12}" class="sub">${esc(fmt(r.female))}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${rows.length * rowH + 24}" role="img">
    <text x="${mid - gap - 4}" y="12" text-anchor="end" fill="var(--male)">男性</text>
    <text x="${mid + gap + 4}" y="12" fill="var(--female)">女性</text>${body}</svg>`;
}

// 折れ線(幅つき) series: [{x, mid, low?, high?}]、marks: [{x, label}]
export function line(series, { fmt = (v) => v, xLabel = "", color = "var(--accent)", marks = [], zero = false } = {}) {
  const W = 640, H = 260, L = 70, R = 14, T = 14, B = 34;
  if (!series.length) return "";
  const xs = series.map((s) => s.x);
  const vals = series.flatMap((s) => [s.mid, s.low ?? s.mid, s.high ?? s.mid]);
  let lo = Math.min(...vals, 0), hi = Math.max(...vals, 1e-9);
  if (lo === hi) hi = lo + 1;
  const x = (v) => L + ((v - xs[0]) / Math.max(xs[xs.length - 1] - xs[0], 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (key) => series.map((s, i) => `${i ? "L" : "M"}${x(s.x).toFixed(1)},${y(s[key] ?? s.mid).toFixed(1)}`).join("");
  const band = series[0].low != null
    ? `<path d="${path("high")}${[...series].reverse().map((s) => `L${x(s.x).toFixed(1)},${y(s.low).toFixed(1)}`).join("")}Z" fill="var(--band)"/>` : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = lo + (hi - lo) * t;
    return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="axis"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="sub">${esc(fmt(v))}</text>`;
  }).join("");
  const step = Math.max(1, Math.ceil(series.length / 8));
  const xt = series.filter((_, i) => i % step === step - 1 || i === 0).map((s) => `<text x="${x(s.x)}" y="${H - 14}" text-anchor="middle" class="sub">${s.x}</text>`).join("");
  const mk = marks.map((m, i) => `<line x1="${x(m.x)}" x2="${x(m.x)}" y1="${T}" y2="${H - B}" stroke="var(--bad)" stroke-dasharray="3 3"/><text x="${x(m.x) + (x(m.x) > W * 0.7 ? -3 : 3)}" y="${T + 10 + (i % 3) * 12}" text-anchor="${x(m.x) > W * 0.7 ? "end" : "start"}" fill="var(--bad)">${esc(m.label)}</text>`).join("");
  const zl = zero && lo < 0 ? `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--sub)"/>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${ticks}${zl}${band}<path d="${path("mid")}" fill="none" stroke="${color}" stroke-width="2.5"/>${mk}${xt}
    <text x="${W - R}" y="${H - 2}" text-anchor="end" class="sub">${esc(xLabel)}</text></svg>`;
}

// 棒(右の目盛り)と折れ線2本(左の目盛り・%)を重ねたグラフ
// rows: [{label, bar, a, b}]、a・b は 0〜1 の割合
export function combo(rows, { barMax, barUnit = "回", legend, xLabel = "" }) {
  const W = 900, H = 380, L = 56, R = 60, T = 46, B = 56;
  const top = Math.max(1.1, ...rows.flatMap((r) => [r.a, r.b])) > 1.1 ? Math.ceil(Math.max(...rows.flatMap((r) => [r.a, r.b])) * 5) / 5 : 1.1;
  const slot = (W - L - R) / rows.length;
  const x = (i) => L + slot * (i + 0.5);
  const y = (v) => T + (1 - v / top) * (H - T - B);
  const yb = (v) => T + (1 - (v / barMax) * (1 / top)) * (H - T - B);
  const grid = [];
  for (let v = 0; v <= top + 1e-9; v += 0.2) {
    grid.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="c-grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`);
    if (v <= 1 + 1e-9) grid.push(`<text x="${W - R + 8}" y="${y(v) + 4}" class="c-bar-t">${Math.round(v * barMax)}${barUnit}</text>`);
  }
  const bars = rows.map((r, i) => (r.bar > 0 ? `<rect x="${x(i) - slot * 0.36}" y="${yb(r.bar)}" width="${slot * 0.72}" height="${y(0) - yb(r.bar)}" class="c-bar"/>` : "")).join("");
  const path = (k, cls) => `<path d="${rows.map((r, i) => `${i ? "L" : "M"}${x(i)},${y(r[k])}`).join("")}" class="${cls}" fill="none"/>` + rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(r[k])}" r="5" class="${cls}-dot"/>`).join("");
  const lg = [["c-a-key", legend.a], ["c-b-key", legend.b], ["c-bar-key", legend.bar]];
  let lx = L;
  const legendHtml = lg.map(([cls, text]) => { const out = `<rect x="${lx}" y="12" width="34" height="14" rx="2" class="${cls}"/><text x="${lx + 40}" y="24" class="c-legend">${esc(text)}</text>`; lx += 60 + text.length * 14; return out; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" class="combo">${legendHtml}${grid.join("")}${bars}${path("a", "c-a")}${path("b", "c-b")}
    ${rows.map((r, i) => `<text x="${x(i)}" y="${H - B + 22}" text-anchor="middle" class="c-x">${esc(r.label)}</text>`).join("")}
    <text x="${(L + W - R) / 2}" y="${H - 10}" text-anchor="middle">${esc(xLabel)}</text></svg>`;
}

// 複数の折れ線 series: [{name, color, points:[{x,y}]}]、y は 0〜の割合
export function multiLine(series, { xLabel = "", fmt = (v) => `${Math.round(v * 100)}%` } = {}) {
  const W = 640, H = 260, L = 52, R = 14, T = 30, B = 34;
  series = series.map((s) => ({ ...s, points: s.points.filter((p) => p.y != null && Number.isFinite(p.y)) })); // 値の無い年は線を引かない
  const all = series.flatMap((s) => s.points);
  const xs = all.map((p) => p.x), hi = Math.max(1, ...all.map((p) => p.y)) * 1.05;
  const x = (v) => L + ((v - Math.min(...xs)) / Math.max(Math.max(...xs) - Math.min(...xs), 1)) * (W - L - R);
  const y = (v) => T + (1 - v / hi) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(hi * t)}" y2="${y(hi * t)}" class="axis"/><text x="${L - 6}" y="${y(hi * t) + 4}" text-anchor="end" class="sub">${esc(fmt(hi * t))}</text>`).join("");
  let lx = L;
  const legend = series.map((s) => { const out = `<rect x="${lx}" y="6" width="14" height="10" rx="2" fill="${s.color}"/><text x="${lx + 18}" y="15">${esc(s.name)}</text>`; lx += 34 + s.name.length * 12; return out; }).join("");
  const lines = series.map((s) => `<path d="${s.points.map((p, i) => `${i ? "L" : "M"}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join("")}" fill="none" stroke="${s.color}" stroke-width="2.5"/>`).join("");
  // 目盛りは最初の x から(年のように0から始まらない軸でも、目盛りが枠の外に出ないように)
  const minX = Math.min(...xs), maxX = Math.max(...xs), step = Math.max(1, Math.ceil((maxX - minX) / 8));
  const xt = []; for (let v = minX; v <= maxX; v += step) xt.push(`<text x="${x(v)}" y="${H - 14}" text-anchor="middle" class="sub">${v}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${legend}${ticks}${lines}${xt.join("")}<text x="${W - R}" y="${H - 2}" text-anchor="end" class="sub">${esc(xLabel)}</text></svg>`;
}

// 縦棒グラフ(値のラベルつき)。rows: [{label, value, on?}]
export function vbar(rows, { color = "var(--accent)", max = null, fmt = (v) => v } = {}) {
  const W = 300, H = 230, L = 8, R = 8, T = 26, B = 28;
  const top = max ?? Math.max(...rows.map((r) => r.value), 1e-9);
  const slot = (W - L - R) / rows.length;
  const y = (v) => T + (1 - v / top) * (H - T - B);
  const grid = [0.5, 1].map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(top * t)}" y2="${y(top * t)}" class="axis"/>`).join("");
  const bars = rows.map((r, i) => {
    const x = L + slot * i + slot * 0.15, h = Math.max(y(0) - y(r.value), 1.5);
    return `<rect x="${x}" y="${y(0) - h}" width="${slot * 0.7}" height="${h}" rx="4" fill="${color}" opacity="${r.on ? 1 : 0.5}"/>
      <text x="${x + slot * 0.35}" y="${y(0) - h - 6}" text-anchor="middle" class="vb-v${r.on ? " on" : ""}">${esc(fmt(r.value))}</text>
      <text x="${x + slot * 0.35}" y="${H - 8}" text-anchor="middle" class="${r.on ? "vb-l on" : "vb-l sub"}">${esc(r.label)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${grid}<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--sub)"/>${bars}</svg>`;
}

export { esc };
