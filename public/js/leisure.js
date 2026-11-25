// レジャーと温泉:テーマパーク・遊園地の入場者(経済産業省の月ごとの統計、TEA/AECOMの推計)、温泉の宿泊(環境省)、銭湯の数(厚生労働省)を見て、
// 仮想の住民1人ずつに「遊園地などに行く見込み」と「レジャーに使うお金(年・月ごと)」を割り当てる。
// 行く見込みは社会生活基本調査 2021(性別×年齢、世帯の年収)、使うお金は家計調査 2025(世帯主の年齢、年収五分位、月ごと)から引く。
import LD from "./leisure-data.js";
import GEO from "./geo-data.js";
import { regress } from "./regress.js";
import { esc, multiLine, hbar, vbar } from "./charts.js";
import { createJapan3D } from "./japan3d.js";

// 使うお金の項目(家計調査の品目名)
export const LEISURE_ITEMS = [
  { key: "park", item: "遊園地入場・乗物代", label: "遊園地・テーマパーク" },
  { key: "bath", item: "温泉・銭湯入浴料", label: "温泉・銭湯" },
  { key: "stay", item: "宿泊料", label: "宿泊" },
  { key: "pack", item: "国内パック旅行費", label: "国内パック旅行" },
];
// 世帯の年収の区分(社会生活基本調査の夫婦の表)。仮想の住民の年収五分位(0〜4)を、この順に当てはめる(近似。仮定)
const INC = ["300万円未満", "300～499万円", "500～699万円", "700～999万円", "1000万円以上"];
const RATE_AGES = Object.keys(LD.rate["男"]).filter((k) => k !== "総数");
const lowOf = (k) => Number(k.match(/\d+/)[0]);
// 社会生活基本調査の年齢の区分。10歳未満は調べていないので、10〜14歳の値を使う(親と一緒に行くとみなす仮定)
export function rateAge(age) { let key = RATE_AGES[0]; for (const k of RATE_AGES) if (age >= lowOf(k)) key = k; return key; }
// 家計調査の世帯主の年齢の区分
const KA = LD.kakei.age, KQ = LD.kakei.quintile;
function headCol(headAge) { const cols = KA.cols; return headAge < 30 ? cols.indexOf("29歳以下") : headAge < 40 ? cols.indexOf("30～39歳") : headAge < 50 ? cols.indexOf("40～49歳") : headAge < 60 ? cols.indexOf("50～59歳") : headAge < 70 ? cols.indexOf("60～69歳") : cols.indexOf("70歳以上"); }
const headAgeOf = (p) => (p.asChild ? p.age + 30 : Math.max(p.age, 25)); // 親と暮らす子は親を世帯主とみなす(支出・コンビニと同じ考え方)

