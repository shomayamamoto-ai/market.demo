// 国の仕組みのシミュレーター:民主主義の国4つと社会主義の国4つを、同じ条件から300年動かす。
// 投資の多さ、計画の読み違え、新しい技術、クーデターや反乱が、暮らしの豊かさをどう分けるかを試す。
import { makeRng, clamp } from "./rng.js";
import { thin } from "./stage3d.js";

export const REGIME_ASSUMPTIONS = {
  start: { value: { people: 5000, income: 30 }, note: "最初の人口と、1人あたりの年間所得(万円)。8か国とも同じ。参考にした実験と同じ" },
  invest: { value: { socialist: 0.0138, democracy: 0.0112 }, note: "工場・学校・病院への投資が生む成長(年率、最初の時点)。社会主義は投資の割合を高く決められる。仮定" },
  limit: { value: 276, note: "投資だけで伸ばせる限界の目安(万円)。所得がこの水準に近づくほど、同じ投資で伸びる幅が小さくなる(技術と働き手の限界)。仮定" },
  planError: { value: { per: 900, max: 0.8 }, note: "社会主義の計画の読み違え。所得 ÷ per の割合だけ投資がむだになる(上限 max)。経済が大きく複雑になるほど読み違える。仮定" },
  innovation: { value: 0.00406, note: "市場の競争が生む新しさ。所得が最初の何倍になったかの対数 × この係数だけ、成長が上乗せされる(豊かになるほど新しいものが生まれやすい)。仮定" },
  innovationCap: { value: 0.0128, note: "新しさによる成長の上乗せの上限(年率)。仮定" },
  coup: { value: { base: 0.0572, scale: 17.4, loss: 0.113 }, note: "民主主義のクーデター・内戦。貧しいほど起きやすく(年の確率 = base × exp(−(所得−30) ÷ scale))、起きると所得が loss の割合だけ減り、3年間は成長が止まる。仮定" },
  revolt: { value: { base: 0.012, envy: 0.05, loss: 0.03 }, note: "社会主義の反乱。豊かになって隣の陣営の暮らしが見えるほど増える(年の確率 = base + envy ×(民主主義の所得 ÷ 自国の所得 − 0.6)、所得50万円から)。仮定" },
  war: { value: { socialist: 0.012, democracy: 0.004 }, note: "同じ陣営の国どうしの戦争が起きる確率(1か国・1年あたり)。仮定" },
  famine: { value: 0.006, note: "社会主義で、計画の読み違えから食料が足りなくなる確率(1年あたり、読み違えの大きさに比例して増える)。仮定" },
  deaths: { value: { coup: 0.0105, revolt: 0.036, war: 0.03, famine: 0.066 }, note: "1回の出来事で失う人口の割合。仮定。300年の犠牲が、社会主義 約1万6千人・民主主義 約5,600人になるよう決めた" },
  birth: { value: 0.003, note: "人口の自然な伸び(年率)。仮定" },
  calibration: { value: "参考にした実験の値に合わせて調整", note: "上の係数は、100年目の所得、逆転の年、300年目の所得、犠牲者の数が、参考にした実験に近づくように決めた。現実の国の歴史に合わせたものではない" },
};

