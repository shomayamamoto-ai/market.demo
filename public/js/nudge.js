// 行動を変える工夫:ご褒美・ポイント・約束・呼びかけ・伝え方などが、続けている間と、やめた後にどれだけ効くかを、研究の値で並べる。
// 値はすべて data/raw/behavior_change.json(論文・行政資料から読み取ったもの)。

// 続け方による効果の残り方(やめた時点の効果を100%として、やめてからの月数ごとの残り)
export const DECAY = [
  { key: "cash", label: "現金のご褒美(ジムに通うたびに約1,500円)", during: "通う回数が約2倍(+18〜20ポイント)", pts: [[0, 100], [1, 25], [3, 0], [12, 0]], source: "Royer, Stehr & Sydnor(NBER w18580、米国)" },
  { key: "commit", label: "ご褒美 + 自分でお金を預ける約束", during: "同上。ただし約束を選んだのは12.4%だけ", pts: [[0, 100], [1, 45], [12, 25]], source: "同上(1年後も対照より+25%)" },
  { key: "points", label: "歩くと買い物ポイント(仙台、日本)", during: "1日 +1,650歩(対照 +514歩)", pts: [[0, 100], [0.75, 33], [3, 0]], source: "Tanji ほか 2020(無作為化比較試験)。日本の14事業のまとめでも、終了後の効果は残らない(Aoki 2026)" },
  { key: "price", label: "混む時間帯だけ電気料金を上げる(日本)", during: "ピークの使用量 −14〜17%", pts: [[0, 100], [3, 47]], source: "Ito, Ida & Tanaka 2018(京都の実験。3か月後も −7.4%)" },
  { key: "report", label: "ご近所と比べた省エネのお知らせ(毎月)", during: "使用量 約−2%", pts: [[0, 100], [12, 85], [24, 70]], source: "Allcott & Rogers 2014(米国。2年続けた後、効果の減り方は年10〜20%)" },
  { key: "smoke", label: "禁煙のご褒美", during: "やめられる見込み 2.48倍", pts: [[0, 100], [6, 34]], source: "Giles ほか 2014 メタ分析(倍率 2.48 → 6か月後 1.50。倍率から1を引いた部分の残り)" },
];
// 一度きりの工夫(その時の上乗せ)
export const ONESHOT = [
  ["申請しなくても届く無料クーポン(風しんの抗体検査、日本)", "+約16ポイント", "RIETI DP 22-J-011"],
  ["損を強調した通知(大腸がん検診、八王子市)", "22.7% → 29.9%(+7.2ポイント)", "厚生労働省 受診率向上施策ハンドブック"],
  ["受ける日時を書き込ませる(インフルエンザの予防接種)", "33.1% → 37.1%(+4.0ポイント)", "Milkman ほか 2011(米国)"],
  ["人の役に立つと伝える(風しんの検査)", "「受けたい」+14.3ポイント、実際の受検は+7.5ポイント(約半分)", "RIETI DP 22-J-010"],
  ["お願いの呼びかけ(節電、日本)", "1回目 −8%、2回目 −3.2%、3回目はほぼ0", "Ito, Ida & Tanaka 2018"],
  ["医師への届出をうながす通知(日本)", "直後に+20〜44ポイント、3か月後は0", "J-STAGE の研究"],
  ["自分で記録する(歩数計 + 目標)", "目標だけで1日+約600歩。続けている間+926歩、約3か月後+413歩", "Vetrovsky 2022 メタ分析"],
];
export function remainingAt(key, months) { const d = DECAY.find((x) => x.key === key); if (!d) return null; const P = d.pts; if (months <= P[0][0]) return P[0][1]; for (let i = 1; i < P.length; i++) if (months <= P[i][0]) { const [x0, y0] = P[i - 1], [x1, y1] = P[i]; return y0 + ((y1 - y0) * (months - x0)) / (x1 - x0); } return P.at(-1)[1]; }

