// 「お題から探す」の目次と、「精度の成績表」(このツールの計算を、統計・理論・実験と照らし合わせた一覧)。
import { trial, formatMetric } from "./lab.js";
import { validate, jointChecks } from "./personas.js";
import { buyProbability, MARKET_ASSUMPTIONS } from "./market.js";
import { runMany, DEFAULT_PLAN, DIFFUSION_ASSUMPTIONS } from "./diffusion.js";

// 画面ごとの「何を確かめる道具か」と、探すときの言葉。basis は数字の根拠の種類
export const CATALOG = [
  { tab: "newstation", title: "新駅・リニアの試算", desc: "地図で場所を選ぶと、周りの人口・見込みの乗降客数・地価の変化の目安。リニアの駅も選べる", basis: "公的統計", words: "新駅 駅 リニア 中央新幹線 新幹線 出店 立地 商売 売上 地価 乗降客数 駅勢圏 人口 メッシュ" },
  { tab: "japanmap", title: "日本地図で見る", desc: "都道府県の3D地図に数字を色で塗り、住民が実際の旅客の流れに沿って移動する", basis: "公的統計", words: "地図 日本地図 3D 都道府県 移動 旅客 流れ 鉄道 新幹線 飛行機 駅 乗降客数" },
  { tab: "travel", title: "空と陸の移動", desc: "国内線の路線ごとの利用、バスの推移、鉄道が速くなったら飛行機からどれだけ移るか", basis: "公的統計", words: "飛行機 航空 路線 空港 LCC バス 高速バス 新幹線 鉄道 移動 交通 リニア 4時間" },
  { tab: "education", title: "進学と学歴", desc: "高校卒業後の進路、専門学校の人気分野、国公立大学の倍率、卒業後の就職・大学院、学歴ごとの賃金", basis: "公的統計", words: "進学 大学 専門学校 短大 倍率 志願 入試 共通テスト 就職 大学院 院進 学歴 賃金 学費" },
  { tab: "cvs", title: "コンビニの利用", desc: "だれがコンビニでいくら使うか(2004〜2024年)と、業界の販売額・店舗数", basis: "公的統計", words: "コンビニ コンビニエンスストア 中食 弁当 たばこ 来店 客単価 店舗 小売 一人暮らし" },
  { tab: "marriage", title: "結婚と出生", desc: "出会い方・交際・結婚の意思と、出生率を「結婚する人の割合 × 夫婦の子どもの数」に分けた試算", basis: "公式推計", words: "結婚 婚約 婚活 出会い マッチングアプリ 交際 恋人 出生 出生率 少子化 子ども 保育 児童手当" },
  { tab: "workfin", title: "企業と転職", desc: "1960年度からの企業の売上・利益と、転職した人がどの業種・規模からどこへ移ったか", basis: "公的統計", words: "企業 会社 売上 利益 純利益 経常利益 労働分配率 転職 離職 中途 勤続 残業 業種 規模 賃金" },
  { tab: "weather", title: "天気と暮らし", desc: "47都道府県の65年分の雨・晴れ・気温と、家計の支出や移動との関係", basis: "公的統計", words: "天気 雨 晴れ 日照 気温 暑さ 寒さ 雪 気候 温暖化 灯油 外食 衣料 移動 電車 気象" },
  { tab: "composite", title: "複合要因の分析", desc: "人口構成・所得・交通・災害が、投票や買い物にどう効くかを都道府県で調べる", basis: "公的統計", words: "要因 複合 回帰 都道府県 地域 投票率 組織票 得票率 支出 灯油 外食 車 鉄道 保険 雨 天気" },
  { tab: "labormkt", title: "労働市場", desc: "失業率・求人倍率・賃金・最低賃金・年収の壁・2040年の働き手の見通しを、公的統計の長い推移と研究で見る", basis: "公的統計", words: "労働 雇用 失業 求人 有効求人倍率 人手不足 賃金 実質賃金 春闘 賃上げ 最低賃金 非正規 パート 年収の壁 103万円 130万円 扶養 M字カーブ 女性 高齢者 外国人労働者 2040年 労働力" },
  { tab: "mind", title: "心の状態", desc: "住民ごとの性格(ビッグファイブ)・生活満足度・孤独感・心理的苦痛を、日本の調査から作り、照合する", basis: "公的統計", words: "心理 性格 ビッグファイブ 幸福 幸福度 満足度 孤独 孤立 ストレス うつ メンタル K6 外向 内向 神経症 勤勉 開放性" },
  { tab: "purchase", title: "買う気持ち", desc: "消費者の気分の推移、買うときのクセ、給付金を配ったらどれだけ使われるかを試算する", basis: "公的統計", words: "購買意欲 消費意欲 消費者マインド 消費者態度指数 景気 給付金 補助金 減税 消費税 駆け込み 値引き 特売 限定 衝動買い 物価 インフレ 年金" },
  { tab: "crime", title: "犯罪と消費者被害", desc: "犯罪・万引き・特殊詐欺・消費者被害・再犯の推移と、詐欺にだまされやすい心理・取り締まりの効果の研究", basis: "公的統計", words: "犯罪 犯罪心理 詐欺 特殊詐欺 オレオレ詐欺 SNS 投資詐欺 ロマンス詐欺 万引き 窃盗 消費者被害 悪質商法 再犯 治安 防犯 高齢者 見守り" },
  { tab: "leisure", title: "レジャーと温泉", desc: "テーマパーク・温泉・銭湯の利用と場所を地図で見て、住民ごとの行く見込みと、月ごとのレジャーの支出を出す", basis: "公的統計", words: "レジャー テーマパーク 遊園地 ディズニー USJ ハウステンボス 温泉 銭湯 スパ サウナ 旅行 観光 入場者 季節 夏休み 財布" },
  { tab: "insurance", title: "保険と災害", desc: "地震のあと、被災した県で地震保険の加入がどれだけ増え、どのくらい続いたか", basis: "公的統計", words: "保険 地震保険 火災保険 生命保険 災害 地震 台風 豪雨 被災 加入率 備え 防災" },
  { tab: "custom", title: "オリジナルの実験", desc: "お題と選択肢を自分で決めて、誰がどれを選ぶかを試す。結果は決まっていない", basis: "文献値と仮定", words: "自分 オリジナル 自由 制度 導入 選択 選ぶ どれ 比較 案 施策 福利厚生 働き方 週休 在宅 リモート 料金 プラン 切り替え 乗り換え 賛成 反対" },
  { tab: "people", title: "人口とペルソナ", desc: "年齢・就業・年収・支出まで、仮想の1人ずつを見る", basis: "公的統計", words: "人口 年齢 世帯 年収 所得 ペルソナ 顧客像 ターゲット 高齢 若者 単身 地域 都道府県" },
  { tab: "market", title: "市場の規模感", desc: "費目別・年代別に、家計が毎月いくら使っているかを見る", basis: "公的統計", words: "市場規模 支出 家計 消費 業界 売上 食費 教育 医療 娯楽 需要" },
  { tab: "future", title: "将来の人口を計算する", desc: "出生率や外国人の受け入れを変えて、2070年までの人口を計算する", basis: "公式推計", words: "将来 人口減少 少子化 高齢化 出生率 移民 外国人 労働力 人手不足 2050 2070 見通し" },
  { tab: "takehome", title: "手取りと負担", desc: "年収から税と社会保険料を引いた手取りを、1人ずつ計算する", basis: "公的統計", words: "手取り 税金 所得税 住民税 社会保険料 年金 健康保険 負担 可処分所得 給料 年収 天引き 国民負担率" },
  { tab: "ctax", title: "消費税を変える", desc: "消費税率を変えると、だれの負担がどれだけ変わるか", basis: "公的統計", words: "消費税 減税 増税 軽減税率 食料品 ゼロ 物価 負担 逆進性 税収 財源" },
  { tab: "vote", title: "選挙と世代", desc: "年代ごとの人口と投票率から、どの年代の票が多いかを出す", basis: "公的統計", words: "選挙 投票率 若者 高齢者 シルバー民主主義 世代 有権者 政治 票 衆院選 参院選" },
  { tab: "seats", title: "得票と議席", desc: "各党の得票率が変わると、衆議院の議席数がどう変わるかを試算する", basis: "公的統計", words: "議席 得票率 政党 選挙 衆議院 比例代表 小選挙区 ドント 過半数 与党 野党 政権 解散 総選挙" },
  { tab: "sim", title: "お題と市場規模", desc: "商品の価格とターゲットから、買う人数と市場規模を試算する", basis: "公的統計", words: "新商品 企画 価格 値段 サービス 売れる 買う 市場規模 ターゲット 事業計画 新規事業 サブスク" },
  { tab: "spread", title: "発売後の広がり", desc: "発売から利用者がどう増えるかを、広告費や口コミを変えて試す", basis: "仮定", words: "発売 普及 広告 口コミ 利用者 成長 売上予測 損益 黒字 マーケティング 販促" },
  { tab: "visual", title: "3Dシミュレーション", desc: "日本地図の人の移動、商品の選ばれ方、職場・税・下請け・経済などを、条件を変えて3Dで動かす", basis: "仮定", words: "3D 動き 見る 比較 AB テスト プレゼン デモ" },
  { tab: "game", title: "経営ゲーム", desc: "価格・広告・品質を毎期決めて、会社を経営してみる", basis: "仮定", words: "経営 ゲーム 意思決定 価格 広告 練習 研修" },
  { tab: "report", title: "レポート", desc: "企画検討・社内・金融機関・投資家向けに、結果を文書にまとめる", basis: "仮定", words: "レポート 資料 事業計画書 融資 銀行 投資家 社内 稟議 提案書 返済" },
  { tab: "org", title: "職場のルール", desc: "給与の決め方と仕事の回し方が、エースの働き方をどう変えるか", basis: "動画の実験値", words: "人事 評価 給与 歩合 定額 残業 離職 退職 エース 優秀 やる気 モチベーション 組織 働き方 コンサル 不公平" },
  { tab: "tax", title: "税率と助け合い", desc: "税率と再分配の仕組みが、挑戦する人の数をどう変えるか", basis: "動画の実験値", words: "税 再分配 福祉 保険 補助金 挑戦 リスク 社会保障 負担 手数料" },
  { tab: "chain", title: "多重下請け", desc: "予算が現場に届くまでに抜かれる段階の数が、品質をどう変えるか", basis: "動画の実験値", words: "下請け 中抜き 外注 委託 マージン 建設 IT 品質 納期 手抜き 代理店 予算" },
  { tab: "economy", title: "物価と賃金", desc: "物価と賃金のずれが、消費と雇用をどう変えるか", basis: "動画の実験値", words: "物価 インフレ 賃金 賃上げ 給料 失業 不景気 給付金 消費 節約 景気" },
  { tab: "labor", title: "人手不足", desc: "人が来ないのは人口のせいか、報酬と負担の引き算のせいか", basis: "動画の実験値", words: "人手不足 採用 求人 応募 来ない 賃金 給料 待遇 外国人 助っ人 派遣 自動化 省人化 設備投資 離職 定着 過労" },
  { tab: "maker", title: "工場と工房", desc: "大量生産と少量生産、品質にいくらかけるか。固定費と品質コストで比べる", basis: "動画の実験値", words: "品質 不良 クレーム 返品 検査 原価 固定費 変動費 損益分岐 大量生産 少量 職人 工場 コスト 管理会計 成長市場 縮小" },
  { tab: "regime", title: "国の仕組み", desc: "トップが投資を決める方式と、競争に任せる方式。300年でどちらが豊かになるか", basis: "動画の実験値", words: "民主主義 社会主義 計画 市場 競争 トップダウン 中央集権 分権 投資 成長 イノベーション 統制" },
  { tab: "elders", title: "長寿の村", desc: "危機を覚えている人がいる組織と、いない組織。備えの差を試す", basis: "動画の実験値", words: "高齢者 ベテラン 経験 記憶 継承 引き継ぎ 危機 備え 災害 備蓄 定年 世代交代 ノウハウ" },
  { tab: "persist", title: "続けるか、見極めるか", desc: "続ける人と、見切って道を変える人。どちらが実るか", basis: "仮定", words: "転職 キャリア 継続 石の上にも三年 見切り 向き不向き 適性 才能 努力 異動 撤退 やめる 続ける" },
  { tab: "town", title: "貯金と町", desc: "みんなが貯めると町の仕事がどうなるか", basis: "動画の実験値", words: "貯金 貯蓄 節約 消費 銀行 投資 景気 地域 商店街 お金の流れ" },
  { tab: "island", title: "交換と略奪", desc: "交換・略奪・仕返しのどれが、長い目で栄えるか", basis: "動画の実験値", words: "取引 交渉 競争 協力 奪う 信頼 仕返し 貿易 提携 パートナー" },
  { tab: "council", title: "村の決め方", desc: "1人で決める、話し合う、選挙で選ぶ。どれが当たりやすいか", basis: "理論", words: "意思決定 会議 多数決 トップダウン 合議 選挙 リーダー 社長 ガバナンス 噂 決め方" },
  { tab: "climb", title: "学び方", desc: "試し方・振り返り方の違いで、どこまで上達するか", basis: "動画の実験値", words: "学習 成長 練習 改善 PDCA 試行錯誤 振り返り 研修 上達 スキル" },
  { tab: "queue", title: "窓口の待ち行列", desc: "窓口や担当者を1人変えると、待ち時間がどう変わるか", basis: "理論", words: "待ち時間 行列 窓口 レジ コールセンター 受付 人員 シフト 混雑 予約 店舗 病院" },
  { tab: "contagion", title: "口コミと感染の広がり", desc: "1人が何人に伝えると、全体に広がるか", basis: "理論", words: "口コミ バズ 拡散 SNS 感染 流行 紹介 噂 バイラル" },
  { tab: "schelling", title: "住み分け", desc: "弱い好みでも、集団がはっきり分かれてしまう仕組み", basis: "理論", words: "分断 住み分け 派閥 部署 グループ 偏り 多様性 似た者" },
  { tab: "stock", title: "仕入れ量", desc: "売れ残りと売り逃しを比べて、いちばん得な仕入れ量を出す", basis: "理論", words: "在庫 仕入れ 発注 廃棄 ロス 売り切れ 欠品 食品 小売 需要予測" },
  { tab: "laffer", title: "税率と税収", desc: "税率を上げると、税収がどこで頭打ちになるか", basis: "理論", words: "税率 税収 増税 減税 手数料率 料率 取り分 働く意欲" },
  { tab: "commons", title: "みんなで出し合う", desc: "ただ乗りで協力が崩れる仕組みと、それを防ぐ仕組み", basis: "実験", words: "協力 ただ乗り フリーライダー 共同 チーム 罰 評価 相互チェック 共有 貢献" },
  { tab: "split", title: "分け前の交渉", desc: "立場に差がある交渉で、どんな提案が通るか", basis: "実験", words: "交渉 値引き 単価 取り分 配分 公平 決裂 提案 条件" },
  { tab: "tournament", title: "協力か裏切りか", desc: "長い付き合いで、どんな方針が最後に得をするか", basis: "実験", words: "取引先 長期 信頼 裏切り 協力 競合 価格競争 報復 関係" },
  { tab: "threshold", title: "みんながやるなら自分も", desc: "新しい制度や商品が、全体に広がるかどうかの分かれ目", basis: "実験", words: "導入 浸透 定着 社内展開 流行 同調 様子見 新制度 ツール 変革" },
];
export const BASIS_NOTE = {
  文献: "マーケティングの文献の推定値と照合", 調査: "実際の調査と照合(係数は合わせ込んでいない)", 文献値と仮定: "文献の推定値と仮定で計算し、実際の調査と照合",
  公的統計: "国の統計と照合", 公式推計: "国の公式推計と照合", 理論: "数式の理論値と照合", 実験: "論文の実験結果と照合",
  動画の実験値: "参考にした実験動画の値に合わせて調整(現実との照合ではない)", 仮定: "仮定にもとづく試算(照合先なし)",
};

