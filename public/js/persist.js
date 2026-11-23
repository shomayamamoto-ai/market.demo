// 続けるか、見極めるかのシミュレーター:5つの道から1つを選んで40年働く。
// 向き不向きは、最初のうちは運にまぎれて見えにくい。続ける人と、見切って道を変える人のどちらが実るかを試す。
import { makeRng, clamp } from "./rng.js";

export const PERSIST_ASSUMPTIONS = {
  paths: { value: ["商い", "料理", "畑仕事", "木工", "歌"], note: "5つの道。参考にした実験と同じ" },
  yield: { value: "基本の実り × 相性 × 腕前 + 運のぶれ", note: "1年の実りの決まり方。参考にした実験と同じ" },
  fit: { value: 0.3, note: "相性の差(標準)。人と道の組み合わせごとに、相性 = 1 + この値 × 正規乱数(下限0.2)。参考にした実験の画面の値" },
  skill: { value: 3, note: "一人前の6割の腕前になるまでの年数(標準)。腕前 = 1 − exp(−続けた年数 ÷ τ)。参考にした実験の画面の値" },
  luck: { value: 0.4, note: "運のぶれ(標準)。その年の実りに足す正規乱数の大きさ。参考にした実験の画面の値" },
  switchCost: { value: 1, note: "道を変えた年は、引っ越しで実りがなくなる。腕前は、その道を続けた年数だけで決まる(戻れば前の腕前から続く)" },
  types: { value: "6つの動き方", note: "愚直:最初の道を続ける。3年さん:決めた年数ごとに、同じ年数の仲間の平均より下なら道を変える(1回成功したら続ける)。てんてん:それを毎年やる。見極め:腕前の伸びを差し引いて相性を見積もり、はっきり低いと分かったら変える。残り年数が少なくなったら変えない。はやり:去年いちばん実った道へ移る。迷子:毎年3割の確率で、理由なく道を変える。参考にした実験の説明から組み立てた仮の動き方" },
  basis: { value: "仮定(結果は合わせ込んでいない)", note: "参考にした実験の最終結果は分からないため、このシナリオの結果は係数を合わせ込んでいない。動き方の決まりと世界の条件だけから出てくる結果" },
};
const TYPES = [["stay", "愚直", "#4a7fb5"], ["judge", "見極め", "#2f8f6b"], ["three", "3年さん", "#c9a45c"], ["hop", "てんてん", "#b4473b"], ["trend", "はやり", "#8a6fb3"], ["lost", "迷子", "#8b93a7"]];