import { esc, multiLine } from "./charts.js";
export function mountNudge({ before }) {
  const el = document.createElement("section"); el.id = "tab-nudge"; el.className = "tab";
  el.innerHTML = `<div class="page-head"><h1>行動を変える工夫</h1><p>ご褒美・ポイント・約束・呼びかけ・伝え方などの工夫が、続けている間と、やめた後にどれだけ効くかを、研究の値で比べます。</p></div>
    <div class="card"><h2>やめた後に、効果はどれだけ残るか</h2><div id="nd-decay"></div>
      <div class="table-scroll"><table class="verify"><tr><th>工夫</th><th>続けている間の効果</th><th class="num">やめて3か月後の残り</th><th>出典</th></tr>${DECAY.map((d) => `<tr><td>${esc(d.label)}</td><td>${esc(d.during)}</td><td class="num"><b>${Math.round(remainingAt(d.key, 3))}%</b></td><td><small>${esc(d.source)}</small></td></tr>`).join("")}</table></div>
      <p class="a-headline">お金やポイントのご褒美は、続けている間はよく効きますが、やめると数週間〜数か月でほぼ消えます。料金の仕組みや、毎月のお知らせのように「続く仕組み」にしたものは、効果が残りやすい。</p>
      <p class="note">やめた時点の効果を100%として、その後の残りを、研究の測定点のあいだを直線で結んで描いています(測定点のあいだの形は推測です)。</p></div>
    <div class="card"><h2>一度きりの工夫の効果</h2><div class="table-scroll"><table class="verify"><tr><th>工夫</th><th>効果</th><th>出典</th></tr>${ONESHOT.map(([a, b, c]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td><small>${esc(c)}</small></td></tr>`).join("")}</table></div></div>
    <div class="card"><h2>研究でわかっていること</h2><ul class="facts">
      <li>自分を縛る約束(お金を預ける、など)は効くが、選ぶ人は少ない。ジムの約束12.4%、禁煙のお金を預ける約束13.7%(ふつうのご褒美は90%が受け入れる。Halpern ほか 2015)。</li>
      <li>日本の歩数のポイント事業:1日10円でも100円でも、効果はほぼ同じ(平均+997歩)。ポイントの額を上げても効果は増えにくい(Aoki 2026、14事業のまとめ)。</li>
      <li>くじ(毎日の抽選)と、お金を預ける約束は、16週間で体重を約6kg減らしたが、終わった後に戻り、7か月後には差がなかった(Volpp ほか 2008)。</li>
      <li>ゲーム化は、短いほど効果が大きく見える。1週間未満 1.57標準偏差、20週まで 0.30、数年では −0.20(教育のメタ分析)。連続記録の表示をやめると、100日続く人の割合が4.4%から2.0%に下がった(GitHub の例)。</li>
      <li>「計画を書き込む」工夫の効果は、最初の研究(0.65)より、最近のメタ分析の方がずっと小さい(飲酒 0.14、運動 0.25)。</li>
      <li>確認できなかったこと:目標設定のメタ分析(Harkin 2016、Epton 2017)、積立を自動で増やす仕組み(SMarT)、ポイントカードの効果のメタ分析、マイナポイントの利用率。接続を許可していないサイトにあるか、読み取りがブロックされました。</li></ul>
      <p class="note">このツールの「オリジナルの実験」や「お題と市場規模」の結果は、ご褒美やキャンペーンを「続けている間」の効果に近いものです。やめた後の売上を考えるときは、この画面の残り方を目安にしてください。</p></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`);
  el.addEventListener("lab:open", () => {
    if ($("nd-decay").innerHTML) return;
    const colors = ["#b4473b", "#c9a45c", "#2f8f6b", "#2f6fd0", "#7a2fb0", "#888"], months = Array.from({ length: 25 }, (_, i) => i / 2);
    $("nd-decay").innerHTML = multiLine(DECAY.map((d, i) => ({ name: { cash: "現金", commit: "約束つき", points: "ポイント", price: "料金", report: "お知らせ", smoke: "禁煙" }[d.key], color: colors[i], points: months.filter((m) => m <= d.pts.at(-1)[0] || d.pts.at(-1)[1] === 0).map((m) => ({ x: m, y: remainingAt(d.key, m) / 100 })) })), { xLabel: "やめてからの月数" });
  });
  return { tabs: [["nudge", "行動を変える工夫"]] };
}