// お題の文章から、合いそうな画面を探す(言葉が含まれているかを数えるだけの単純な方法)
export function findScreens(text) {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  return CATALOG.map((c) => {
    let score = 0;
    for (const w of `${c.words} ${c.title}`.toLowerCase().split(/\s+/)) if (w && q.includes(w)) score += w.length;
    for (const part of q.split(/[\s、。,.・/]+/)) if (part.length >= 2 && `${c.words}${c.title}${c.desc}`.toLowerCase().includes(part)) score += part.length;
    return { ...c, score };
  }).filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
}

// 精度の成績表:全モデルの照合を一度に走らせ、1行ずつ返す
export function scoreboard(D, personas, groups, seed = 1) {
  const rows = [];
  for (const t of validate(D, personas)) { const f = (v) => (Math.abs(v) < 1 ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString("ja-JP")); rows.push({ basis: "公的統計", model: "人口とペルソナ", label: t.label, a: f(t.model), b: f(t.value), diff: t.error }); }
  // 年齢×性別の組み合わせの照合。ずれが「人数が有限なので偶然でも出る大きさ」の1.5倍以内なら合格
  for (const j of jointChecks(D, personas)) {
    if (j.impossible != null) { rows.push({ basis: "公的統計", model: "人口とペルソナ", label: j.label, a: `${j.count}人`, b: "0人", diff: j.impossible, inRange: j.count === 0, source: "制度上ありえない組み合わせ(合成人口の検証で見る標準の指標の1つ)" }); continue; }
    rows.push({ basis: "公的統計", model: "人口とペルソナ", label: `${j.label}:${j.cells}マスの平均のずれ`, a: `${j.rmse.toFixed(1)}ポイント`, b: `偶然で${j.chance.toFixed(1)}ポイント`, diff: j.rmse / 100, inRange: j.rmse <= j.chance * 1.5,
      source: `${j.source}。いちばん大きいずれは${j.worst.band}(この計算${(j.worst.model * 100).toFixed(1)}%、統計${(j.worst.real * 100).toFixed(1)}%)。人数を増やすと偶然のずれは小さくなる` }); }
  for (const { basis, defs } of groups) for (const def of defs) for (const [key, p] of Object.entries(def.presets)) {
    const years = p.years ?? def.years, summary = trial(def, p.rules, def.runs ?? 20, seed, years).summary;
    for (const v of def.verify?.(summary, p.rules) ?? []) {
      if (v.label.startsWith("参考")) continue;
      const row = { basis: def.verifyHead === "公式推計" ? "公式推計" : def.verifyHead ? "実験" : "理論", model: `${def.title}:${p.label}`, label: v.label, a: formatMetric(v, v.model), b: v.theoryText ?? formatMetric(v, v.theory) };
      if (v.range) row.inRange = v.model >= v.range[0] && v.model <= v.range[1];
      else if (Number.isFinite(v.theory) && Math.abs(v.theory) > 1e-9) { row.diff = v.model / v.theory - 1; if (v.fmt.startsWith("pct")) row.points = (v.model - v.theory) * 100; }
      else continue;
      rows.push(row);
    }
    const ref = def.reference?.[key];
    if (ref && basis === "動画の実験値") for (const [k, target] of Object.entries(ref)) {
      const m = def.metrics.find((x) => x.key === k); if (!m || summary[k] == null || !target) continue;
      rows.push({ basis, model: `${def.title}:${p.label}`, label: m.label, a: formatMetric(m, summary[k]), b: formatMetric(m, target), diff: summary[k] / target - 1 });
    }
  }
  // 継続率:利用を始めた人が、1年後・2年後・3年後にどれだけ残っているか(解約率 月3%のとき)
  const T = DIFFUSION_ASSUMPTIONS.churnShape.value; let alive = 1; const surv = [];
  for (let m = 1; m <= 36; m++) { alive *= 1 - 0.03 * (m <= 12 ? T[0] : m <= 24 ? T[1] : T[2]); if (m % 12 === 0) surv.push(alive); }
  [0.631, 0.468, 0.382].forEach((real, i) => rows.push({ basis: "文献", model: "発売後の広がり", label: `利用を始めた人が${i + 1}年後に残っている割合`, a: `${(surv[i] * 100).toFixed(1)}%`, b: `${(real * 100).toFixed(1)}%`, diff: surv[i] / real - 1, source: "Fader & Hardie (2007) の定額制サービスの継続率の例(確かさ:中)。この値に合うように係数を決めた" }));
  return rows;
}

