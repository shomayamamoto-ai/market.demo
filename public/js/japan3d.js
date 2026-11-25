// 日本地図の3D:都道府県を立体の地図に描き、仮想の住民が県から県へ移動する様子を動かして見せる。
// 人の出発地は人口に比例して選び、行き先は都道府県間の旅客の流れ(OD表)に比例して選ぶ。OD表が無いときは「重力モデル」
// (行き先の人口 ÷ 距離²)で代わりに決める。交通手段が分かるときは色を分ける(鉄道=赤、飛行機=青、バス=緑、車=灰)。
// geo = { prefs:[{name, centroid:[lon,lat], pop, polys:[[[lon,lat],...],...]}], rail:[{type, coords:[[lon,lat],...]}],
//         od?:{prefs:[名前...], values:[[...]]}, modes?:{key:{prefs, values}}, color?:{label, unit, values:{県:数値}} }
const MODE_COLOR = { rail: 0xc0392b, air: 0x2f6fd0, bus: 0x2f8f6b, car: 0x8b8b8b, all: 0xe0a030 };
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const MODE_LABEL = { rail: "鉄道", air: "飛行機", bus: "バス", car: "車", all: "移動" };

// 緯度経度を平面に直す(日本付近で縦横の比をそろえる)
const K = 6, LON0 = 137.5, LAT0 = 37, COS = Math.cos((LAT0 * Math.PI) / 180);
export const project = ([lon, lat]) => [(lon - LON0) * COS * K, -(lat - LAT0) * K];

// 行き先の選び方:OD表の行(なければ重力モデル)。返り値は確率の配列
export function destinationWeights(geo, i, mode = "all") {
  const P = geo.prefs, table = mode !== "all" && geo.modes?.[mode] ? geo.modes[mode] : geo.od;
  if (table) {
    const row = table.values[table.prefs.indexOf(P[i].name)];
    if (row) return P.map((p, j) => (j === i ? 0 : Math.max(0, row[table.prefs.indexOf(p.name)] ?? 0)));
  }
  const [x0, y0] = project(P[i].centroid);
  return P.map((p, j) => { if (j === i) return 0; const [x, y] = project(p.centroid), d2 = (x - x0) ** 2 + (y - y0) ** 2; return (p.pop || 1) / Math.max(d2, 4); });
}
const pickIndex = (w, r) => { const s = w.reduce((a, b) => a + b, 0); if (!s) return -1; let u = r * s; for (let i = 0; i < w.length; i++) { u -= w[i]; if (u <= 0) return i; } return w.length - 1; };

