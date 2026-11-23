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

export { esc };