// 年収による行きやすさの倍率(夫と妻の平均。夫婦の総数を1とする)
function incomeFactor(tier, key) {
  const f = (who) => LD.coupleIncome[who][INC[Math.max(0, Math.min(4, tier ?? 2))]][key] / LD.coupleIncome[who]["総数"][key];
  return (f("夫") + f("妻")) / 2;
}
// 1年に1回以上行く見込み(0〜1)。park:遊園地・動植物園・水族館、day:日帰りの行楽、tour:国内の観光旅行
export function leisureGo(p) {
  const r = LD.rate[p.sex === "female" ? "女" : "男"][rateAge(p.age)], out = {};
  for (const k of ["park", "day", "tour"]) out[k] = Math.min(0.98, (r[k] / 100) * incomeFactor(p.tier, k));
  return out;
}
// 年に使うお金(円/人)。世帯主の年齢の表 × 年収五分位の倍率 ÷ 世帯人員(倍率どうしは独立と仮定)。最後に全体の平均を合わせる
function rawYen(p, it) {
  const c = headCol(headAgeOf(p)), q = 1 + Math.max(0, Math.min(4, p.tier ?? 2));
  return (KA[it.item][c] * (KQ[it.item][q] / KQ[it.item][0])) / KA.members[c];
}
// 月ごとの割合(家計調査 2025年の全国の月ごとの支出から)
export const MONTH_SHARE = Object.fromEntries(LEISURE_ITEMS.map((it) => {
  const m = LD.kakei.monthly[it.item] ?? {}, v = Array.from({ length: 12 }, (_, i) => m[`2025-${String(i + 1).padStart(2, "0")}`] ?? 0), s = v.reduce((a, b) => a + b, 0) || 1;
  return [it.key, v.map((x) => x / s)];
}));
// 仮想の住民の全員に、行く見込みと使うお金を付ける。平均は家計調査の「二人以上の世帯の1人あたり」に合わせる
export function attachLeisure(personas) {
  if (!personas?.length) return personas;
  const W = personas.reduce((a, p) => a + p.weight, 0), scale = {};
  for (const it of LEISURE_ITEMS) {
    const mean = personas.reduce((a, p) => a + p.weight * rawYen(p, it), 0) / W, target = KA[it.item][0] / KA.members[0];
    scale[it.key] = mean > 0 ? target / mean : 1;
  }
  for (const p of personas) {
    const yen = {}; for (const it of LEISURE_ITEMS) yen[it.key] = Math.round(rawYen(p, it) * scale[it.key]);
    p.leisure = { go: leisureGo(p), yen, total: Object.values(yen).reduce((a, b) => a + b, 0) };
  }
  return personas;
}
// その人の財布の、月ごとのレジャーの支出(円)
export const leisureMonthly = (p) => Array.from({ length: 12 }, (_, m) => LEISURE_ITEMS.reduce((a, it) => a + (p.leisure?.yen[it.key] ?? 0) * MONTH_SHARE[it.key][m], 0));