export function createJapan3D(root, geo, opts = {}) {
  const { people = 1200, seed = 7, compact = false } = opts;
  const THREE = window.THREE;
  root._stop3d?.(); root.innerHTML = ""; root.classList.add("visual", "stage3d", "japan3d"); root.classList.toggle("compact", compact); // compact:はじめにの画面用(説明と操作を減らす)
  if (!THREE) { root.innerHTML = `<p class="note" style="padding:16px">3D表示の部品を読み込めませんでした。ページを開き直してください。</p>`; return null; }
  let rs = seed >>> 0; const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); root.appendChild(renderer.domElement);
  const ui = document.createElement("div"); ui.className = "s-bar"; root.appendChild(ui);
  ui.innerHTML = `<button class="j-play">一時停止</button><select class="j-mode"><option value="all">すべての移動</option>${["rail", "air", "bus", "car"].filter((m) => geo.modes?.[m]).map((m) => `<option value="${m}">${MODE_LABEL[m]}だけ</option>`).join("")}${geo.world ? `<option value="foreign">訪日外国人だけ</option>` : ""}</select><select class="j-speed"><option value="0.5">ゆっくり</option><option value="1" selected>ふつう</option><option value="2">はやい</option></select><button class="j-big">大きく</button>`;
  const legend = document.createElement("div"); legend.className = "j-legend"; root.appendChild(legend);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 2000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.9)); const sun = new THREE.DirectionalLight(0xffffff, 0.5); sun.position.set(40, 120, 60); scene.add(sun);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshLambertMaterial({ color: 0x9fd3ef })); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.6; scene.add(sea);

  // 県の色:指定された値で塗り分ける(なければ地方ごとに薄い色)
  const vals = geo.color ? geo.prefs.map((p) => geo.color.values[p.name]).filter((v) => v != null) : [];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const tint = (p) => { const v = geo.color?.values[p.name]; if (v == null || !(hi > lo)) return new THREE.Color(0xd9cdb4); const t = (v - lo) / (hi - lo); return new THREE.Color().setHSL(0.08 - 0.08 * t, 0.55, 0.82 - 0.38 * t); };
  const land = new THREE.Group(); scene.add(land);
  for (const p of geo.prefs) {
    const mat = new THREE.MeshLambertMaterial({ color: tint(p) });
    for (const ring of p.polys) {
      if (ring.length < 4) continue;
      const shape = new THREE.Shape(ring.map((c) => { const [x, y] = project(c); return new THREE.Vector2(x, y); }));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, 0.5, 0);
      land.add(new THREE.Mesh(g, mat));
    }
  }
  // 県境の線
  const edge = new THREE.LineBasicMaterial({ color: 0x7a6a55, transparent: true, opacity: 0.75 });
  for (const p of geo.prefs) for (const ring of p.polys) { const pts = ring.map((c) => { const [x, z] = project(c); return new THREE.Vector3(x, 0.52, z); }); land.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), edge)); }
  // 鉄道(新幹線は太め・濃い色)
  for (const r of geo.rail ?? []) { const pts = r.coords.map((c) => { const [x, z] = project(c); return new THREE.Vector3(x, 0.6, z); });
    land.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: r.type === "新幹線" ? 0x1f3f8f : 0x666666, transparent: true, opacity: r.type === "新幹線" ? 0.95 : 0.45 }))); }

  // 乗降客数の多い駅:高さが1日の乗降客数に比例する柱
  if (geo.stations?.length) { const maxR = Math.max(...geo.stations.map((st) => st.riders_per_day)), cyl = new THREE.CylinderGeometry(0.22, 0.22, 1, 6), m = new THREE.MeshLambertMaterial({ color: 0x7a2fb0 });
    for (const st of geo.stations) { const h = 0.4 + (st.riders_per_day / maxR) * 9, [x, z] = project([st.lon, st.lat]), c = new THREE.Mesh(cyl, m); c.scale.y = h; c.position.set(x, 0.5 + h / 2, z); land.add(c); } }
  // レジャー施設:点(温泉・遊園地・動植物園)と、大きなテーマパークの金色の柱(高さ=年間の入場者)
  const FAC = { onsen: [0xe07b1f, "温泉"], leisure: [0xd0508a, "遊園地・レジャー施設"], zoo: [0x2f8f6b, "動物園・植物園・水族館"] };
  if (geo.facilities?.points?.length) { const pts = geo.facilities.points, box = new THREE.BoxGeometry(0.32, 0.5, 0.32), fm = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), pts.length), o = new THREE.Object3D(), c = new THREE.Color();
    pts.forEach(([lon, lat, kind], k) => { const [x, z] = project([lon, lat]); o.position.set(x, 0.8, z); o.updateMatrix(); fm.setMatrixAt(k, o.matrix); fm.setColorAt(k, c.setHex(FAC[kind]?.[0] ?? 0x888888)); });
    fm.instanceMatrix.needsUpdate = true; if (fm.instanceColor) fm.instanceColor.needsUpdate = true; land.add(fm); }
  if (geo.facilities?.big?.length) { const maxV = Math.max(...geo.facilities.big.map((b) => b.value || 0), 1), cyl = new THREE.CylinderGeometry(0.45, 0.45, 1, 10), m = new THREE.MeshLambertMaterial({ color: 0xd4a017, emissive: 0x3a2a00 });
    for (const b of geo.facilities.big) { const h = 1 + ((b.value || 0) / maxV) * 14, [x, z] = project([b.lon, b.lat]), cy = new THREE.Mesh(cyl, m); cy.scale.y = h; cy.position.set(x, 0.5 + h / 2, z); land.add(cy); } }
  // ---------- 人と乗り物 ----------
  // 住む場所(geo.world.grid):国勢調査の人口のます目(約10km)から、人口に比例して点を置く。都市ほど密集する
  // 移動:県と県の旅客の流れ(OD表)と交通手段の割合で選ぶ。飛行機は国内線の路線ごとの旅客数に比例して路線を選ぶ。
  // 訪日外国人(金色):国際線の多い空港・クルーズ船の港から入り、外国人の泊数の推計が多い地域へ向かい、滞在して、また空港から帰る
  const W = geo.world, tmp = new THREE.Object3D(), col = new THREE.Color(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const prefIdx = Object.fromEntries(geo.prefs.map((p, i) => [p.name, i]));
  const pickCum = (cum, r) => { let a = 0, b = cum.length - 1; const u = r * cum[b]; while (a < b) { const m = (a + b) >> 1; if (cum[m] < u) a = m + 1; else b = m; } return a; };
  const JIT = 0.05, cellsOf = {}, allCum = [], forCum = [];
  if (W?.grid) { let s = 0, f = 0; for (const c of W.grid.cells) { const name = W.grid.prefs[c[3]], o = (cellsOf[name] ??= { c: [], cum: [], cumF: [], s: 0, sF: 0 }); o.s += c[2]; o.sF += c[4]; o.c.push(c); o.cum.push(o.s); o.cumF.push(o.sF); s += c[2]; f += c[4]; allCum.push(s); forCum.push(f); } }
  const atCell = (c) => project([c[0] + (rnd() - 0.5) * JIT * 2, c[1] + (rnd() - 0.5) * JIT * 2]);
  const pointIn = (name) => { const o = cellsOf[name]; if (!o?.s) { const p = geo.prefs[prefIdx[name]] ?? geo.prefs[0]; return project([p.centroid[0] + (rnd() - 0.5) * 0.25, p.centroid[1] + (rnd() - 0.5) * 0.2]); } return atCell(o.c[pickCum(o.cum, rnd())]); };
  const UNIT_KM = 111 / K; // 地図の1単位 ≒ 18.5km
  // 住んでいる人(動かない点)
  const R = W?.grid ? (opts.residents ?? (compact ? 3000 : matchMedia("(max-width: 640px)").matches ? 4500 : 8000)) : 0;
  if (R) { const rm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 5, 4), new THREE.MeshBasicMaterial({ color: 0x5b4636, transparent: true, opacity: 0.75 }), R);
    for (let k = 0; k < R; k++) { const [x, z] = atCell(W.grid.cells[pickCum(allCum, rnd())]); tmp.position.set(x, 0.62, z); tmp.rotation.set(0, 0, 0); tmp.scale.setScalar(1); tmp.updateMatrix(); rm.setMatrixAt(k, tmp.matrix); }
    rm.instanceMatrix.needsUpdate = true; land.add(rm); }
  // 乗り物と人の形(同じ番号の部品は同じ位置・向きで描く)
  const FOREIGN = W ? (opts.foreign ?? Math.max(60, Math.round(people * 0.25))) : 0, FERRY = W ? W.ferries.length * 2 : 0, N = people + FOREIGN + FERRY;
  // 種類ごとに描く数の上限を決め、使っている番号だけを描く(見えない形を描かないので軽くなる)
  const CAP = { dot: people + 8, train: Math.ceil(people * 0.6) + 8, plane: Math.ceil(people * 0.25) + FOREIGN + 8, ship: Math.ceil(FOREIGN * 0.25) + FERRY + 8, foreign: FOREIGN + 8 };
  let capNow = 0;
  const part = (geom, color, extra = {}) => { const m = new THREE.InstancedMesh(geom, new THREE.MeshLambertMaterial({ color, ...extra }), capNow); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let k = 0; k < capNow; k++) m.setMatrixAt(k, ZERO); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capNow * 3).fill(1), 3); m.count = 0; scene.add(m); return m; };
  const g = (G, f) => { f(G); return G; };
  const withCap = (kind, f) => { capNow = CAP[kind]; return f(); };
  const SHAPES = {
    dot: withCap("dot", () => [part(new THREE.SphereGeometry(0.28, 8, 6), 0xffffff)]),
    train: withCap("train", () => [part(new THREE.BoxGeometry(0.3, 0.3, 1.3), 0xffffff)]),
    plane: withCap("plane", () => [part(g(new THREE.CylinderGeometry(0.11, 0.07, 1.15, 6), (G) => G.rotateX(Math.PI / 2)), 0xffffff), part(new THREE.BoxGeometry(1.15, 0.05, 0.28), 0xffffff), part(g(new THREE.BoxGeometry(0.45, 0.04, 0.18), (G) => G.translate(0, 0, -0.5)), 0xffffff), part(g(new THREE.BoxGeometry(0.04, 0.26, 0.2), (G) => G.translate(0, 0.13, -0.5)), 0xffffff)]),
    ship: withCap("ship", () => [part(new THREE.BoxGeometry(0.6, 0.32, 1.9), 0xffffff), part(g(new THREE.BoxGeometry(0.42, 0.34, 0.7), (G) => G.translate(0, 0.33, -0.25)), 0xffffff)]),
    foreign: withCap("foreign", () => [part(new THREE.SphereGeometry(0.46, 10, 8), 0xffb300, { emissive: 0x553300 }), part(g(new THREE.ConeGeometry(0.3, 0.6, 6), (G) => { G.rotateX(Math.PI); G.translate(0, 1.15, 0); }), 0xff3fa4, { emissive: 0x550022 })]),
  };
  const popW = geo.prefs.map((p) => p.pop || 1);
  const FREE = Object.fromEntries(Object.entries(CAP).map(([k, c]) => [k, Array.from({ length: c }, (_, i) => c - 1 - i)])), HIGH = Object.fromEntries(Object.keys(CAP).map((k) => [k, 0]));
  const takeSlot = (kind) => { const s0 = FREE[kind].pop(); if (s0 == null) return -1; HIGH[kind] = Math.max(HIGH[kind], s0 + 1); return s0; };
  const giveSlot = (kind, s0) => { for (const m of SHAPES[kind]) m.setMatrixAt(s0, ZERO); FREE[kind].push(s0); };
  const KIND_OF = { rail: "train", air: "plane", bus: "dot", car: "dot", walk: "dot" };
  let mode = "all";
  const travelers = [], foreigners = [], ferries = [];
  for (let k = 0; k < people; k++) travelers.push({ k, a: [0, 0], b: [0, 0], t: 1, speed: 1, height: 1, m: "car", kind: null, prev: null, slot: -1, from: 0, to: 0, local: false });
  for (let k = 0; k < FOREIGN; k++) foreigners.push({ k: people + k, a: [0, 0], b: [0, 0], t: 1, speed: 1, height: 1, kind: null, prev: null, slot: -1, state: "in", stay: 0, c: null, port: null, ship: false });
  for (let k = 0; k < FERRY; k++) ferries.push({ k: people + FOREIGN + k, route: W.ferries[k >> 1], dir: k & 1, t: (k * 0.37) % 1, kind: "ship", prev: null, slot: -1 });
  const localRail = (name) => geo.localRail?.[name] ?? 0.15;
  const routeCum = []; if (W) { let s = 0; for (const r of W.routes) { s += r.pax; routeCum.push(s); } }
  const setPath = (tr, a, b, kind, opt = {}) => { tr.a = a; tr.b = b; tr.t = 0; tr.kind = kind; const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    tr.height = opt.height ?? (kind === "plane" ? 2 + d * 0.12 : kind === "train" ? 0.15 : kind === "ship" ? 0 : 0.6 + d * 0.02);
    tr.base = opt.base ?? (kind === "ship" ? -0.42 : kind === "train" ? 0.85 : 0.9); tr.descend = opt.descend ?? 0;
    tr.speed = (opt.v ?? (kind === "plane" ? 0.9 : kind === "train" ? 0.6 : kind === "ship" ? 0.18 : 0.45)) / Math.max(opt.min ?? 4, d) * 6; };
  const startTrip = (tr, i0) => {
    if (mode === "foreign") { tr.kind = null; tr.t = 0; tr.speed = 0.5; return; }
    const i = i0 ?? pickIndex(popW, rnd()), name = geo.prefs[i].name;
    if (W && mode === "all" && rnd() < 0.4) { // 県の中の短い移動(通勤・買い物など)。鉄道の割合は県ごと(通勤・通学の鉄道の利用率)
      const r = rnd(), m = r < localRail(name) ? "rail" : r < localRail(name) + 0.08 ? "bus" : "car";
      tr.m = m; tr.from = tr.to = i; tr.local = true; setPath(tr, tr.b && tr.kind ? tr.b : pointIn(name), pointIn(name), KIND_OF[m], { min: 1.2, v: 0.35 }); return; }
    tr.local = false;
    if (W && (mode === "air" || (mode === "all" && geo.modes?.air && rnd() < airShareOf(i)))) { // 飛行機:国内線の路線ごとの旅客数に比例して路線を選ぶ
      const rt = W.routes[pickCum(routeCum, rnd())], rev = rnd() < 0.5, A = rev ? rt.to : rt.from, B = rev ? rt.from : rt.to;
      tr.m = "air"; tr.from = prefIdx[A.pref] ?? i; tr.to = prefIdx[B.pref] ?? i; setPath(tr, project([A.lon, A.lat]), project([B.lon, B.lat]), "plane"); return; }
    const w = destinationWeights(geo, i, mode === "all" ? "all" : mode), j = pickIndex(w, rnd()); if (j < 0) return;
    let m = mode !== "all" ? mode : "rail";
    if (mode === "all" && geo.modes) { const ms = ["rail", "bus", "car"].filter((x) => geo.modes[x]), ww = ms.map((x) => { const t = geo.modes[x]; return Math.max(0, t.values[t.prefs.indexOf(name)]?.[t.prefs.indexOf(geo.prefs[j].name)] ?? 0); }); m = ms[Math.max(0, pickIndex(ww, rnd()))] ?? "rail"; }
    tr.m = m; tr.from = i; tr.to = j;
    const a = W ? pointIn(name) : project([geo.prefs[i].centroid[0] + (rnd() - 0.5) * 0.25, geo.prefs[i].centroid[1] + (rnd() - 0.5) * 0.2]), b = W ? pointIn(geo.prefs[j].name) : project([geo.prefs[j].centroid[0] + (rnd() - 0.5) * 0.25, geo.prefs[j].centroid[1] + (rnd() - 0.5) * 0.2]);
    if (!W && m === "air") return setPath(tr, a, b, "plane");
    setPath(tr, a, b, KIND_OF[m] ?? "dot");
  };
  // 県から出る移動のうち飛行機の割合(OD表の手段の合計から)
  const airShare = geo.prefs.map((p) => { if (!geo.modes?.air) return 0; const row = (key) => { const t = geo.modes[key]; return t ? (t.values[t.prefs.indexOf(p.name)] ?? []).reduce((a, b) => a + Math.max(0, b ?? 0), 0) : 0; }; const air = row("air"), all = ["rail", "air", "bus", "car"].reduce((a, k) => a + row(k), 0); return all ? air / all : 0; });
  function airShareOf(i) { return airShare[i] ?? 0; }
  // 訪日外国人
  const countryCum = []; if (W) { let s = 0; for (const c of W.countries) { s += c.w; countryCum.push(s); } }
  const intlCum = []; if (W) { let s = 0; for (const a of W.intl) { s += a.w; intlCum.push(s); } }
  const offshore = (p, dirDeg) => { const r = (dirDeg * Math.PI) / 180, R2 = 95; return [p[0] + Math.cos(r) * R2, p[1] - Math.sin(r) * R2]; };
  const foreignDest = (from) => { let best = null; for (let n = 0; n < 8; n++) { const c = W.grid.cells[pickCum(forCum, rnd())], p = project([c[0], c[1]]), dkm = Math.hypot(p[0] - from[0], p[1] - from[1]) * UNIT_KM; if (!best) best = c; if (rnd() < Math.exp(-dkm / 350)) { best = c; break; } } return atCell(best); };
  const spawnForeign = (f) => {
    f.c = W.countries[pickCum(countryCum, rnd())]; f.ship = rnd() < W.cruiseShare;
    const dir = f.c.dir + (rnd() - 0.5) * 30;
    if (f.ship) { const p = W.cruisePorts[Math.floor(rnd() * W.cruisePorts.length)]; f.port = project([p[1], p[2]]); setPath(f, offshore(f.port, dir), f.port, "ship", { v: 1.6 }); }
    else { const a = W.intl[pickCum(intlCum, rnd())]; f.port = project([a.lon, a.lat]); setPath(f, offshore(f.port, dir), f.port, "plane", { height: 0, base: 0.9, descend: 9, v: 5 }); }
    f.dir = dir; f.state = "in"; f.kindSeen = f.kind;
  };
  const nextForeign = (f) => {
    if (f.state === "in" || f.state === "stay") {
      if (f.state === "stay" && rnd() < 0.3) { f.state = "home"; setPath(f, f.b, f.port, "foreign", { v: 0.5 }); return; } // 帰りの空港・港へ
      f.state = "go"; setPath(f, f.b, foreignDest(f.b), "foreign", { v: 0.5 }); return; }
    if (f.state === "go") { f.state = "stay"; f.stay = 3 + rnd() * 6; f.a = f.b; f.t = 0; return; }
    if (f.state === "home") { f.state = "out"; if (f.ship) setPath(f, f.port, offshore(f.port, f.dir), "ship", { v: 0.5 }); else setPath(f, f.port, offshore(f.port, f.dir), "plane", { height: 0, base: 0.9, descend: -9, v: 5 }); return; }
    spawnForeign(f);
  };
  const FCOL = { plane: 0xffb300, ship: 0xffb300 }, MODE_HEX = (tr) => (tr.isF ? FCOL[tr.kind] ?? 0xffb300 : tr.kind === "ship" ? 0xf4f4f4 : MODE_COLOR[tr.m] ?? 0xffffff);
  foreigners.forEach((f) => { f.isF = true; });
  const look = new THREE.Vector3();
  const posAt = (tr, t) => { const x = tr.a[0] + (tr.b[0] - tr.a[0]) * t, z = tr.a[1] + (tr.b[1] - tr.a[1]) * t; const y = tr.descend > 0 ? tr.base + tr.descend * (1 - t) : tr.descend < 0 ? tr.base - tr.descend * t : tr.base + tr.height * 4 * t * (1 - t); return [x, y, z]; };
  const draw1 = (tr, hidden) => {
    const want = hidden ? null : tr.kind;
    if (tr.prev !== want) { if (tr.prev && tr.slot >= 0) giveSlot(tr.prev, tr.slot); tr.slot = want ? takeSlot(want) : -1; tr.prev = want; }
    if (!want || tr.slot < 0) return;
    const t = tr.state === "stay" ? 0 : Math.min(1, tr.t), [x, y, z] = tr.state === "stay" ? [tr.b[0], 0.9 + Math.abs(Math.sin(tr.stay * 3)) * 0.25, tr.b[1]] : posAt(tr, t);
    tmp.position.set(x, y, z); tmp.scale.setScalar(1);
    if (want === "plane" || want === "train" || want === "ship") { const [x2, y2, z2] = posAt(tr, Math.min(1, t + 0.01)); look.set(x2, want === "plane" ? y2 : y, z2); if (look.distanceToSquared(tmp.position) > 1e-8) tmp.lookAt(look); }
    else tmp.rotation.set(0, 0, 0);
    tmp.updateMatrix(); const hex = MODE_HEX(tr);
    SHAPES[want].forEach((m, n) => { m.setMatrixAt(tr.slot, tmp.matrix); if (want !== "foreign") m.setColorAt(tr.slot, col.setHex(n === 1 && want === "plane" && !tr.isF ? 0xffffff : hex)); });
  };
  const ferryPath = (s) => { const [, lo1, la1, , lo2, la2] = s.route, A = project([lo1, la1]), B = project([lo2, la2]); return s.dir ? [B, A] : [A, B]; };
  ferries.forEach((s) => { const [A, B] = ferryPath(s); s.a = A; s.b = B; s.base = -0.42; s.height = 0; s.descend = 0; s.speed = 0.12 / Math.max(4, Math.hypot(B[0] - A[0], B[1] - A[1])) * 6; });
  travelers.forEach((tr) => { startTrip(tr); tr.t = rnd(); });
  if (W) foreigners.forEach((f) => { spawnForeign(f); f.t = rnd(); });
  const drawAll = () => { for (const tr of travelers) draw1(tr, mode === "foreign"); for (const f of foreigners) draw1(f, false); for (const s of ferries) draw1(s, mode === "foreign"); for (const [kind, L] of Object.entries(SHAPES)) for (const m of L) { m.count = HIGH[kind]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } };
  const step = (dt) => {
    for (const tr of travelers) { if (!tr.kind) { tr.t += tr.speed * dt; if (tr.t >= 1 && mode !== "foreign") startTrip(tr); continue; } tr.t += tr.speed * dt; if (tr.t >= 1) startTrip(tr, tr.to); }
    for (const f of foreigners) { if (f.state === "stay") { f.stay -= dt; if (f.stay <= 0) nextForeign(f); continue; } f.t += f.speed * dt; if (f.t >= 1) nextForeign(f); }
    for (const s of ferries) { s.t += s.speed * dt; if (s.t >= 1) { s.dir ^= 1; const [A, B] = ferryPath(s); s.a = A; s.b = B; s.t = 0; } }
  };
  drawAll();

  // 凡例と、いま動いている人の内訳
  const topAreas = (() => { if (!W?.grid?.areas) return []; const m = new Map(); for (const a of W.grid.areas) { const k = `${a.name}(${a.pref})`; m.set(k, (m.get(k) ?? 0) + a.foreign); } return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5); })();
  const drawLegend = () => { const n = {}; for (const tr of travelers) if (tr.kind && mode !== "foreign") n[tr.m] = (n[tr.m] ?? 0) + 1;
    const fs = { 空路で到着: 0, 船で到着: 0, 観光地へ移動: 0, 滞在中: 0, 帰国へ: 0 }; for (const f of foreigners) { const k = f.state === "in" ? (f.ship ? "船で到着" : "空路で到着") : f.state === "go" ? "観光地へ移動" : f.state === "stay" ? "滞在中" : "帰国へ"; fs[k]++; }
    legend.innerHTML = `<h4>いま動いている人</h4>${Object.entries(n).sort((a, b) => b[1] - a[1]).map(([m, c]) => `<div class="j-row"><span style="color:#${MODE_COLOR[m].toString(16).padStart(6, "0")}">●</span> ${MODE_LABEL[m]} <b>${c}</b></div>`).join("")}
      ${W ? `<div class="j-row"><span style="color:#ffb300">●</span><span style="color:#ff3fa4">▼</span> 訪日外国人 <b>${foreigners.length}</b></div><p class="j-note">${Object.entries(fs).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join("、")}</p>
        <p class="j-note">茶色の小さな点:住んでいる人(人口に比例)。飛行機=国内線の路線の旅客数に比例、白い船=主なフェリー航路(表示のみ)。外国人は見やすくするため、実際の比率より多く表示しています。</p>
        ${topAreas.length ? `<p class="j-note">外国人の泊数が多い地域(推計):${topAreas.map(([k]) => esc(k)).join("、")}</p>` : ""}` : ""}
      ${geo.color ? `<p class="j-note">地図の色:${geo.color.label}(濃いほど高い。${lo.toFixed(1)}〜${hi.toFixed(1)}${geo.color.unit ?? ""})</p>` : ""}
      ${geo.facilities ? `<p class="j-note"><span style="color:#d4a017">■</span> 金色の柱:大きなテーマパーク(高さ=年間の入場者)<br>${Object.values(FAC).map(([c, l]) => `<span style="color:#${c.toString(16).padStart(6, "0")}">■</span> ${l}`).join(" ")}</p>` : ""}
      <p class="j-note">${geo.od ? "県をまたぐ行き先は、実際の県と県の旅客の流れに比例" : "行き先は、人口と距離から決めた仮の流れ(重力モデル)"}</p>${geo.stations?.length ? `<p class="j-note"><span style="color:#7a2fb0">■</span> 紫の柱:乗降客数の多い駅(高さ=1日の乗降客数)</p>` : ""}`; };
  drawLegend();

  // カメラ:ドラッグで回す、ホイール・ピンチで寄る
  const phone = matchMedia("(max-width: 640px)").matches, cam = phone ? { yaw: -0.2, pitch: 1.1, dist: 175, tx: 4, tz: -2 } : { yaw: -0.3, pitch: 1.0, dist: 115, tx: 2, tz: 2 }; // スマホは縦長なので、北海道まで入るよう引いて少し北へ
  const setCam = () => { const { yaw, pitch, dist } = cam; camera.position.set(cam.tx + dist * Math.sin(yaw) * Math.cos(pitch), dist * Math.sin(pitch), cam.tz + dist * Math.cos(yaw) * Math.cos(pitch)); camera.lookAt(cam.tx, 0, cam.tz); };
  const dom = renderer.domElement; dom.style.touchAction = "none"; let drag = null; const pts = new Map();
  dom.addEventListener("pointerdown", (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener("pointermove", (e) => { if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [p, q] = [...pts.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (drag.pinch) cam.dist = Math.min(400, Math.max(25, cam.dist * drag.pinch / d)); drag.pinch = d; setCam(); return; }
    cam.yaw -= (e.clientX - prev[0]) * 0.006; cam.pitch = Math.min(1.45, Math.max(0.25, cam.pitch + (e.clientY - prev[1]) * 0.004)); setCam(); });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2 && drag) drag.pinch = null; };
  dom.addEventListener("pointerup", up); dom.addEventListener("pointercancel", up);
  dom.addEventListener("wheel", (e) => { e.preventDefault(); cam.dist = Math.min(400, Math.max(25, cam.dist * (1 + e.deltaY * 0.001))); setCam(); }, { passive: false });
  const [playBtn, modeSel, speedSel, bigBtn] = ui.children;
  // 画面に見えていないあいだは止めて、見えたら再開する(電池と処理の節約)。「一時停止」を押したときは、見えても再開しない
  let running = false, userPaused = !!opts.paused, visible = false, speed = 1, last = performance.now();
  const start = () => { if (running || userPaused || !visible || !root.isConnected) return; running = true; last = performance.now(); requestAnimationFrame(frame); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else running = false; }).observe(root);
  playBtn.textContent = userPaused ? "再生" : "一時停止";
  playBtn.onclick = () => { userPaused = !userPaused; playBtn.textContent = userPaused ? "再生" : "一時停止"; if (userPaused) running = false; else start(); };
  modeSel.onchange = () => { mode = modeSel.value; travelers.forEach((tr) => { tr.kind = null; startTrip(tr); }); drawAll(); drawLegend(); };
  speedSel.onchange = () => (speed = Number(speedSel.value));
  bigBtn.onclick = () => { const on = !root.classList.contains("big"); root.classList.toggle("big", on); document.documentElement.classList.toggle("stage-big", on); bigBtn.textContent = on ? "戻す" : "大きく"; resize(); };
  const resize = () => { const w = root.clientWidth || 600, h = root.clientHeight || 400; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(root); resize(); setCam();
  let tick = 0;
  function frame(now) {
    if (!running || !root.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000) * speed; last = now;
    step(dt); drawAll();
    if (++tick % 60 === 0) drawLegend();
    renderer.render(scene, camera); requestAnimationFrame(frame);
  }
  renderer.render(scene, camera); // 止まっていても1枚は描いておく
  const stop = () => { userPaused = true; running = false; }; root._stop3d = stop; // 同じ場所に別の3Dを描くときに、この地図の動きを止める
  return { stop };
}
