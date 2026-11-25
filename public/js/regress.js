// 複合要因の分析:都道府県を単位にした重回帰(最小二乗法)。
// 係数は「ほかの要因を同じにしたとき、その要因が1標準偏差違うと、結果が何標準偏差違うか」(標準化係数)で出す。
// 47都道府県しかないので、要因を増やしすぎると偶然の当てはまりが増える。調整済みの決定係数と、1県ずつ抜いて当てたときの誤差(LOO)も出す。

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

// 連立方程式を解く(ガウスの消去法)
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function fit(X, y) { // X は切片なし。切片を足して解く
  const Z = X.map((r) => [1, ...r]), k = Z[0].length;
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => Z.reduce((s, r) => s + r[i] * r[j], 0)));
  const b = Array.from({ length: k }, (_, i) => Z.reduce((s, r, n) => s + r[i] * y[n], 0));
  return solve(A, b);
}
const predict = (beta, x) => beta[0] + x.reduce((s, v, i) => s + v * beta[i + 1], 0);

// rows: [{x:[...], y}],名前つきで返す。欠けている県は除く
export function regress(panel, yKey, xKeys) {
  const V = panel.vars, idx = panel.prefs.map((_, i) => i).filter((i) => V[yKey].values[i] != null && xKeys.every((k) => V[k].values[i] != null));
  const y = idx.map((i) => V[yKey].values[i]), Xraw = idx.map((i) => xKeys.map((k) => V[k].values[i]));
  const mx = xKeys.map((_, j) => mean(Xraw.map((r) => r[j]))), sx = xKeys.map((_, j) => sd(Xraw.map((r) => r[j]))), my = mean(y), sy = sd(y);
  const X = Xraw.map((r) => r.map((v, j) => (v - mx[j]) / sx[j])), yz = y.map((v) => (v - my) / sy);
  const beta = fit(X, yz); if (!beta) return null;
  const res = yz.map((v, n) => v - predict(beta, X[n])), sse = res.reduce((s, e) => s + e * e, 0), sst = yz.reduce((s, v) => s + v * v, 0);
  const n = y.length, k = xKeys.length, r2 = 1 - sse / sst, adj = 1 - (1 - r2) * (n - 1) / (n - k - 1);
  // 標準誤差(普通の最小二乗の式)
  const Z = X.map((r) => [1, ...r]), A = Array.from({ length: k + 1 }, (_, i) => Array.from({ length: k + 1 }, (_, j) => Z.reduce((s, r) => s + r[i] * r[j], 0)));
  const s2 = sse / (n - k - 1), se = Array.from({ length: k + 1 }, (_, i) => { const e = Array(k + 1).fill(0); e[i] = 1; const col = solve(A, e); return col ? Math.sqrt(s2 * col[i]) : NaN; });
  // 1県ずつ抜いて、残りで当てはめ、抜いた県を当てる(当てはめに使っていない県での誤差)
  let loo = 0; for (let m = 0; m < n; m++) { const b = fit(X.filter((_, i) => i !== m), yz.filter((_, i) => i !== m)); loo += (yz[m] - predict(b, X[m])) ** 2; }
  const looR2 = 1 - loo / sst;
  return { n, r2, adj, looR2, sdY: sy, unitY: V[yKey].unit,
    coefs: xKeys.map((key, j) => ({ key, name: V[key].name, beta: beta[j + 1], se: se[j + 1], t: beta[j + 1] / se[j + 1], perUnit: (beta[j + 1] * sy) / sx[j], unit: V[key].unit })),
    residuals: idx.map((i, m) => ({ pref: panel.prefs[i], actual: y[m], fitted: my + sy * predict(beta, X[m]) })).sort((a, b) => Math.abs(b.actual - b.fitted) - Math.abs(a.actual - a.fitted)) };
}
export const corr = (a, b) => { const ma = mean(a), mb = mean(b); let s = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); x += (a[i] - ma) ** 2; y += (b[i] - mb) ** 2; } return s / Math.sqrt(x * y); };