export const persist = {
  key: "persist", title: "続けるか、見極めるか", years: 40, xLabel: "年", runs: 6, initial: "base",
  lead: "「石の上にも三年」と「合わなければ早く見切る」。どちらが実るかを、6つの動き方で40年比べます。",
  note: "5つの道(商い・料理・畑仕事・木工・歌)から1つを選んで働きます。1年の実りは「相性 × 腕前 + 運のぶれ」で決まります。<br>最初の数年は腕前が低く運のぶれが大きいので、向いている道と向いていない道を取り違えやすくなります。道を変えた年は、実りがありません。",
  assumptions: PERSIST_ASSUMPTIONS,
  presets: {
    base: { label: "A 標準(相性の差0.3、3年で6割、運のぶれ0.4)", rules: { fit: 0.3, skill: 3, luck: 0.4, cut: 3 } },
    wide: { label: "B 向き不向きがはっきり(相性の差0.5)", rules: { fit: 0.5, skill: 3, luck: 0.4, cut: 3 } },
    flat: { label: "C 向き不向きが小さい(相性の差0.1)", rules: { fit: 0.1, skill: 3, luck: 0.4, cut: 3 } },
    slow: { label: "D 腕前が伸びるのが遅い(12年で6割)", rules: { fit: 0.3, skill: 12, luck: 0.4, cut: 3 } },
    noisy: { label: "E 運のぶれが大きい(0.8)", rules: { fit: 0.3, skill: 3, luck: 0.8, cut: 3 } },
    short: { label: "F 残りが15年しかない", rules: { fit: 0.3, skill: 3, luck: 0.4, cut: 3 }, years: 15 },
  },
  params: [{ key: "fit", label: "相性の差", value: 0.3, min: 0, max: 1, step: 0.05 }, { key: "skill", label: "6割の腕前になるまで(年)", value: 3, min: 1, max: 20 }, { key: "luck", label: "運のぶれ", value: 0.4, min: 0, max: 2, step: 0.1 }, { key: "cut", label: "3年さんが見切る年数", value: 3, min: 1, max: 10 }],
  charts: [{ title: "それまでの実りの合計(1人あたり)", fmt: "num1", lines: TYPES.map(([k, name, color]) => ({ key: k, name, color })) }],
  metrics: [...TYPES.map(([k, name]) => ({ key: k, label: name, fmt: "num1", sub: "実りの合計(1人あたり)" })), { key: "bestStay", label: "愚直:いちばん合う道にいる人", fmt: "pct" }, { key: "bestJudge", label: "見極め:いちばん合う道にいる人", fmt: "pct" }, { key: "topStay", label: "上位1%に入った人のうち愚直", fmt: "pct", sub: "6つの動き方が同じ人数なら17%が目安" }],
  advise(m, r) {
    const rank = TYPES.map(([k, name]) => [name, m[k]]).sort((a, b) => b[1] - a[1]);
    const out = [`いちばん実ったのは「${rank[0][0]}」(${rank[0][1].toFixed(1)})、次が「${rank[1][0]}」(${rank[1][1].toFixed(1)})でした。いちばん少なかったのは「${rank[5][0]}」(${rank[5][1].toFixed(1)})です。`];
    out.push(`いちばん合う道にいる人は、愚直が${Math.round(m.bestStay * 100)}%(5つからでたらめに選ぶと20%)、見極めが${Math.round(m.bestJudge * 100)}%です。`);
    if (m.topStay > 0.2) out.push(`上位1%に入った人のうち${Math.round(m.topStay * 100)}%が愚直です。たまたま合う道を引いて続けた人が目立つので、「続ければ報われる」という話が残りやすくなります。`);
    if (r.fit <= 0.15) out.push("向き不向きの差が小さいと、道を変えても得るものが少なく、変えた年の実りを失う分だけ損になります。");
    if (r.skill >= 8) out.push("腕前が伸びるのに時間がかかる世界では、見切るのが早すぎると、どの道でも一人前になれません。");
    if (r.luck >= 0.7) out.push("運のぶれが大きいと、1年や2年の結果では向き不向きが分かりません。早く見切る人ほど、取り違えが増えます。");
    out.push("どの条件でも、理由なく動く「迷子」と、去年の結果だけを追う「はやり」は実りが少なくなりがちです。動くかどうかより、何を根拠に動くかで差がつきます。");
    return out;
  },
  run(r, seed, years) {
    const rng = makeRng(seed), N = 300, P = 5, tau = r.skill / Math.log(2.5), sk = (t) => 1 - Math.exp(-t / tau);
    const people = TYPES.flatMap(([type]) => Array.from({ length: N }, () => { const fit = Array.from({ length: P }, () => Math.max(0.2, 1 + r.fit * rng.normal())); const path = Math.floor(rng.next() * P);
      return { type, fit, path, exp: Array(P).fill(0), sum: 0, hist: [], tried: new Set([path]), settled: false, est: Array(P).fill(null), best: fit.indexOf(Math.max(...fit)) }; }));
    const series = [], lastAvg = Array(P).fill(1);
    for (let t = 1; t <= years; t++) {
      const got = Array(P).fill(0), cnt = Array(P).fill(0), byExp = new Map();
      for (const p of people) {
        if (p.moving) { p.moving = false; p.y = 0; p.hist = []; continue; } // 引っ越しの年は実りなし
        p.exp[p.path]++;
        p.y = p.fit[p.path] * sk(p.exp[p.path]) + r.luck * rng.normal();
        p.sum += p.y; p.hist.push(p.y); got[p.path] += p.y; cnt[p.path]++;
        const key = p.exp[p.path]; if (!byExp.has(key)) byExp.set(key, [0, 0]); const b = byExp.get(key); b[0] += p.y; b[1]++;
      }
      for (let k = 0; k < P; k++) if (cnt[k]) lastAvg[k] = got[k] / cnt[k];
      const move = (p, to) => { if (to === p.path) return; p.path = to; p.tried.add(to); p.moving = true; };
      const fresh = (p) => { const rest = [...Array(P).keys()].filter((k) => !p.tried.has(k)); return rest.length ? rest[Math.floor(rng.next() * rest.length)] : null; };
      for (const p of people) {
        if (p.moving || t >= years) continue;
        const e = p.exp[p.path], peer = byExp.get(e), peerAvg = peer ? peer[0] / peer[1] : 0;
        if (p.type === "lost") { if (rng.next() < 0.3) move(p, Math.floor(rng.next() * P)); }
        else if (p.type === "trend") { const hot = lastAvg.indexOf(Math.max(...lastAvg)); if (hot !== p.path && rng.next() < 0.5) move(p, hot); }
        else if (p.type === "three" || p.type === "hop") {
          const n = p.type === "hop" ? 1 : Math.round(r.cut);
          if (!p.settled && p.hist.length >= n && p.hist.length % n === 0) { const mine = p.hist.slice(-n).reduce((a, b) => a + b, 0) / n; if (mine >= peerAvg) p.settled = true; else { const to = fresh(p); if (to == null) p.settled = true; else move(p, to); } }
        } else if (p.type === "judge") {
          // 腕前の伸びを差し引いて相性を見積もる。年数がたつほど、見積もりの確かさが増す
          let num = 0, den = 0; p.hist.forEach((y, i) => { const s = sk(e - p.hist.length + i + 1); num += y * s; den += s * s; });
          const est = den ? num / den : 1, se = den ? r.luck / Math.sqrt(den) : 9; p.est[p.path] = est;
          const left = years - t, payback = 1 + r.skill; // 残りが少ないと、変えても取り返せない
          if (!p.settled && left > payback * 2 && est + 1.0 * se < 1) { const to = fresh(p); if (to != null) move(p, to); else { const known = p.est.map((v, k) => [v ?? -9, k]).sort((a, b) => b[0] - a[0])[0][1]; p.settled = true; move(p, known); } }
          else if (est - 1.0 * se > 1) p.settled = true;
        }
      }
      const row = { x: t }; for (const [k] of TYPES) { const g = people.filter((p) => p.type === k); row[k] = g.reduce((a, p) => a + p.sum, 0) / g.length; } series.push(row);
    }
    const z = series[series.length - 1], share = (type) => { const g = people.filter((p) => p.type === type); return g.filter((p) => p.path === p.best).length / g.length; };
    const top = [...people].sort((a, b) => b.sum - a.sum).slice(0, Math.ceil(people.length * 0.01));
    return { series, summary: { ...Object.fromEntries(TYPES.map(([k]) => [k, z[k]])), bestStay: share("stay"), bestJudge: share("judge"), topStay: top.filter((p) => p.type === "stay").length / top.length } };
  },
};
