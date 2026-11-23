// 将来人口を自前で計算する(コーホート要因法)。
// 2025年の男女・各歳の人口から出発し、毎年「1歳年を取る・亡くなる・生まれる・国境を越えて出入りする」を当てはめる。
// 国の公式推計(社人研 令和5年推計、出生中位・死亡中位)と同じ考え方で、結果を公式推計と照合できる。
import C from "./cohort-data.js";

const BANDS = ["15-19", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49"];
export const FUTURE_ASSUMPTIONS = {
  base: { value: "2025年 男女・各歳", note: "出発点の人口。社人研の推計の2025年の値(実績の人口推計より約29万人多い)" },
  mortality: { value: "令和7年簡易生命表", note: "年齢ごとの死亡率。2025年の実績" },
  improve: { value: C.improve, note: "死亡率が毎年下がる率(男・女)。2070年の平均寿命が社人研の仮定(男85.89年、女91.94年)に合うよう、全年齢一律の率として逆算した。社人研は年齢ごとに違う率を使っており、ここが近似" },
  pattern: { value: "2025年の実績", note: "何歳で産むかの割合。人口動態統計の出生数を日本人女性人口で割って計算。将来も変わらないと仮定" },
  womenShare: { value: C.japaneseWomenShare, note: "出生率は日本人女性を分母にした値のため、総人口の女性に当てはめるときに掛ける割合(2025年の15〜49歳で、日本人女性÷女性全体)。将来も一定と仮定" },
  newcomer: { value: 0.5, note: "2026年以降に入国する女性の出生率を、日本人女性の何倍とするか。出典のない仮定。0にすると2070年の人口は公式推計より1.3%少なく、1にすると2.5%多くなる" },
  maleShare: { value: C.maleShare, note: "生まれる子のうち男の割合。社人研の仮定(女100に対して男105.2)" },
  migrants: { value: C.migrants, note: "外国人の入国超過(年、男・女)。社人研の2040年までの仮定。2041年以降は、総人口に対する割合を2040年のまま一定とする(社人研は男女・年齢別の率を一定とする)" },
  japanese: { value: "0", note: "日本人の出入国は、差し引きゼロと仮定(社人研は年齢別の率を使う。規模は小さい)" },
};

// 1回分の推計。rules: tfr(0なら社人研の仮定の道筋)、migrants(万人/年)、improve(0/1)
export function project(rules, toYear = 2070) {
  const pop = { male: [...C.base.male], female: [...C.base.female] }, rows = [];
  const snap = (year, births, deaths) => {
    let young = 0, work = 0, old = 0;
    for (const s of ["male", "female"]) pop[s].forEach((n, a) => { if (a < 15) young += n; else if (a < 65) work += n; else old += n; });
    rows.push({ x: year, total: young + work + old, young, work, old, births, deaths, pop: { male: [...pop.male], female: [...pop.female] } });
  };
  snap(C.baseYear, 0, 0);
  let total2040 = 1, newcomers = Array(101).fill(0); // 2026年以降に入国した女性(出生率の分母に入れない)
  const scale = rules.migrants * 10000 / (C.migrants.male + C.migrants.female);
  for (let year = C.baseYear + 1; year <= toYear; year++) {
    const k = year - C.baseYear, last = rows[rows.length - 1].total;
    if (year === 2041) total2040 = last;
    const mig = scale * (year > 2040 ? last / total2040 : 1); // 2041年以降は、人口に対する割合を一定にする(社人研と同じ考え方)
    const tfr = rules.tfr > 0 ? rules.tfr : C.tfrMedium[year] ?? C.tfrMedium[2070];
    // 出生:その年の15〜49歳の女性(年の初めと終わりの平均)に、年齢別の出生率を掛ける
    const next = { male: Array(101).fill(0), female: Array(101).fill(0) }, prevNew = newcomers; let deaths = 0;
    for (const s of ["male", "female"]) {
      const f = rules.improve ? (1 - C.improve[s]) ** k : 1;
      for (let a = 0; a <= 100; a++) {
        const q = a === 100 ? Math.min(1, 1 / (C.ex100[s] / f + 0.5)) : Math.min(1, C.qx[s][a] * f);
        const live = pop[s][a] * (1 - q); deaths += pop[s][a] * q;
        next[s][Math.min(100, a + 1)] += live;
      }
      if (s === "female") { const aged = Array(101).fill(0); for (let a = 0; a < 100; a++) aged[a + 1] = newcomers[a] * (1 - Math.min(1, C.qx.female[a] * f)); newcomers = aged; }
    }
    let births = 0;
    BANDS.forEach((b, i) => { const rate = tfr * C.japaneseWomenShare * C.fertilityPattern[b] / 5; for (let a = 15 + i * 5; a < 20 + i * 5; a++) births += rate * (pop.female[a] + next.female[a] - (1 - FUTURE_ASSUMPTIONS.newcomer.value) * (prevNew[a] + newcomers[a])) / 2; });
    for (const s of ["male", "female"]) {
      const f = rules.improve ? (1 - C.improve[s]) ** k : 1, b = births * (s === "male" ? C.maleShare : 1 - C.maleShare), q0 = C.qx[s][0] * f;
      next[s][0] = b * (1 - q0 * 0.9); deaths += b * q0 * 0.9; // 0歳の死亡は生まれてすぐに集中する
      for (let a = 0; a <= 100; a++) next[s][a] = Math.max(0, next[s][a] + C.migrants[s] * mig * C.migrantShare[s][a]);
      if (s === "female") for (let a = 0; a <= 100; a++) newcomers[a] = Math.max(0, newcomers[a] + C.migrants.female * mig * C.migrantShare.female[a]);
      pop[s] = next[s];
    }
    snap(year, births, deaths);
  }
  return rows;
}

export const future = {
  key: "future", title: "将来の人口を計算する", years: 2070, xLabel: "年", runs: 1, initial: "medium",
  lead: "出生率や外国人の受け入れを変えると、日本の人口と年齢構成がどう変わるかを、国の推計と同じ方法で計算します。",
  note: "2025年の男女・各歳の人口から、毎年「年を取る・亡くなる・生まれる・出入国する」を当てはめます(コーホート要因法)。<br>くじを使わない計算なので、同じ条件なら毎回同じ結果です。",
  verifyTitle: "国の公式推計との照合", verifyHead: "公式推計",
  verifyNote: "公式推計:国立社会保障・人口問題研究所「日本の将来推計人口(令和5年推計)」出生中位・死亡中位。ずれは、死亡率の下がり方を全年齢一律にしていること、入国した女性の出生率を仮定で置いていること、日本人の出入国を入れていないことから生じます。",
  assumptions: FUTURE_ASSUMPTIONS,
  presets: {
    medium: { label: "A 社人研の仮定に合わせる(出生率1.27→1.36)", rules: { tfr: 0, migrants: 16.4, improve: 1 } },
    actual: { label: "B 出生率が2025年の実績1.14のまま", rules: { tfr: 1.14, migrants: 16.4, improve: 1 } },
    high: { label: "C 出生率が1.8に上がる", rules: { tfr: 1.8, migrants: 16.4, improve: 1 } },
    closed: { label: "D 外国人の入国超過がゼロ", rules: { tfr: 0, migrants: 0, improve: 1 } },
    open: { label: "E 外国人の入国超過が年50万人", rules: { tfr: 0, migrants: 50, improve: 1 } },
  },
  params: [{ key: "tfr", label: "合計特殊出生率(0=社人研の仮定の道筋)", value: 0, min: 0, max: 4, step: 0.01 }, { key: "migrants", label: "外国人の入国超過(万人/年)", value: 16.4, min: -50, max: 200, step: 0.1 }, { key: "improve", label: "寿命の延び(1=社人研の仮定、0=今のまま)", value: 1, min: 0, max: 1 }],
  charts: [{ title: "人口(万人)", fmt: "num0", lines: [{ key: "totalMan", name: "総人口", color: "#3b2a27" }, { key: "workMan", name: "15〜64歳", color: "#2f8f6b" }, { key: "oldMan", name: "65歳以上", color: "#b4473b" }, { key: "youngMan", name: "0〜14歳", color: "#4a7fb5" }] },
    { title: "生まれる人と亡くなる人(万人/年)", fmt: "num0", lines: [{ key: "birthsMan", name: "出生", color: "#4a7fb5" }, { key: "deathsMan", name: "死亡", color: "#8b93a7" }] }],
  metrics: [{ key: "p2050", label: "2050年の総人口", fmt: "man" }, { key: "p2070", label: "2070年の総人口", fmt: "man" }, { key: "oldShare", label: "2070年の65歳以上の割合", fmt: "pct1" }, { key: "work2070", label: "2070年の15〜64歳", fmt: "man" },
    { key: "support", label: "2070年:65歳以上1人を支える15〜64歳", fmt: "num2", sub: "2025年は2.00人" }, { key: "births2070", label: "2070年の出生数", fmt: "man" }],
  verify(m, r) {
    if (r.tfr !== 0 || r.migrants !== 16.4 || !r.improve) return [];
    const o = C.official, row = (y, key, label) => ({ label, model: m[`${key}${y}`], theory: o[y][key] * 1000, fmt: "man" });
    return [row(2030, "total", "2030年の総人口"), row(2040, "total", "2040年の総人口"), row(2050, "total", "2050年の総人口"), row(2060, "total", "2060年の総人口"), row(2070, "total", "2070年の総人口"),
      row(2070, "young", "2070年の0〜14歳"), row(2070, "work", "2070年の15〜64歳"), row(2070, "old", "2070年の65歳以上"),
      { label: "2050年の出生数", model: m.births2050, theory: C.officialVital[2050][0] * 1000, fmt: "man" }, { label: "2050年の死亡数", model: m.deaths2050, theory: C.officialVital[2050][1] * 1000, fmt: "man" }];
  },
  advise(m, r) {
    const out = [`2070年の人口は約${Math.round(m.p2070 / 1e6) / 100}億人、2025年(1億2,326万人)の${Math.round(m.p2070 / C.official[2025].total / 10)}%です。`];
    out.push(`65歳以上1人を支える15〜64歳は、2025年の2.00人から${m.support.toFixed(2)}人になります。`);
    if (r.tfr >= 1.6) out.push("出生率が上がっても、働く世代が増え始めるのは約20年後です。2050年ごろまでの労働力不足は、出生率ではほとんど変わりません。");
    if (r.migrants >= 40) out.push("入国超過は20〜30代に集中するため、働く世代にすぐ効きます。一方で、受け入れ体制(住居・教育・言語)の費用は、この計算に入っていません。");
    if (r.migrants === 0) out.push("社人研の推計は、年16万人の外国人の入国超過を前提にしています。これが無いと、人口はさらに速く減ります。");
    out.push("市場規模の見通しに使うときは、人数だけでなく年齢構成の変化(顧客の中心が何歳になるか)を見てください。");
    return out;
  },
  run(r) {
    const rows = project(r), at = (y) => rows.find((x) => x.x === y), z = at(2070), sum = {};
    for (const y of [2030, 2040, 2050, 2060, 2070]) { const s = at(y); Object.assign(sum, { [`total${y}`]: s.total, [`young${y}`]: s.young, [`work${y}`]: s.work, [`old${y}`]: s.old }); }
    return { series: rows.map((s) => ({ x: s.x, totalMan: s.total / 1e4, workMan: s.work / 1e4, oldMan: s.old / 1e4, youngMan: s.young / 1e4, birthsMan: s.births / 1e4, deathsMan: s.deaths / 1e4 })).map((s) => (s.x === 2025 ? { ...s, birthsMan: C.officialVital[2030][0] / 10, deathsMan: C.officialVital[2030][1] / 10 } : s)),
      summary: { ...sum, p2050: at(2050).total, p2070: z.total, oldShare: z.old / z.total, work2070: z.work, support: z.work / z.old, births2070: z.births, births2050: at(2050).births, deaths2050: at(2050).deaths } };
  },
  frames(r) {
    const frames = project(r).filter((s) => (s.x - 2025) % 5 === 0).map((s) => ({ label: `${s.x}年`, caption: `${s.x}年:総人口 ${Math.round(s.total / 1e4).toLocaleString("ja-JP")}万人。0〜14歳 ${Math.round(s.young / 1e4).toLocaleString("ja-JP")}万人、15〜64歳 ${Math.round(s.work / 1e4).toLocaleString("ja-JP")}万人、65歳以上 ${Math.round(s.old / 1e4).toLocaleString("ja-JP")}万人。`,
      zones: [{ name: "0〜14歳", color: "#4a7fb5", count: s.young / 4e5, build: "house" }, { name: "15〜64歳", color: "#2f8f6b", count: s.work / 4e5, build: "office" }, { name: "65歳以上", color: "#b4473b", count: s.old / 4e5, build: "houses" }],
      gauges: [{ label: "総人口(2025年比)", text: `${Math.round(s.total / C.official[2025].total / 10)}%`, value: s.total / C.official[2025].total / 1000, color: "#c9a45c" }] }));
    return { frames, opts: { sub: "人形1体が約40万人。", maxFigures: 320 } };
  },
};
