// 同じ県の中で、選挙の回ごとの変化どうしを比べる(二方向固定効果)。
// 県ごとの土地柄(もともと投票率が高い・自民党が強い など)と、回ごとの全国の流れ(その年の風)を両方取り除き、
// 「その県で、いつもより投票率が低かった回に、得票率がどう動いたか」だけを見る。
export function twoWay(panel, yPrefix, xPrefix, years) {
  const P = panel.prefs, V = panel.vars, cell = (pre, y, i) => V[`${pre}${y}`]?.values[i];
  const rows = [];
  for (let i = 0; i < P.length; i++) for (const y of years) { const a = cell(yPrefix, y, i), b = cell(xPrefix, y, i); if (a != null && b != null) rows.push({ i, y, a, b }); }
  // 県の平均と回の平均を引く(つり合いのとれた表なので、引いて全体の平均を足せば二方向の固定効果になる)
  const m = (f) => rows.reduce((s, r) => s + f(r), 0) / rows.length, ga = m((r) => r.a), gb = m((r) => r.b);
  const byI = new Map(), byY = new Map();
  for (const r of rows) { for (const [map, k] of [[byI, r.i], [byY, r.y]]) { const o = map.get(k) ?? { a: 0, b: 0, n: 0 }; o.a += r.a; o.b += r.b; o.n++; map.set(k, o); } }
  const da = rows.map((r) => r.a - byI.get(r.i).a / byI.get(r.i).n - byY.get(r.y).a / byY.get(r.y).n + ga), db = rows.map((r) => r.b - byI.get(r.i).b / byI.get(r.i).n - byY.get(r.y).b / byY.get(r.y).n + gb);
  const sxy = da.reduce((s, v, k) => s + v * db[k], 0), sxx = db.reduce((s, v) => s + v * v, 0), beta = sxy / sxx;
  const res = da.map((v, k) => v - beta * db[k]), dof = rows.length - P.length - years.length; // 県と回の数だけ自由度が減る
  // 県ごとにまとめた(クラスター)標準誤差:同じ県の回どうしの相関を考える
  let meat = 0; for (const i of new Set(rows.map((r) => r.i))) { let s = 0; rows.forEach((r, k) => { if (r.i === i) s += db[k] * res[k]; }); meat += s * s; }
  const se = Math.sqrt(meat) / sxx, G = new Set(rows.map((r) => r.i)).size, adj = Math.sqrt((G / (G - 1)) * ((rows.length - 1) / dof));
  return { beta, se: se * adj, t: beta / (se * adj), n: rows.length, prefs: G, years: years.length };
}
