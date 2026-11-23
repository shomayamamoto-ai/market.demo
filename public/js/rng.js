// 再現できる乱数(同じシード値なら毎回同じ結果になる)
export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // 正規分布(平均0・標準偏差1)
  const normal = () => {
    const u = Math.max(next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  // 重みに比例して1つ選ぶ
  const pick = (items, weightOf) => {
    let total = 0;
    for (const it of items) total += weightOf(it);
    let r = next() * total;
    for (const it of items) {
      r -= weightOf(it);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  };
  return { next, normal, pick };
}

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