// マーケティングの文献値との照合:値上げと広告に対する、モデル全体としての反応を測って比べる
export function marketingChecks(D, personas, seed = 1) {
  const product = { name: "検算用の商品", category: "food", price: 3000, perYear: 12, target: { ageMin: 20, ageMax: 69, sex: "all" }, appeal: { novelty: 0.3, health: 0.3, quality: 0.2, cheap: 0 }, baseInterest: 0.12 };
  const buyers = (price) => personas.reduce((a, p) => a + p.weight * buyProbability(p, { ...product, price, refPrice: 3000 }), 0), b0 = buyers(3000), rows = [];
  const up = (buyers(3030) / b0 - 1) / 0.01, down = (buyers(2970) / b0 - 1) / 0.01, E = MARKET_ASSUMPTIONS.brandElasticity.value;
  rows.push({ basis: "文献", model: "お題と市場規模", label: "相場から1%値上げしたときの、買う人の減り方", a: `${up.toFixed(2)}%`, b: `−${E}%`, diff: up / -E - 1, source: "Bijmolt, van Heerde & Pieters (2005) の価格弾力性のメタ分析(平均−2.62)" });
  rows.push({ basis: "文献", model: "お題と市場規模", label: "相場から1%値下げしたときの、買う人の増え方", a: `+${down.toFixed(2)}%`, b: `+${E}%`, diff: down / E - 1, source: "同上" });
  const total = (ad) => runMany(D, personas, product, { ...DEFAULT_PLAN, ad: { tv: 0, net: ad, store: 0 } }, { months: 36, runs: 12, seed: seed + 2 }).series.reduce((a, x) => a + x.revenue.mid, 0);
  const el = [1e7, 3e7].map((ad) => Math.log(total(ad * 2) / total(ad)) / Math.log(2)), mean = (el[0] + el[1]) / 2, lit = DIFFUSION_ASSUMPTIONS.adExponent.value;
  rows.push({ basis: "文献", model: "発売後の広がり", label: "広告費を2倍にしたときの、3年間の売上の伸び方(弾力性)", a: mean.toFixed(2), b: `0.12〜${lit}`, inRange: mean >= 0.06 && mean <= 0.3, diff: mean / lit - 1, points: (mean - lit) * 100, source: "Sethuraman, Tellis & Briesch (2011) の広告弾力性のメタ分析(長期0.24、短期0.12)。月1,000万円と3,000万円の2点で測った平均" });
  return rows;
}
