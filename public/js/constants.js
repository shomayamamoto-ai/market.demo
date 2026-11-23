// サーバーとブラウザの両方で使う定数

// 家計調査の10大費目
export const CATEGORIES = [
  { key: "food", label: "食料" },
  { key: "housing", label: "住居" },
  { key: "utilities", label: "光熱・水道" },
  { key: "furniture", label: "家具・家事用品" },
  { key: "clothing", label: "被服及び履物" },
  { key: "medical", label: "保健医療" },
  { key: "transport_comm", label: "交通・通信" },
  { key: "education", label: "教育" },
  { key: "recreation", label: "教養娯楽" },
  { key: "other", label: "その他の消費支出" },
];
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

export const AGE_BANDS = [
  { label: "0〜9歳", min: 0, max: 9 },
  { label: "10代", min: 10, max: 19 },
  { label: "20代", min: 20, max: 29 },
  { label: "30代", min: 30, max: 39 },
  { label: "40代", min: 40, max: 49 },
  { label: "50代", min: 50, max: 59 },
  { label: "60代", min: 60, max: 69 },
  { label: "70代", min: 70, max: 79 },
  { label: "80歳以上", min: 80, max: 200 },
];
export const ageBandOf = (age) => AGE_BANDS.find((b) => age >= b.min && age <= b.max).label;