export const regime = {
  key: "regime", title: "国の仕組み", years: 300, xLabel: "年", runs: 30, initial: "base",
  lead: "投資を国が決める仕組みと、選挙と市場に任せる仕組み。同じ条件から始めて、300年でどちらの暮らしが豊かになるかを試します。",
  note: "民主主義の国4つと、社会主義の国4つ。どの国も、人口5,000人・1人あたりの年間所得30万円から始めます。<br>社会主義は投資を多く決められますが、経済が大きくなるほど計画を読み違えます。民主主義は、貧しいうちはクーデターや内戦で成長が止まります。",
  assumptions: REGIME_ASSUMPTIONS,
  presets: {
    base: { label: "A 標準", rules: {} },
    noCoup: { label: "B 民主主義からクーデターをなくす", rules: { noCoup: 1 } },
    noError: { label: "C 社会主義が計画を間違えない", rules: { noError: 1 } },
    innovate: { label: "D 社会主義が市場並みに新しさを生む", rules: { innovate: 1 } },
    both: { label: "E 社会主義がCとDの両方を満たす", rules: { noError: 1, innovate: 1 } },
  },
  charts: [{ title: "1人あたりの年間所得(万円)", fmt: "num0", lines: [{ key: "dem", name: "民主主義(4か国の平均)", color: "#4a7fb5" }, { key: "soc", name: "社会主義(4か国の平均)", color: "#b4473b" }] },
    { title: "戦争・内戦・反乱・飢饉の犠牲(累計、人)", fmt: "num0", lines: [{ key: "deadDem", name: "民主主義", color: "#4a7fb5" }, { key: "deadSoc", name: "社会主義", color: "#b4473b" }] }],
  metrics: [{ key: "dem100", label: "100年目:民主主義の所得", fmt: "man0" }, { key: "soc100", label: "100年目:社会主義の所得", fmt: "man0" },
    { key: "dem300", label: "300年目:民主主義の所得", fmt: "man0" }, { key: "soc300", label: "300年目:社会主義の所得", fmt: "man0" },
    { key: "cross", label: "民主主義が追い抜く年", fmt: "num0", sub: "追い抜かない回は300年として平均" }, { key: "crossed", label: "追い抜いた回の割合", fmt: "pct" },
    { key: "deadSoc", label: "犠牲:社会主義", fmt: "people", sub: "300年の累計" }, { key: "deadDem", label: "犠牲:民主主義", fmt: "people", sub: "300年の累計" }],
  reference: { base: { dem100: 50, soc100: 70, dem300: 700, soc300: 350, cross: 205, deadSoc: 16000, deadDem: 5600 }, noCoup: { cross: 72 } },
  advise(m, r) {
    const out = [];
    if (m.crossed > 0.9) out.push(`最初の100年は社会主義が先を行きます(${Math.round(m.soc100)}万円と${Math.round(m.dem100)}万円)。しかし${Math.round(m.cross)}年目ごろに民主主義が追い抜き、300年目には${Math.round(m.dem300)}万円と${Math.round(m.soc300)}万円になりました。`);
    else if (m.crossed < 0.1) out.push(`この条件では、300年たっても社会主義が上回りました(300年目:${Math.round(m.soc300)}万円と${Math.round(m.dem300)}万円)。`);
    else out.push(`追い抜くかどうかは、試行によって分かれました(追い抜いたのは${Math.round(m.crossed * 100)}%)。`);
    if (r.noCoup) out.push("クーデターが無ければ、逆転はずっと早まります。民主主義の弱点は、仕組みそのものより、貧しい時期の政情不安にあります。");
    if (r.noError && !r.innovate) out.push("計画を間違えなくても、投資だけで伸ばせる限界にぶつかります。新しい技術が生まれないと、伸びは止まっていきます。");
    if (r.innovate && !r.noError) out.push("新しさを生めても、経済が大きくなるほど計画の読み違えが投資をむだにします。");
    if (r.noError && r.innovate) out.push("「計画を間違えない」と「市場並みに新しさを生む」の両方がそろって、はじめて社会主義が上回ります。どちらも、現実には満たすのが難しい条件です。");
    out.push("会社に置きかえると、トップが投資先を決める方式は立ち上げに強く、規模が大きく複雑になるほど、現場の競争と試行錯誤に任せる方式が強くなる、という読み方ができます。");
    return out;
  },
  run(r, seed, years) {
    const A = REGIME_ASSUMPTIONS, rng = makeRng(seed), S = A.start.value;
    const nations = Array.from({ length: 8 }, (_, i) => ({ dem: i < 4, y: S.income, pop: S.people, stall: 0 }));
    const dead = { dem: 0, soc: 0 }, series = []; let cross = null;
    const avg = (dem) => { const g = nations.filter((n) => n.dem === dem); return g.reduce((a, n) => a + n.y, 0) / g.length; };
    const kill = (n, share) => { const d = n.pop * share; n.pop -= d; dead[n.dem ? "dem" : "soc"] += d; };
    for (let t = 0; t <= years; t++) {
      const yd = avg(true), ys = avg(false);
      if (cross == null && t > 20 && yd > ys) cross = t;
      series.push({ x: t, dem: yd, soc: ys, deadDem: dead.dem, deadSoc: dead.soc });
      for (const n of nations) {
        const novelty = Math.min(A.innovationCap.value, A.innovation.value * Math.log(Math.max(n.y, S.income) / S.income)), room = 1 / (1 + n.y / A.limit.value);
        let g;
        if (n.dem) {
          g = A.invest.value.democracy * room + novelty;
          if (!r.noCoup && rng.next() < A.coup.value.base * Math.exp(-(n.y - S.income) / A.coup.value.scale)) { n.y *= 1 - A.coup.value.loss; n.stall = 3; kill(n, A.deaths.value.coup); }
          if (rng.next() < A.war.value.democracy) { n.y *= 0.95; kill(n, A.deaths.value.war); }
        } else {
          const err = r.noError ? 0 : Math.min(A.planError.value.max, n.y / A.planError.value.per);
          g = (A.invest.value.socialist * room + (r.innovate ? novelty : 0)) * (1 - err); // 読み違えは、投資にも新しい技術の使い道にも響く
          if (n.y > 50 && rng.next() < A.revolt.value.base + A.revolt.value.envy * clamp(yd / n.y - 0.6, 0, 1.5)) { n.y *= 1 - A.revolt.value.loss; kill(n, A.deaths.value.revolt); }
          if (rng.next() < A.war.value.socialist) { n.y *= 0.95; kill(n, A.deaths.value.war); }
          if (rng.next() < A.famine.value * (0.5 + 3 * err)) kill(n, A.deaths.value.famine);
        }
        if (n.stall > 0) { n.stall--; g = 0; }
        n.y *= 1 + g + 0.004 * rng.normal();
        n.pop *= 1 + A.birth.value;
      }
    }
    const at = (y) => series[Math.min(y, years)], z = series[years];
    return { series, summary: { dem100: at(100).dem, soc100: at(100).soc, dem300: z.dem, soc300: z.soc, cross: cross ?? years, crossed: cross == null ? 0 : 1, deadSoc: z.deadSoc, deadDem: z.deadDem, lead100: at(100).soc > at(100).dem ? 1 : 0 } };
  },
  frames(r, seed, years) {
    const frames = thin(this.run(r, seed, years).series).map((s) => ({ label: `${s.x}年目`,
      caption: `${s.x}年目:1人あたりの所得は、民主主義 ${Math.round(s.dem)}万円、社会主義 ${Math.round(s.soc)}万円。犠牲の累計は ${Math.round(s.deadDem).toLocaleString("ja-JP")}人と ${Math.round(s.deadSoc).toLocaleString("ja-JP")}人。`,
      gauges: [{ label: "民主主義の所得", text: `${Math.round(s.dem)}万円`, value: clamp(s.dem / 700, 0, 1), color: "#4a7fb5" }, { label: "社会主義の所得", text: `${Math.round(s.soc)}万円`, value: clamp(s.soc / 700, 0, 1), color: "#b4473b" }],
      zones: [{ name: "民主主義の暮らし", color: "#4a7fb5", count: clamp(s.dem / 2.5, 4, 300), build: "hall" }, { name: "社会主義の暮らし", color: "#b4473b", count: clamp(s.soc / 2.5, 4, 300), build: "factory" }] }));
    return { frames, opts: { unit: "軒", figure: "house", sub: "家の数は、1人あたりの所得の大きさを表します。" } };
  },
};