// 大きなテーマパーク(場所。距離の検証と地図に使う)
export const BIG_PARKS = LD.parks.filter((p) => !/ディズニーシー|ドームシティ|サマーランド/.test(p.name));
const rad = (d) => (d * Math.PI) / 180;
export const kmBetween = (a, b) => { const dl = rad(b[1] - a[1]), dn = rad(b[0] - a[0]), h = Math.sin(dl / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
export const nearestParkKm = (lonlat) => Math.min(...BIG_PARKS.map((p) => kmBetween(lonlat, [p.lon, p.lat])));

// 検証:仮想の住民の「年齢・性別・年収」の構成だけで、県ごとの「遊園地などに行った人の割合」をどこまで当てられるか。
// 当てられなかった分が、大きなテーマパークまでの距離で説明できるかも見る(県の平均どうしの関係)
export function prefCheck(personas) {
  const acc = {}; for (const p of personas) { if (p.age < 10 || !p.leisure) continue; const a = (acc[p.prefecture] ??= [0, 0]); a[0] += p.weight * p.leisure.go.park; a[1] += p.weight; }
  const prefs = GEO.prefs.map((g) => g.name).filter((n) => acc[n] && LD.prefRate[n]);
  const pred = prefs.map((n) => (100 * acc[n][0]) / acc[n][1]), real = prefs.map((n) => LD.prefRate[n].park);
  const dist = prefs.map((n) => Math.log(nearestParkKm(GEO.prefs.find((g) => g.name === n).centroid) + 10));
  const m = (v) => v.reduce((a, b) => a + b, 0) / v.length, mp = m(pred), mr = m(real);
  const corr = pred.reduce((s, v, i) => s + (v - mp) * (real[i] - mr), 0) / Math.sqrt(pred.reduce((s, v) => s + (v - mp) ** 2, 0) * real.reduce((s, v) => s + (v - mr) ** 2, 0));
  const mae = m(pred.map((v, i) => Math.abs(v - real[i])));
  const panel = { prefs, vars: { real: { name: "実際の割合", values: real }, pred: { name: "住民の構成からの予測", values: pred }, dist: { name: "大きなテーマパークまでの距離(対数)", values: dist } } };
  const r = regress(panel, "real", ["pred", "dist"]);
  return { prefs, pred, real, corr, mae, reg: r, national: { model: mp, real: LD.prefRate["全国"]?.park } };
}
// 成績表用:全国の行く割合と、1人あたりの支出が統計と合っているか(支出は合わせているので「合わせた結果」)
export function leisureChecks(personas) {
  const adults = personas.filter((p) => p.age >= 10 && p.leisure), W = adults.reduce((a, p) => a + p.weight, 0);
  const rows = [];
  for (const [sex, key] of [["男", "male"], ["女", "female"]]) for (const k of ["park", "tour"]) {
    const g = adults.filter((p) => p.sex === key), w = g.reduce((a, p) => a + p.weight, 0);
    rows.push({ label: `${sex}性の${k === "park" ? "遊園地・動植物園・水族館" : "国内の観光旅行"}に行った人(10歳以上)`, model: g.reduce((a, p) => a + p.weight * p.leisure.go[k], 0) / w, value: LD.rate[sex]["総数"][k] / 100 });
  }
  rows.push({ label: "遊園地などに行った人(10歳以上・全体)", model: adults.reduce((a, p) => a + p.weight * p.leisure.go.park, 0) / W, value: LD.rate["総数"]["総数"].park / 100 });
  return rows;
}

const yen = (v) => `${Math.round(v).toLocaleString("ja-JP")}円`;
const man = (v) => `${(v / 1e4).toLocaleString("ja-JP", { maximumFractionDigits: 0 })}万人`;
export function mountLeisure({ before, getPersonas }) {
  const el = document.createElement("section"); el.id = "tab-leisure"; el.className = "tab";
  const M = LD.meti, mon = (i) => { const [y, m] = M.start.split("-").map(Number), t = y * 12 + m - 1 + i; return [Math.floor(t / 12), (t % 12) + 1]; };
  const yearSum = (arr, y) => arr.reduce((a, v, i) => a + (mon(i)[0] === y ? v : 0), 0);
  const tdrY = Object.keys(LD.tdr).sort(), onY = Object.keys(LD.onsenNat).sort(), bY = Object.keys(LD.bathNat).sort();
  const firstSento = bY.find((y) => LD.bathNat[y].sento != null);
  el.innerHTML = `<div class="page-head"><h1>レジャーと温泉</h1><p>テーマパーク・遊園地の入場者、温泉の宿泊、銭湯の数の長い推移を見ます。仮想の住民1人ずつに、遊園地などに行く見込みと、レジャーに使うお金を割り当て、財布の月ごとの増減に反映します。</p></div>
    <div class="card"><div class="kpis">
      <div class="kpi"><small>東京ディズニーリゾートの入場者(推計)</small><b>${man(LD.tdr[tdrY.at(-1)])}</b><span>${tdrY.at(-1)}年。2019年は${man(LD.tdr["2019"])}、2020年は${man(LD.tdr["2020"])}</span></div>
      <div class="kpi"><small>温泉の延べ宿泊者</small><b>${(LD.onsenNat[onY.at(-1)].overnight_guests_fy / 1e8).toFixed(2)}億人</b><span>${onY.at(-1)}年度。温泉地 ${LD.onsenNat[onY.at(-1)].onsen_areas.toLocaleString("ja-JP")}か所</span></div>
      <div class="kpi"><small>銭湯(一般公衆浴場)の数</small><b>${LD.bathNat[bY.at(-1)].sento.toLocaleString("ja-JP")}軒</b><span>${bY.at(-1)}年度。${firstSento}年は${LD.bathNat[firstSento].sento.toLocaleString("ja-JP")}軒</span></div></div>
      <h3>施設の場所(地図)</h3><div class="form-grid"><label class="wide">地図の色 <select id="ls-color"><option value="onsen">温泉の宿泊(人口1人あたり)</option><option value="park">遊園地などに行った人の割合</option><option value="sento">銭湯の数(人口10万人あたり)</option></select></label></div>
      <div id="ls-map" class="ls-map"></div>
      <p class="note">金色の柱:大きなテーマパーク(高さ=年間の入場者の推計)。点:橙=温泉、桃=遊園地・レジャー施設、緑=動物園・植物園・水族館。点は国土数値情報(2013〜2014年)で、今は閉じた施設が含まれることがあります。</p></div>
    <div class="card"><h2>テーマパーク・遊園地の入場者</h2>
      <h3>大きなテーマパークの年間入場者(推計)</h3><div id="ls-parks"></div>
      <h3>全国の主な遊園地・テーマパークの、月ごとの入場者</h3><div id="ls-meti"></div>
      <h3>月ごとの入場者の割合(2015〜2019年の平均)</h3><div id="ls-season"></div>
      <p class="note">出典:TEA/AECOM「Theme Index」各年版(暦年の推計値。運営会社の公表値ではありません)。ほかに、横浜・八景島シーパラダイス(2013年 ${man(LD.parks.find((p) => p.name.includes("八景島"))?.att["2013"]?.v ?? 0)})、東京サマーランド(2023年 ${man(LD.parks.find((p) => p.name.includes("サマーランド"))?.att["2023"]?.v ?? 0)})の推計があります。富士急ハイランド・サンリオピューロランドなどは入場者の公表値が見つからず、地図では低い柱にしています。ハウステンボスは長崎県の観光統計(2008〜2010年の公式値)で、2011年以降は県の表から外れています。月ごとの値は、経済産業省「特定サービス産業動態統計調査」遊園地・テーマパーク(e-Stat)。売上の大きい施設から全国の約7割をカバーする標本の合計で、全施設の合計ではありません。調査対象の見直しで、2015年などに段差があります(${esc(M.breaks.join("、"))})。東京ディズニーリゾートの運営会社のサイトは自動の取得に応じなかったため、公式の年度ごとの値は入れていません。</p></div>
    <div class="card"><h2>温泉と銭湯</h2><h3>温泉の延べ宿泊者</h3><div id="ls-onsen"></div><h3>公衆浴場の数</h3><div id="ls-bath"></div>
      <p class="note">出典:環境省「温泉利用状況」(年度末。温泉地数は宿泊施設のある場所だけを数える)、厚生労働省「衛生行政報告例」。銭湯=一般公衆浴場(料金が決められた、昔ながらの銭湯)。それ以外には、スーパー銭湯・サウナ・健康ランド・スポーツ施設の浴場などが入ります。</p></div>
    <div class="card"><h2>だれが行き、だれが使うか</h2>
      <h3>遊園地・動植物園・水族館に1年に1回以上行った人(2021年)</h3><div id="ls-age"></div>
      <h3>世帯の年収と、使うお金(二人以上の世帯、1世帯あたり年額、2025年)</h3><div id="ls-inc" class="table-scroll"></div>
      <p class="note">出典:総務省「社会生活基本調査」2021年(2020年10月〜2021年10月の1年間。コロナの流行中なので、ふだんより低めです)、「家計調査」2025年。</p></div>
    <div class="card"><h2>財布への反映:この人なら、いくら使うか</h2>
      <div class="form-grid"><label>性別 <select id="ls-sex"><option value="male">男性</option><option value="female">女性</option></select></label>
        <label>年齢 <input id="ls-agein" type="number" min="0" max="100" value="35"></label>
        <label>世帯の年収 <select id="ls-tier">${INC.map((t, i) => `<option value="${i}"${i === 2 ? " selected" : ""}>${t}(五分位${i + 1})</option>`).join("")}</select></label>
        <label>立場 <select id="ls-child"><option value="0">世帯主・配偶者</option><option value="1">親と暮らす子</option></select></label></div>
      <div id="ls-wallet"></div></div>
    <div class="card"><h2>確かめたこと</h2><div id="ls-check"></div></div>
    <div class="card"><h2>研究でわかっていること</h2><ul class="facts">
      <li>温泉地の商圏はとても狭い。宿泊客の行き先を距離で説明するモデルで、距離の効き方を表す値は5.73と、買い物(約2)よりずっと大きい(味水・鎌田・山内 2012、交通学研究 55号。6つの温泉地のデータ)。</li>
      <li>日帰り温泉の利用は、20代の女性で多く、60歳以上で少ない。1回あたりの平均の支出は4,737円(岩橋 2013。予約サイトの利用者なので、かたよりがあります)。</li>
      <li>国内旅行の所得弾力性は0.538、海外旅行は1.559(長橋・麻生 1999。1993〜97年の旅行会社の売上からの短期の推計)。所得が1%増えると、国内旅行は約0.5%増える、という意味です。</li>
      <li>銭湯の利用者は、65歳以上の一人暮らしや夫婦だけの世帯が中心(田中 2006)。福岡市の銭湯は1973年の168軒から2000年の34軒に減った。</li>
      <li>確認できなかったこと:銭湯の料金を変えたときに利用がどれだけ変わるか(価格弾力性)、テーマパークの来場者の住む県ごとの割合、曜日や天気による入場者の変化を日本で測った研究。</li></ul>
      <p class="note">出典:J-STAGE の各論文(詳しくは「出典と仮定」)。地図の点:${esc("国土数値情報(観光資源 2014年、集客施設 2014年、文化施設 2013年)(国土交通省)を加工して作成。利用条件は非商用")}。</p></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  const popOf = Object.fromEntries(GEO.prefs.map((p) => [p.name, p.pop]));
  const colorOf = (k) => {
    if (k === "onsen") return { label: "温泉の延べ宿泊者(人口1人あたり、年度)", unit: "泊", values: Object.fromEntries(Object.entries(LD.onsenPref).map(([n, v]) => [n, v.guests / (popOf[n] || 1)])) };
    if (k === "park") return { label: "遊園地などに行った人の割合(2021年)", unit: "%", values: Object.fromEntries(Object.entries(LD.prefRate).filter(([n]) => n !== "全国").map(([n, v]) => [n, v.park])) };
    return { label: "銭湯の数(人口10万人あたり)", unit: "軒", values: Object.fromEntries(Object.entries(LD.bathPref).map(([n, v]) => [n, (v.sento / (popOf[n] || 1)) * 1e5])) };
  };
  let points = null;
  const drawMap = async () => {
    if (!points) { try { points = (await import("./leisure-points.js")).default.points; } catch { points = []; } }
    const latest = (p) => { const ys = Object.keys(p.att).sort(); return ys.length ? p.att[ys.at(-1)].v : 0; };
    createJapan3D($("ls-map"), { ...GEO, color: colorOf($("ls-color").value), facilities: { points, big: BIG_PARKS.map((p) => ({ name: p.name, lon: p.lon, lat: p.lat, value: latest(p) })) } }, { people: matchMedia("(max-width: 640px)").matches ? 500 : 1000 });
  };
  $("ls-color").onchange = drawMap;
  const drawWallet = () => {
    const p = { sex: $("ls-sex").value, age: Math.max(0, Math.min(100, Number($("ls-agein").value) || 0)), tier: Number($("ls-tier").value), asChild: $("ls-child").value === "1", weight: 1 };
    const all = getPersonas?.() ?? [], W = all.reduce((a, q) => a + q.weight, 0);
    // 全体の平均に合わせた倍率を、仮想の住民から求める(住民がまだいないときは、倍率1)
    const scale = {}; for (const it of LEISURE_ITEMS) { const mean = W ? all.reduce((a, q) => a + q.weight * rawYen(q, it), 0) / W : 0; scale[it.key] = mean > 0 ? KA[it.item][0] / KA.members[0] / mean : 1; }
    const yenOf = {}; for (const it of LEISURE_ITEMS) yenOf[it.key] = Math.round(rawYen(p, it) * scale[it.key]);
    p.leisure = { go: leisureGo(p), yen: yenOf };
    const m = leisureMonthly(p), tot = Object.values(yenOf).reduce((a, b) => a + b, 0), peak = m.indexOf(Math.max(...m)), low = m.indexOf(Math.min(...m));
    $("ls-wallet").innerHTML = `<div class="analysis"><div class="a-cards">
        <div class="a-card"><small>遊園地・動植物園・水族館に行く見込み</small><b>${(p.leisure.go.park * 100).toFixed(0)}%</b> <i>1年に1回以上</i></div>
        <div class="a-card"><small>国内の観光旅行に行く見込み</small><b>${(p.leisure.go.tour * 100).toFixed(0)}%</b> <i>日帰りの行楽は ${(p.leisure.go.day * 100).toFixed(0)}%</i></div>
        <div class="a-card"><small>レジャーに使うお金(1人・年)</small><b>${yen(tot)}</b> <i>多い月 ${peak + 1}月 ${yen(m[peak])}、少ない月 ${low + 1}月 ${yen(m[low])}</i></div></div>
      ${hbar(LEISURE_ITEMS.map((it) => ({ label: it.label, value: yenOf[it.key] })), { fmt: yen, labelWidth: 150 })}
      <h3>月ごとの、レジャーの支出(財布の増減)</h3>${vbar(m.map((v, i) => ({ label: `${i + 1}`, value: v, on: i === peak })), { fmt: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}千` : `${Math.round(v)}`) })}
      <p class="a-note">行く見込みは、社会生活基本調査(2021年)の性別・年齢の割合に、世帯の年収による違い(夫婦の表)を掛けたものです。10歳未満は調べられていないので、10〜14歳の値を使っています(仮定)。使うお金は、家計調査(2025年)の世帯主の年齢の表に、年収五分位による違いを掛け、世帯の人数で割ったものです(年齢と年収の効果は独立と仮定)。月ごとの割合は、家計調査の2025年の全国の月ごとの支出です。温泉・銭湯の入浴料は、家計調査では「その他の消費支出」に入ります。</p></div>`;
  };
  ["ls-sex", "ls-agein", "ls-tier", "ls-child"].forEach((id) => ($(id).oninput = drawWallet));
  el.addEventListener("lab:open", () => {
    drawWallet();
    if ($("ls-parks").innerHTML) return;
    drawMap();
    const colors = ["#b4473b", "#2f6fd0", "#c9a45c", "#2f8f6b", "#7a2fb0", "#888"];
    const SHORT = { "東京ディズニーランド": "ディズニーランド", "東京ディズニーシー": "ディズニーシー", "ユニバーサル・スタジオ・ジャパン": "USJ", "ナガシマスパーランド": "ナガシマ" };
    const big = LD.parks.filter((p) => SHORT[p.name]);
    $("ls-parks").innerHTML = multiLine(big.map((p, i) => ({ name: SHORT[p.name], color: colors[i % colors.length], points: Object.entries(p.att).map(([y, a]) => ({ x: Number(y), y: a.v / 1e4 })) })), { xLabel: "年", fmt: (v) => `${v.toFixed(0)}万` });
    const years = [...new Set(M.visitors.map((_, i) => mon(i)[0]))];
    $("ls-meti").innerHTML = multiLine([{ name: "入場者(万人/年、標本の合計)", color: "#b4473b", points: years.map((y) => ({ x: y, y: yearSum(M.visitors, y) / 1e4 })) }], { xLabel: "年", fmt: (v) => `${v.toFixed(0)}万` });
    const sh = Array(12).fill(0); for (let y = 2015; y <= 2019; y++) { const t = yearSum(M.visitors, y); M.visitors.forEach((v, i) => { const [yy, mm] = mon(i); if (yy === y) sh[mm - 1] += v / t / 5; }); }
    const pk = sh.indexOf(Math.max(...sh));
    $("ls-season").innerHTML = vbar(sh.map((v, i) => ({ label: `${i + 1}`, value: v * 100, on: i === pk })), { fmt: (v) => `${v.toFixed(1)}` }) + `<p class="note">単位は%(1年の入場者を100としたときの各月の割合)。夏休みの8月が最も多く、2月が最も少ない。</p>`;
    $("ls-onsen").innerHTML = multiLine([{ name: "延べ宿泊者(億人/年度)", color: "#c9a45c", points: onY.map((y) => ({ x: Number(y), y: LD.onsenNat[y].overnight_guests_fy / 1e8 })) }], { xLabel: "年度", fmt: (v) => `${v.toFixed(1)}億` });
    $("ls-bath").innerHTML = multiLine([{ name: "公衆浴場の合計", color: "#2f6fd0", points: bY.map((y) => ({ x: Number(y), y: LD.bathNat[y].total / 1e4 })) }, { name: "うち銭湯", color: "#b4473b", points: bY.map((y) => ({ x: Number(y), y: LD.bathNat[y].sento == null ? null : LD.bathNat[y].sento / 1e4 })) }], { xLabel: "年度", fmt: (v) => `${v.toFixed(1)}万` });
    const ages = RATE_AGES;
    $("ls-age").innerHTML = multiLine([["男", "#2f6fd0"], ["女", "#b4473b"]].map(([s, c]) => ({ name: `${s}性`, color: c, points: ages.map((a) => ({ x: lowOf(a), y: LD.rate[s][a].park / 100 })) })), { xLabel: "年齢" });
    const rows = LEISURE_ITEMS.map((it) => `<tr><td>${esc(it.label)}</td>${KQ[it.item].slice(1).map((v) => `<td class="num">${v.toLocaleString("ja-JP")}</td>`).join("")}<td class="num"><b>×${(KQ[it.item][5] / Math.max(1, KQ[it.item][1])).toFixed(1)}</b></td></tr>`).join("");
    $("ls-inc").innerHTML = `<table class="verify"><tr><th>項目(円/年)</th>${INC.map((_, i) => `<th class="num">五分位${i + 1}</th>`).join("")}<th class="num">高÷低</th></tr>${rows}</table>
      <p class="note">遊園地の支出は、年収の高い世帯ほど大きく増えます(五分位1→5で約20倍)。温泉・銭湯は約2倍で、年収による差が小さい「誰でも使うレジャー」です。</p>`;
    const all = getPersonas?.() ?? [];
    if (all.length && all[0].leisure) {
      const c = prefCheck(all), co = c.reg?.coefs.find((x) => x.key === "dist" || x.name?.includes("距離")) ?? c.reg?.coefs[1];
      const top = c.prefs.map((n, i) => ({ n, d: c.real[i] - c.pred[i] })).sort((a, b) => b.d - a.d);
      $("ls-check").innerHTML = `<ul class="facts"><li>全国:仮想の住民(10歳以上)の「遊園地などに行く見込み」の平均は ${c.national.model.toFixed(1)}%。統計は ${c.national.real}%(2021年)。性別・年齢・年収の割合を統計から入れているので、合うのは当然で、検算です。</li>
        <li>県ごと(当てはめに使っていない比べ方):住民の年齢・性別・年収の構成だけから予測した県の割合と、実際の県の割合の相関は ${c.corr.toFixed(2)}、平均のずれは ${c.mae.toFixed(1)}ポイント。</li>
        <li>予測より実際が高い県:${top.slice(0, 3).map((t) => `${esc(t.n)} ${t.d >= 0 ? "+" : ""}${t.d.toFixed(1)}`).join("、")}。低い県:${top.slice(-3).reverse().map((t) => `${esc(t.n)} ${t.d.toFixed(1)}`).join("、")}(ポイント)。</li>
        ${co ? `<li>大きなテーマパークまでの距離を加えると、距離の係数は ${co.beta >= 0 ? "+" : ""}${co.beta.toFixed(2)}(確かさ t=${co.t.toFixed(1)})。${Math.abs(co.t) >= 2 ? (co.beta < 0 ? "近い県ほど、住民の構成から予想されるより多く行っています。" : "遠い県ほど多く行っている、という予想と逆の結果です。") : "偶然と区別できるほどの差はありません。"}県の平均どうしの関係なので、1人ずつに同じことが言えるとは限りません。</li>` : ""}</ul>`;
    }
  });
  return { tabs: [["leisure", "レジャーと温泉"]] };
}
