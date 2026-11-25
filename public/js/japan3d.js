// 日本地図の3D:都道府県を立体の地図に描き、仮想の住民が県から県へ移動する様子を動かして見せる。
// 人の出発地は人口に比例して選び、行き先は都道府県間の旅客の流れ(OD表)に比例して選ぶ。OD表が無いときは「重力モデル」
// (行き先の人口 ÷ 距離²)で代わりに決める。交通手段が分かるときは色を分ける(鉄道=赤、飛行機=青、バス=緑、車=灰)。
// geo = { prefs:[{name, centroid:[lon,lat], pop, polys:[[[lon,lat],...],...]}], rail:[{type, coords:[[lon,lat],...]}],
//         od?:{prefs:[名前...], values:[[...]]}, modes?:{key:{prefs, values}}, color?:{label, unit, values:{県:数値}} }
const MODE_COLOR = { rail: 0xc0392b, air: 0x2f6fd0, bus: 0x2f8f6b, car: 0x8b8b8b, all: 0xe0a030 };
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

export function createJapan3D(root, geo, { people = 1200, seed = 7 } = {}) {
  const THREE = window.THREE;
  root.innerHTML = ""; root.classList.add("visual", "stage3d", "japan3d");
  if (!THREE) { root.innerHTML = `<p class="note" style="padding:16px">3D表示の部品を読み込めませんでした。ページを開き直してください。</p>`; return null; }
  let rs = seed >>> 0; const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); root.appendChild(renderer.domElement);
  const ui = document.createElement("div"); ui.className = "s-bar"; root.appendChild(ui);
  ui.innerHTML = `<button class="j-play">一時停止</button><select class="j-mode"><option value="all">すべての移動</option>${["rail", "air", "bus", "car"].filter((m) => geo.modes?.[m]).map((m) => `<option value="${m}">${MODE_LABEL[m]}だけ</option>`).join("")}</select><select class="j-speed"><option value="0.5">ゆっくり</option><option value="1" selected>ふつう</option><option value="2">はやい</option></select><button class="j-big">大きく</button>`;
  const legend = document.createElement("div"); legend.className = "v-result j-legend"; root.appendChild(legend);
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
  const edge = new THREE.LineBasicMaterial({ color: 0x7a6a55, transparent: true, opacity: 0.55 });
  for (const p of geo.prefs) for (const ring of p.polys) { const pts = ring.map((c) => { const [x, z] = project(c); return new THREE.Vector3(x, 0.52, z); }); land.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), edge)); }
  // 鉄道(新幹線は太め・濃い色)
  for (const r of geo.rail ?? []) { const pts = r.coords.map((c) => { const [x, z] = project(c); return new THREE.Vector3(x, 0.6, z); });
    land.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: r.type === "新幹線" ? 0x1f3f8f : 0x666666, transparent: true, opacity: r.type === "新幹線" ? 0.95 : 0.45 }))); }

  // 人:出発地は人口に比例、行き先は流れの表に比例。弧を描いて移動し、着いたら次の行き先を選ぶ
  const popW = geo.prefs.map((p) => p.pop || 1), body = new THREE.SphereGeometry(0.28, 8, 6);
  const dots = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ color: 0xffffff }), people); scene.add(dots);
  let mode = "all";
  const jitter = (c) => [c[0] + (rnd() - 0.5) * 0.25, c[1] + (rnd() - 0.5) * 0.2];
  const travelers = Array.from({ length: people }, () => ({ from: 0, to: 0, a: [0, 0], b: [0, 0], t: 1, speed: 1, height: 1, m: "all" }));
  const startTrip = (tr, i0) => {
    const i = i0 ?? pickIndex(popW, rnd()), w = destinationWeights(geo, i, mode), j = pickIndex(w, rnd()); if (j < 0) return;
    tr.from = i; tr.to = j; tr.a = project(jitter(geo.prefs[i].centroid)); tr.b = project(jitter(geo.prefs[j].centroid)); tr.t = 0;
    const d = Math.hypot(tr.b[0] - tr.a[0], tr.b[1] - tr.a[1]); tr.m = mode === "all" ? (d > 45 ? "air" : "rail") : mode; // 手段が分からないときは、遠い移動を飛行機とみなす(表示だけの仮定)
    tr.height = tr.m === "air" ? 2 + d * 0.12 : 0.8 + d * 0.02; tr.speed = (tr.m === "air" ? 0.9 : 0.45) / Math.max(4, d) * 6;
  };
  travelers.forEach((tr) => { startTrip(tr); tr.t = rnd(); });
  const tmp = new THREE.Object3D(), col = new THREE.Color();
  const place = () => travelers.forEach((tr, k) => { const t = tr.t, x = tr.a[0] + (tr.b[0] - tr.a[0]) * t, z = tr.a[1] + (tr.b[1] - tr.a[1]) * t, y = 0.9 + tr.height * 4 * t * (1 - t);
    tmp.position.set(x, y, z); tmp.updateMatrix(); dots.setMatrixAt(k, tmp.matrix); dots.setColorAt(k, col.setHex(MODE_COLOR[tr.m])); });
  place(); dots.instanceMatrix.needsUpdate = true; if (dots.instanceColor) dots.instanceColor.needsUpdate = true;

  // 凡例と、いま移動中の人の内訳
  const drawLegend = () => { const n = {}; for (const tr of travelers) n[tr.m] = (n[tr.m] ?? 0) + 1;
    legend.innerHTML = `<h4>いま移動中の人</h4>${Object.entries(n).map(([m, c]) => `<div class="v-row"><span style="color:#${MODE_COLOR[m].toString(16).padStart(6, "0")}">●</span> ${MODE_LABEL[m]} <b>${c}</b></div>`).join("")}
      ${geo.color ? `<p class="v-verdict">地図の色:${geo.color.label}(濃いほど高い。${lo.toFixed(1)}〜${hi.toFixed(1)}${geo.color.unit ?? ""})</p>` : ""}
      <p class="v-verdict">${geo.od ? "行き先は、実際の県と県の旅客の流れに比例" : "行き先は、人口と距離から決めた仮の流れ(重力モデル)"}</p>`; };
  drawLegend();

  // カメラ:ドラッグで回す、ホイール・ピンチで寄る
  const cam = { yaw: -0.35, pitch: 0.95, dist: 150, tx: 0, tz: 4 };
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
  let running = true, speed = 1, last = performance.now();
  playBtn.onclick = () => { running = !running; playBtn.textContent = running ? "一時停止" : "再生"; if (running) { last = performance.now(); requestAnimationFrame(frame); } };
  modeSel.onchange = () => { mode = modeSel.value; travelers.forEach((tr) => startTrip(tr)); drawLegend(); };
  speedSel.onchange = () => (speed = Number(speedSel.value));
  bigBtn.onclick = () => { const on = !root.classList.contains("big"); root.classList.toggle("big", on); document.documentElement.classList.toggle("stage-big", on); bigBtn.textContent = on ? "戻す" : "大きく"; resize(); };
  const resize = () => { const w = root.clientWidth || 600, h = root.clientHeight || 400; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(root); resize(); setCam();
  let tick = 0;
  function frame(now) {
    if (!running || !root.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000) * speed; last = now;
    for (const tr of travelers) { tr.t += tr.speed * dt; if (tr.t >= 1) startTrip(tr, tr.to); }
    place(); dots.instanceMatrix.needsUpdate = true; if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
    if (++tick % 60 === 0) drawLegend();
    renderer.render(scene, camera); requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { stop: () => (running = false) };
}
