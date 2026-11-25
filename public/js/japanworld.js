// 3Dの日本地図に入れる「人の住む場所・空港・航路・訪日外国人」のデータをまとめる。
// ・住む場所:国勢調査2020の人口(約10kmのます目)
// ・空港と国内線:国土交通省 航空輸送統計・空港管理状況調書(2025年。国内線は路線ごとの旅客数、国際線は空港ごとの乗降客数)
// ・訪日外国人:観光庁 宿泊旅行統計(県ごとの外国人の泊数)を、県の中で観光向けの宿泊・飲食の従業者に比例して配った推計(pop-grid.js)、
//   国・地域ごとの入国者(法務省 出入国管理統計 2025年、短期滞在の新規入国)、クルーズ客の割合(観光庁)
import PG from "./pop-grid.js";
import TD from "./travel-data.js";
import IB from "./inbound-data.js";

// 主なクルーズ船の寄港地と、主な長距離フェリーの航路(一般に知られている所在地。利用者数の公的データは無いため、表示のためだけに使う)
export const CRUISE_PORTS = [["博多港", 130.40, 33.61], ["那覇港", 127.67, 26.22], ["横浜港", 139.67, 35.45], ["神戸港", 135.19, 34.68], ["長崎港", 129.87, 32.74], ["鹿児島港", 130.57, 31.59], ["石垣港", 124.16, 24.34], ["大阪港", 135.43, 34.65]];
export const FERRY_ROUTES = [["苫小牧", 141.63, 42.63, "大洗", 140.58, 36.31], ["小樽", 141.00, 43.20, "新潟", 139.06, 37.94], ["大阪南港", 135.42, 34.62, "別府", 131.50, 33.30], ["神戸", 135.25, 34.66, "新門司", 130.99, 33.87], ["名古屋", 136.85, 35.05, "仙台", 141.03, 38.26], ["東京", 139.79, 35.62, "徳島", 134.58, 34.07], ["鹿児島", 130.57, 31.59, "那覇", 127.67, 26.22]];
// 国・地域の方角(地図の外から飛んでくる向き。東を0度、反時計回り)。表示のための目安
const REGION_DIR = { "East Asia": 190, "Southeast Asia": 215, "South Asia": 230, "Central Asia": 250, "Middle East": 255, Europe: 300, Africa: 245, "North America": 20, "Latin America": 0, Oceania: 300 - 160 };

let cache = null;
export function japanWorld() {
  if (cache) return cache;
  const Y = "2025", ap = TD.airports.filter((a) => a.lon && a.lat);
  // 県ごとの主な空港(国内線の乗降客数が最も多い空港)
  const mainAirport = {};
  for (const a of ap) { const v = a.dom?.[Y] ?? 0; if (v > 0 && (!mainAirport[a.pref] || v > (mainAirport[a.pref].dom?.[Y] ?? 0))) mainAirport[a.pref] = a; }
  const byCode = Object.fromEntries(ap.map((a) => [a.code, a]));
  const routes = TD.routes.filter((r) => byCode[r.from] && byCode[r.to] && r.pax > 0).map((r) => ({ from: byCode[r.from], to: byCode[r.to], pax: r.pax }));
  const intl = ap.filter((a) => (a.intl?.[Y] ?? 0) > 50000).map((a) => ({ ...a, w: a.intl[Y] }));
  const countries = Object.entries(IB.countries).filter(([, c]) => (c.tourists?.[Y] ?? 0) > 0).map(([iso, c]) => ({ iso, name: c.name, region: c.region, w: c.tourists[Y], dir: REGION_DIR[c.region] ?? 200 }));
  const cruiseShare = 1548756 / (1548756 + 41135081); // 2025年:クルーズ客 約155万人、それ以外の訪日客 約4,114万人(観光庁 インバウンド消費動向調査 年次報告書 図表2-5)
  cache = { grid: PG, airports: ap, mainAirport, routes, intl, countries, cruiseShare, cruisePorts: CRUISE_PORTS, ferries: FERRY_ROUTES,
    foreignNights: Object.fromEntries(Object.entries(IB.prefs).map(([p, v]) => [p, v.nights?.[Y] ?? 0])) };
  return cache;
}
