// 3Dの舞台:シミュレーションの結果を、島の上を歩く人の動きとして見せる共通の部品。
// 各画面は「コマ(frame)」の並びを渡す。1コマは、場所(zone)ごとの人数と色。
// コマが進むと、人数が増えた場所へ、減った場所から人が歩いて移る。
import { clamp } from "./rng.js";
import { esc } from "./charts.js";

const MAX = 720; // 一度に描く人の上限

// ---- 建物の部品(低ポリゴン)。どれも幅6〜8ほどの大きさで、原点が足もと ----
export function buildProp(THREE, kind, color = "#b4473b") {
  const g = new THREE.Group();
  const M = (c) => new THREE.MeshLambertMaterial({ color: c });
  const add = (geo, c, x = 0, y = 0, z = 0, ry = 0) => { const m = new THREE.Mesh(geo, M(c)); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (r1, r2, h, n = 12) => new THREE.CylinderGeometry(r1, r2, h, n), cone = (r, h, n = 4) => new THREE.ConeGeometry(r, h, n);
  const WALL = 0xf3ede2, WOOD = 0x8a6a4a, STONE = 0xb9b4ac, DARK = 0x4a4340;
  const house = (x, z, s = 1, roof = color) => { add(box(2.2 * s, 1.7 * s, 2.2 * s), WALL, x, 0.85 * s, z); add(cone(1.9 * s, 1.4 * s), roof, x, 2.4 * s, z, Math.PI / 4); add(box(0.5 * s, 0.9 * s, 0.1), WOOD, x, 0.45 * s, z + 1.11 * s); };
  const tree = (x, z, s = 1) => { add(cyl(0.22 * s, 0.3 * s, 1.4 * s, 6), WOOD, x, 0.7 * s, z); add(new THREE.SphereGeometry(1.2 * s, 8, 6), 0x4f9a52, x, 2.2 * s, z); };
  switch (kind) {
    case "factory":
      add(box(7.5, 3.2, 4.6), WALL, 0, 1.6, 0);
      for (const x of [-2.5, 0, 2.5]) { const r = add(box(2.5, 1.2, 4.6), color, x, 3.6, 0); r.rotation.z = 0.35; }
      add(cyl(0.45, 0.55, 5.4, 10), STONE, 3.1, 2.7, -1.2);
      add(box(1.6, 2, 0.12), DARK, -1.6, 1, 2.32); add(box(5.5, 0.35, 1), DARK, 0, 0.5, 3.2); // 入口とベルトコンベア
      {
        const puffs = [0, 1, 2].map(() => add(new THREE.SphereGeometry(0.6, 8, 6), 0xf2f2f2, 3.1, 5.6, -1.2));
        const crates = [0, 1, 2].map(() => add(box(0.7, 0.6, 0.7), color, 0, 0.98, 3.2));
        // 人がいる工場だけ、煙が上がり、箱が流れる
        g.userData.tick = (t, active) => {
          puffs.forEach((m, i) => { const p = (t * 0.35 + i / 3) % 1; m.visible = active; m.position.set(3.1 + p * 1.6, 5.6 + p * 3.2, -1.2); m.scale.setScalar(0.6 + p * 1.1); });
          crates.forEach((m, i) => { const p = (t * 0.25 + i / 3) % 1; m.visible = active; m.position.x = -2.5 + p * 5; });
        };
      }
      break;
    case "office":
      add(box(4.2, 5.6, 3.6), WALL, 0, 2.8, 0); add(box(4.5, 0.5, 3.9), color, 0, 5.85, 0);
      for (const y of [1.4, 2.9, 4.4]) for (const x of [-1.2, 0, 1.2]) add(box(0.8, 0.9, 0.1), 0x9fd0ea, x, y, 1.81);
      break;
    case "house": house(0, 0, 1.5); break;
    case "houses": house(-2.4, 0, 1); house(0.4, -0.8, 1.15); house(2.9, 0.3, 0.95); break;
    case "forest": tree(-2.6, 0, 1.2); tree(-0.6, -1.2, 1.5); tree(1.4, 0.2, 1.1); tree(3, -1, 1.35); tree(0.6, 1.4, 0.9); break;
    case "plaza":
      add(cyl(2.6, 2.6, 0.5, 20), STONE, 0, 0.25, 0); add(cyl(2.1, 2.1, 0.2, 20), 0x6db7e8, 0, 0.56, 0); add(cyl(0.3, 0.4, 1.6, 8), STONE, 0, 1.1, 0);
      { const w = add(new THREE.SphereGeometry(0.55, 10, 8), 0x9fd0ea, 0, 2.1, 0); g.userData.tick = (t) => { w.position.y = 2.1 + Math.sin(t * 3) * 0.25; w.scale.setScalar(1 + Math.sin(t * 3) * 0.15); }; }
      break;
    case "field":
      add(box(7, 0.25, 4.2), 0x9a7b4f, 0, 0.12, 0);
      for (let i = -3; i <= 3; i++) add(box(0.5, 0.5, 3.6), 0x6fae4f, i, 0.45, 0);
      break;
    case "market":
      for (const [x, z] of [[-1.9, -1], [1.9, -1], [-1.9, 1], [1.9, 1]]) add(cyl(0.12, 0.12, 2.6, 6), WOOD, x, 1.3, z);
      for (let i = 0; i < 4; i++) add(box(1.05, 0.25, 2.8), i % 2 ? 0xffffff : color, -1.57 + i * 1.05, 2.7, 0);
      add(box(3.6, 1, 1.6), WOOD, 0, 0.5, 0);
      for (let i = 0; i < 5; i++) add(new THREE.SphereGeometry(0.3, 8, 6), color, -1.2 + i * 0.6, 1.25, 0);
      break;
    case "bank":
      add(box(6, 0.5, 4.4), STONE, 0, 0.25, 0); add(box(5, 3, 3.4), WALL, 0, 2, -0.2);
      for (const x of [-1.9, -0.65, 0.65, 1.9]) add(cyl(0.26, 0.26, 3, 8), 0xffffff, x, 2, 1.7);
      { const r = add(cone(3.6, 1.5, 3), 0xc9a45c, 0, 4.3, 0.2); r.rotation.set(0, Math.PI / 6, 0); r.scale.z = 0.6; }
      break;
    case "castle":
      add(box(4.2, 3.4, 4.2), STONE, 0, 1.7, 0);
      for (const [x, z] of [[-2.1, -2.1], [2.1, -2.1], [-2.1, 2.1], [2.1, 2.1]]) { add(cyl(0.8, 0.9, 5, 10), STONE, x, 2.5, z); add(cone(1.05, 1.6, 10), color, x, 5.8, z); }
      add(cyl(0.06, 0.06, 2.2, 5), DARK, 0, 4.5, 0); add(box(1, 0.6, 0.06), color, 0.52, 5.2, 0);
      break;
    case "hall":
      add(cyl(3, 3.1, 2.2, 16), WALL, 0, 1.1, 0); add(cone(3.6, 2, 16), color, 0, 3.2, 0);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(box(0.5, 0.35, 0.5), WOOD, Math.cos(a) * 4, 0.18, Math.sin(a) * 4); } // 寄り合いの腰かけ
      break;
    case "tower":
      add(box(1.6, 5.6, 1.6), WOOD, 0, 2.8, 0); add(box(2.8, 0.3, 2.8), WOOD, 0, 5.7, 0); add(cone(2.1, 1.3), color, 0, 7.2, 0, Math.PI / 4);
      for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) add(cyl(0.1, 0.1, 1.3, 5), WOOD, x, 6.4, z);
      break;
    case "fort":
      add(box(5.4, 2.8, 4.4), DARK, 0, 1.4, 0);
      for (let i = -2; i <= 2; i++) { add(box(0.7, 0.7, 0.7), DARK, i * 1.15, 3.15, 1.85); add(box(0.7, 0.7, 0.7), DARK, i * 1.15, 3.15, -1.85); }
      add(cyl(0.06, 0.06, 2.6, 5), WOOD, 0, 4, 0); add(box(1.2, 0.7, 0.06), color, 0.62, 4.9, 0);
      break;
    case "manor":
      add(box(5.6, 2.6, 3.6), WALL, 0, 1.3, 0); add(cone(4.3, 2, 4), color, 0, 3.6, 0, Math.PI / 4).scale.z = 0.7; add(box(1.4, 3.8, 1.4), WALL, 2.6, 1.9, -1); add(cone(1.3, 1.4), color, 2.6, 4.5, -1, Math.PI / 4);
      break;
    case "site":
      for (const [x, z] of [[-2, -1.2], [2, -1.2], [-2, 1.2], [2, 1.2]]) add(cyl(0.1, 0.1, 4, 5), WOOD, x, 2, z);
      for (const y of [1.3, 2.6, 3.9]) { add(box(4.2, 0.12, 0.12), WOOD, 0, y, 1.2); add(box(4.2, 0.12, 0.12), WOOD, 0, y, -1.2); }
      for (let i = 0; i < 6; i++) add(box(0.9, 0.6, 0.9), STONE, 3.6 + (i % 2) * 1, 0.3 + Math.floor(i / 2) * 0.62, 0);
      break;
    case "tent":
      add(cone(2.6, 2.6, 6), 0xffffff, 0, 1.3, 0); add(box(1, 0.3, 0.08), color, 0, 1.3, 1.5); add(box(0.3, 1, 0.08), color, 0, 1.3, 1.5);
      break;
    case "flag":
      add(cyl(0.12, 0.12, 6, 6), WOOD, 0, 3, 0);
      { const f = add(box(2.4, 1.4, 0.1), color, 1.25, 5.2, 0); g.userData.tick = (t) => { f.rotation.y = Math.sin(t * 2.5) * 0.35; f.position.x = 1.25 * Math.cos(f.rotation.y); f.position.z = -1.25 * Math.sin(f.rotation.y); }; }
      break;
    default: return null;
  }
  return g;
}

export function createStage(root) {
  const THREE = window.THREE;
  root.innerHTML = "";
  root.classList.add("visual", "stage3d");
  if (!THREE) { root.innerHTML = `<p class="note" style="padding:16px;color:#3b2a27">3D表示の部品を読み込めませんでした。インターネット接続を確認して、ページを開き直してください。</p>`; return null; }
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  root.appendChild(renderer.domElement);
  const mk = (cls) => { const d = document.createElement("div"); d.className = cls; root.appendChild(d); return d; };
  const title = mk("v-cards"), panel = mk("v-result"), caption = mk("v-caption"), labels = mk("s-labels");
  const endCard = mk("s-end"); endCard.hidden = true;
  const bar = mk("s-bar");
  bar.innerHTML = `<button class="s-play">一時停止</button><input class="s-seek" type="range" min="0" max="0" value="0"><select class="s-speed"><option value="2200">ゆっくり</option><option value="1300" selected>ふつう</option><option value="600">速い</option></select>`;
  const [btn, seek, speedSel] = bar.children;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe3f7, 140, 300);
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 700);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6f9a5c, 0.74));
  const sun = new THREE.DirectionalLight(0xffffff, 0.38); sun.position.set(40, 80, 30); scene.add(sun);
  const mat = (color) => new THREE.MeshLambertMaterial({ color });
  const sea = new THREE.Mesh(new THREE.CircleGeometry(420, 48), mat(0x3aa0d8)); sea.rotation.x = -Math.PI / 2; sea.position.y = -1.2; scene.add(sea);
  const island = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.03, 1.6, 64), mat(0x7cc05f)); island.position.y = -0.8; scene.add(island);
  const world = new THREE.Group(); scene.add(world); // コマごとに作り直すもの(場所の台、地形)
  // 島のふちの木と岩、岸に寄せる波(島の大きさに合わせて並べ直す)
  const DECO = 70;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.42, 1.8, 6), mat(0x8a6a4a), DECO), leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 3.6, 7), mat(0x4f9a52), DECO);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat(0xa9a39b), 24);
  const foam = new THREE.Mesh(new THREE.RingGeometry(1.02, 1.06, 72), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })); foam.rotation.x = -Math.PI / 2; foam.position.y = -1.1;
  scene.add(trunks, leaves, rocks, foam);
  function placeDecor(R) {
    const d = new THREE.Object3D();
    for (let i = 0; i < DECO; i++) {
      const a = (i / DECO) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.06, r = R - 3 - (Math.sin(i * 78.233) * 0.5 + 0.5) * 5, k = (0.8 + (Math.sin(i * 3.7) * 0.5 + 0.5) * 0.9) * clamp(R / 60, 1, 1.8);
      // 手前(カメラ側)は見通しをよくするために木を置かない
      const hide = Math.cos(a - Math.PI / 2) > 0.45 ? 0.0001 : 1;
      d.scale.setScalar(k * hide); d.position.set(Math.cos(a) * r, 0.9 * k, Math.sin(a) * r); d.updateMatrix(); trunks.setMatrixAt(i, d.matrix);
      d.position.y = 3.3 * k; d.updateMatrix(); leaves.setMatrixAt(i, d.matrix);
    }
    for (let i = 0; i < 24; i++) { const a = i * 2.39996, r = R - 1.5, k = 0.8 + (i % 4) * 0.35; d.scale.set(k, k * 0.7, k); d.rotation.set(i, i * 2, 0); d.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r); d.updateMatrix(); rocks.setMatrixAt(i, d.matrix); }
    trunks.instanceMatrix.needsUpdate = leaves.instanceMatrix.needsUpdate = rocks.instanceMatrix.needsUpdate = true;
    foam.scale.set(R, R, 1);
  }

  const inst = (geo, color, n = MAX) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color }), n); m.frustumCulled = false; scene.add(m); return m; };
  const body = inst(new THREE.CylinderGeometry(0.34, 0.5, 0.95, 8), 0xffffff);
  const head = inst(new THREE.SphereGeometry(0.56, 12, 9), 0xfbe3cf);
  const hair = inst(new THREE.SphereGeometry(0.62, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), 0xffffff); // 帽子(場所の色に染める)
  // 「人」の代わりに「家」を並べる画面用
  const hWall = inst(new THREE.BoxGeometry(1.5, 1.15, 1.5), 0xf3ede2), hRoof = inst(new THREE.ConeGeometry(1.3, 1, 4), 0xffffff);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const structure = new THREE.Group(); scene.add(structure); // 橋など、コマごとに形が変わるもの
  const RUN = 60, runner = inst(new THREE.SphereGeometry(0.75, 10, 8), 0xffffff, RUN); // 村から村へ動く人や荷

  let t = 0; // 舞台の経過時間(秒)
  const S = { frames: [], zones: [], agents: [], at: 0, playing: true, timer: 0, R: 60, mode: "zones", terrain: null };
  const cam = { az: 0, pol: 0.98, dist: 150, target: new THREE.Vector3(0, 0, 0) };

  const slot = (z, k) => { const r = (S.gap ?? 0.95) * Math.sqrt(k + 0.5), t = k * 2.39996; return [z.x + Math.cos(t) * r, z.z + Math.sin(t) * r]; };

  function setFrames(frames, opts = {}) {
    S.mode = "zones"; S.frames = frames; S.opts = opts; S.at = 0; S.timer = 0; endCard.hidden = true;
    while (world.children.length) world.remove(world.children[0]);
    labels.innerHTML = "";
    const names = frames[0].zones.map((z) => z.name), n = names.length;
    const maxCount = names.map((_, i) => Math.max(...frames.map((f) => f.zones[i].count)));
    const total = Math.max(...frames.map((f) => f.zones.reduce((a, z) => a + z.count, 0)));
    S.scale = Math.max(1, Math.ceil(total / (opts.maxFigures ?? 520))); // 人形1体が表す人数
    S.figure = opts.figure ?? "person"; S.gap = S.figure === "house" ? 1.75 : 0.95;
    const rad = maxCount.map((c) => S.gap * Math.sqrt(c / S.scale + 1) + 2.2);
    const ring = opts.layout === "ring";
    const span = rad.reduce((a, r) => a + r * 2 + 5, 0);
    const R = ring ? Math.max(30, span / (2 * Math.PI) + 4) : 0;
    let x = -span / 2;
    S.zones = names.map((name, i) => {
      let zx, zz;
      if (ring) { const a = (i / n) * Math.PI * 2 - Math.PI / 2; zx = Math.cos(a) * R; zz = Math.sin(a) * R; }
      else { x += rad[i] + 2.5; zx = x; zz = 0; x += rad[i] + 2.5; }
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(rad[i], rad[i], 0.3, 40), mat(0xeadfbd)); pad.position.set(zx, 0.05, zz); world.add(pad);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(rad[i] + 0.5, rad[i] + 0.5, 0.12, 40), mat(0xffffff)); post.position.set(zx, 0.02, zz); world.add(post);
      const label = document.createElement("div"); label.className = "s-label"; labels.appendChild(label);
      // 建物を置く位置:輪なら外側、横並びなら奥
      const far = rad[i] + 3 + clamp(rad[i] / 5.5, 1.3, 3) * 3;
      const out = ring ? Math.hypot(zx, zz) : 1, bx = ring ? zx + (zx / out) * far : zx, bz = ring ? zz + (zz / out) * far : zz - far;
      return { name, x: zx, z: zz, r: rad[i], ring: post, label, list: [], bx, bz, face: ring ? Math.atan2(-zx, -zz) : 0, prop: null, propKey: null };
    });
    S.R = (ring ? R + Math.max(...rad) + 16 : Math.max(span / 2, Math.max(...rad) * 1.6 + 24)) + 14;
    // 画面ごとの置き物(工場・商店街・事務所など)。位置は島の半径に対する割合
    S.extra = []; S.propGroups = []; S.flows = [];
    for (const p of opts.props ?? []) {
      const g = buildProp(THREE, p.kind, p.color); if (!g) continue;
      g.position.set(p.x * S.R, 0, p.z * S.R); g.scale.setScalar((p.size ?? 1.3) * clamp(S.R / 42, 1, 2.6)); g.rotation.y = p.ry ?? 0; world.add(g); S.propGroups.push(g);
      if (p.label) { const label = document.createElement("div"); label.className = "s-label s-prop"; label.innerHTML = `<b>${esc(p.label)}</b>${esc(p.note ?? "")}`; labels.appendChild(label); S.extra.push({ x: p.x * S.R, z: p.z * S.R, label }); }
    }
    while (structure.children.length) structure.remove(structure.children[0]);
    S.bridge = null;
    if (opts.bridge) {
      // 川と橋。橋は進み具合に合わせて手前から伸び、色は強度で変わる
      const z0 = -S.R * 0.72, wide = S.R * 0.2, k = clamp(S.R / 42, 1, 2.6);
      const river = new THREE.Mesh(new THREE.BoxGeometry(S.R * 2.1, 0.3, wide), mat(0x6db7e8)); river.position.set(0, 0.06, z0); world.add(river);
      const bx = 0, n = 20, len = (wide + 6) / n, deck = [];
      for (let i = 0; i < n; i++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(5 * k, 0.9 * k, len * 0.94), new THREE.MeshLambertMaterial({ color: 0xb9b4ac })); seg.position.set(bx, 2.2 * k, z0 + wide / 2 + 3 - len * (i + 0.5)); seg.y0 = 2.2 * k; seg.visible = false; structure.add(seg); deck.push(seg);
        if (i % 4 === 2) { const pier = new THREE.Mesh(new THREE.BoxGeometry(1.4 * k, 2.2 * k, 1.4 * k), mat(0x9a948c)); pier.position.set(bx, 1.1 * k, seg.position.z); pier.visible = false; structure.add(pier); seg.pier = pier; }
      }
      const label = document.createElement("div"); label.className = "s-label s-prop"; labels.appendChild(label);
      S.bridge = { deck, label, x: bx, z: z0 };
      S.extra.push({ x: bx, z: z0, label });
    }
    island.scale.set(S.R, 1, S.R); placeDecor(S.R);
    cam.goal = S.R * 2.5; cam.dist = cam.goal * 1.7; cam.pol = ring ? 0.8 : 0.98; cam.az = -0.5; // 遠くから寄っていく
    const count = Math.min(MAX, Math.ceil(total / S.scale) + 4);
    S.agents = Array.from({ length: count }, (_, i) => ({ i, x: 0, z: 0, tx: 0, tz: 0, zone: -1, show: 0, heading: 0, phase: i * 0.7, color: 0xffffff }));
    seek.max = frames.length - 1; seek.value = 0;
    title.innerHTML = `<div class="v-card blue"><b>${esc(opts.title ?? "")}</b><span>${esc(opts.sub ?? "")}人形1体 = ${S.scale.toLocaleString("ja-JP")}${esc(opts.unit ?? "人")}</span></div>`;
    apply(0, true);
    S.playing = true; btn.textContent = "一時停止";
  }

  // コマの人数に合わせて、人を場所に割り当て直す
  function apply(index, jump = false) {
    const f = S.frames[index]; S.at = index; seek.value = index;
    const want = f.zones.map((z) => Math.round(z.count / S.scale));
    const free = [];
    S.zones.forEach((z, i) => { while (z.list.length > want[i]) free.push(z.list.pop()); });
    const idle = S.agents.filter((a) => a.zone === -1 && !free.includes(a));
    S.zones.forEach((z, i) => {
      while (z.list.length < want[i]) {
        const a = free.pop() ?? idle.pop();
        if (!a) break;
        if (a.zone === -1 && !jump) { const ang = Math.atan2(z.z, z.x) + (a.i % 7 - 3) * 0.05; a.x = Math.cos(ang) * (S.R - 3); a.z = Math.sin(ang) * (S.R - 3); } // 島の端から入ってくる
        a.zone = i; z.list.push(a);
      }
      z.list.forEach((a, k) => { [a.tx, a.tz] = slot(z, k); a.color = f.zones[i].color; if (jump || S.figure === "house") { a.x = a.tx; a.z = a.tz; } }); // 家は歩かず、その場に建つ
      const key = f.zones[i].build ? `${f.zones[i].build}|${f.zones[i].color}` : null;
      if (key !== z.propKey) {
        if (z.prop) world.remove(z.prop);
        z.prop = key ? buildProp(THREE, f.zones[i].build, f.zones[i].color) : null; z.propKey = key;
        if (z.prop) { z.prop.position.set(z.bx, 0, z.bz); z.prop.rotation.y = z.face; z.prop.scale.setScalar(clamp(z.r / 5.5, 1.3, 3)); world.add(z.prop); }
      }
      col.set(f.zones[i].color); z.ring.material.color.copy(col);
      z.label.innerHTML = `<b>${esc(f.zones[i].name)}</b>${esc(f.zones[i].note ?? "")} ${f.zones[i].count >= 0 ? `${Math.round(f.zones[i].count).toLocaleString("ja-JP")}${esc(S.opts.unit ?? "人")}` : ""}`;
    });
    if (S.bridge && f.bridge) {
      const B = S.bridge, built = Math.round(clamp(f.bridge.progress, 0, 1) * B.deck.length);
      col.set(0x8a6a4a).lerp(new THREE.Color(0xb9b4ac), clamp((f.bridge.quality - 0.4) / 0.6, 0, 1)); // 泥が多いほど茶色
      B.deck.forEach((seg, i) => { seg.built = i < built; seg.material.color.copy(col); if (!f.bridge.fallen) { seg.visible = seg.built; seg.position.y = seg.y0; seg.rotation.set(0, 0, 0); if (seg.pier) seg.pier.visible = seg.built; } });
      B.fallAt = f.bridge.fallen ? (B.fallAt ?? t) : null;
      B.label.innerHTML = `<b>橋</b>${f.bridge.fallen ? "崩れました" : `進み ${Math.round(f.bridge.progress * 100)}%・強度 ${Math.round(f.bridge.strength * 100)}%`}`;
    }
    for (const a of free) { a.zone = -1; if (S.figure === "house") { a.tx = a.x; a.tz = a.z; continue; } const ang = Math.atan2(a.z, a.x); a.tx = Math.cos(ang) * (S.R - 2); a.tz = Math.sin(ang) * (S.R - 2); } // 島を出ていく
    S.flows = [];
    for (const fl of f.flows ?? []) {
      const a = S.zones[fl.from], b = S.zones[fl.to]; if (!a || !b) continue;
      for (let k = 0; k < (fl.n ?? 3) && S.flows.length < RUN; k++) S.flows.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, color: fl.color, back: fl.back, delay: k * 0.07 });
    }
    const total = f.zones.reduce((x, z) => x + z.count, 0) || 1;
    panel.innerHTML = `<h4>${esc(f.label)}</h4>${f.zones.filter((z) => !z.hideBar).map((z) => `<div class="v-row"><span style="color:${z.color}">${esc(z.name)}</span><i><u style="width:${(z.count / total) * 100}%;background:${z.color}"></u></i></div>`).join("")}
      ${(f.gauges ?? []).map((g) => `<div class="v-row"><span>${esc(g.label)} ${esc(g.text)}</span><i><u style="width:${clamp(g.value, 0, 1) * 100}%;background:${g.color}"></u></i></div>`).join("")}`;
    caption.textContent = f.caption ?? "";
  }

  // 学び方:地形と、歩く人の道すじ
  function setTerrain({ height, paths, title: t, caption: capOf, labelOf }) {
    S.mode = "terrain"; S.frames = paths[0].map((_, i) => i); S.at = 0; S.timer = 0; endCard.hidden = true; S.paths = paths; S.capOf = capOf; S.labelOf = labelOf; S.height = height;
    while (world.children.length) world.remove(world.children[0]);
    labels.innerHTML = ""; for (const z of S.zones) z.list = []; S.zones = []; S.extra = []; S.figure = "person"; S.bridge = null;
    while (structure.children.length) structure.remove(structure.children[0]);
    const N = 70, size = 110, geo = new THREE.PlaneGeometry(size, size, N, N); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const h = height(pos.getX(i) / size + 0.5, 0.5 - pos.getZ(i) / size);
      pos.setY(i, h * 0.3);
      col.setHSL(0.3 - 0.22 * (h / 100), 0.5, 0.42 + 0.3 * (h / 100)); colors.set([col.r, col.g, col.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); mesh.position.y = 0.2; world.add(mesh);
    // いちばん高い場所に旗を立てる
    let top = { h: -1, x: 0.5, y: 0.5 };
    for (let i = 0; i <= 60; i++) for (let j = 0; j <= 60; j++) { const h = height(i / 60, j / 60); if (h > top.h) top = { h, x: i / 60, y: j / 60 }; }
    const flag = buildProp(THREE, "flag", "#b4473b"); flag.position.set((top.x - 0.5) * size, top.h * 0.3 + 0.2, (0.5 - top.y) * size); flag.scale.setScalar(1.5); world.add(flag); S.propGroups = [flag]; S.flows = [];
    for (const [x, z] of [[-0.8, 0.75], [-0.7, 0.82], [0.78, 0.8]]) { const h = buildProp(THREE, "house", "#c98bb5"); h.position.set(x * 62, 0, z * 62); world.add(h); } // ふもとの家
    S.size = size; S.R = 80; island.scale.set(S.R, 1, S.R); placeDecor(S.R + 6);
    cam.goal = 190; cam.dist = 320; cam.pol = 0.95; cam.az = 0;
    S.agents = paths.map((_, i) => ({ i, x: 0, z: 0, tx: 0, tz: 0, zone: 0, show: 1, heading: 0, phase: i, color: 0xb4473b, y: 0 }));
    seek.max = S.frames.length - 1; seek.value = 0;
    title.innerHTML = `<div class="v-card blue"><b>${esc(t)}</b><span>${paths.length}人が同じ山を歩きます。明るい色ほど高い場所です</span></div>`;
    applyTerrain(0, true);
    S.playing = true; btn.textContent = "一時停止";
  }
  function applyTerrain(index, jump = false) {
    S.at = index; seek.value = index;
    let sum = 0;
    S.agents.forEach((a, i) => {
      const p = S.paths[i][index];
      a.tx = (p.x - 0.5) * S.size; a.tz = (0.5 - p.y) * S.size; a.y = S.height(p.x, p.y) * 0.3 + 0.2; sum += S.height(p.x, p.y);
      if (jump) { a.x = a.tx; a.z = a.tz; }
    });
    panel.innerHTML = `<h4>${esc(S.labelOf(index))}</h4><div class="v-row"><span>いまの高さ(平均) ${Math.round(sum / S.agents.length)}点</span><i><u style="width:${sum / S.agents.length}%;background:#2f8f6b"></u></i></div>`;
    caption.textContent = S.capOf(index, sum / S.agents.length);
  }
  const step = (i, jump) => { endCard.hidden = true; return S.mode === "terrain" ? applyTerrain(i, jump) : apply(i, jump); };
  // 再生が終わったら、はじめとおわりを並べたまとめを出す
  function showEnd() {
    if (S.mode !== "zones" || S.frames.length < 2) return;
    const a = S.frames[0], b = S.frames[S.frames.length - 1], unit = S.opts.unit ?? "人", n = (v) => Math.round(v).toLocaleString("ja-JP");
    // 村が輪に並ぶ画面は、やり方ごとに村の数をまとめる。それ以外は場所ごとの人数
    const grouped = S.opts.layout === "ring";
    const tally = (f) => { const m = new Map(); for (const z of f.zones) { const k = grouped ? (z.note || z.name) : z.name; const e = m.get(k) ?? { v: 0, color: z.color }; e.v += grouped ? (z.count > 0 ? 1 : 0) : z.count; m.set(k, e); } return m; };
    const A = tally(a), B = tally(b), keys = [...new Set([...A.keys(), ...B.keys()])];
    const rows = keys.map((k) => `<tr><td><i style="background:${(B.get(k) ?? A.get(k)).color}"></i>${esc(k)}</td><td>${n(A.get(k)?.v ?? 0)}</td><td>→</td><td><b>${n(B.get(k)?.v ?? 0)}</b>${grouped ? "村" : esc(unit)}</td></tr>`).join("");
    const gauges = (b.gauges ?? []).map((g, i) => `<tr><td>${esc(g.label)}</td><td>${esc(a.gauges?.[i]?.text ?? "")}</td><td>→</td><td><b>${esc(g.text)}</b></td></tr>`).join("");
    // いちばん多い場所が入れかわった時点を探す
    const top = (f) => [...tally(f).entries()].sort((x, y) => y[1].v - x[1].v)[0]?.[0];
    const t0 = top(a), turn = S.frames.find((f) => top(f) !== t0);
    endCard.innerHTML = `<h4>${esc(a.label)} → ${esc(b.label)}</h4><table>${rows}${gauges}</table>
      ${turn ? `<p>${esc(turn.label)}に、最も多いのが「${esc(t0)}」から「${esc(top(turn))}」に変わりました。</p>` : `<p>最後まで、最も多いのは「${esc(t0)}」のままでした。</p>`}
      <button class="s-close">閉じる</button>`;
    endCard.hidden = false;
    endCard.querySelector(".s-close").onclick = () => (endCard.hidden = true);
  }

  btn.onclick = () => { S.playing = !S.playing; btn.textContent = S.playing ? "一時停止" : "再生"; if (S.playing && S.at >= S.frames.length - 1) step(0, true); };
  seek.oninput = () => { S.playing = false; btn.textContent = "再生"; step(Number(seek.value), true); };

  let drag = null;
  const dom = renderer.domElement; dom.style.touchAction = "none";
  dom.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener("pointermove", (e) => { if (!drag) return; cam.az -= (e.clientX - drag.x) * 0.005; cam.pol = clamp(cam.pol - (e.clientY - drag.y) * 0.004, 0.2, 1.45); drag = { x: e.clientX, y: e.clientY }; });
  dom.addEventListener("pointerup", () => (drag = null));
  dom.addEventListener("wheel", (e) => { e.preventDefault(); cam.goal = cam.dist = clamp(cam.dist * (1 + e.deltaY * 0.001), 20, 420); }, { passive: false });

  const v = new THREE.Vector3();
  let last = performance.now(), running = false;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const w = root.clientWidth, h = root.clientHeight;
    if (dom.width !== Math.floor(w * renderer.getPixelRatio()) || dom.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < 560 ? 58 : 42; camera.updateProjectionMatrix(); }
    const interval = Number(speedSel.value) * (S.mode === "terrain" ? 0.12 : 1);
    if (S.playing && S.frames.length) {
      S.timer += dt * 1000;
      if (S.timer > interval) { S.timer = 0; if (S.at < S.frames.length - 1) step(S.at + 1); else { S.playing = false; btn.textContent = "最初から"; showEnd(); } }
    }
    const pace = (S.mode === "terrain" ? 40 : 26) * (1300 / Number(speedSel.value));
    for (let i = 0; i < MAX; i++) {
      const a = S.agents[i];
      let sc = 0, y = 0;
      if (a) {
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        const walking = d > 0.15;
        if (walking) { const s = Math.min(d, pace * dt); a.x += (dx / d) * s; a.z += (dz / d) * s; a.heading = Math.atan2(dx, dz); }
        const visible = a.zone !== -1 || walking;
        a.show += ((visible ? 1 : 0) - a.show) * Math.min(1, dt * 6);
        sc = a.show * (S.mode === "terrain" ? 2.6 : 1.25);
        y = (a.y ?? 0) + (walking ? Math.abs(Math.sin(t * 9 + a.phase)) * 0.16 : 0);
        col.set(a.color); body.setColorAt(i, col); hRoof.setColorAt(i, col); hair.setColorAt(i, col); // 帽子と服を、その場所の色にする
      }
      const isHouse = S.figure === "house";
      dummy.rotation.set(0, isHouse ? Math.PI / 4 + (i % 3) * 0.1 : a?.heading ?? 0, 0);
      const hs = isHouse ? Math.max(a?.show ?? 0, 0.0001) : 0.0001, hx = a?.x ?? 0, hz = a?.z ?? 0;
      dummy.scale.setScalar(hs); dummy.position.set(hx, 0.58 * hs, hz); dummy.updateMatrix(); hRoof.setMatrixAt(i, dummy.matrix); // 仮置き(下で屋根の位置に直す)
      dummy.rotation.set(0, (i % 3) * 0.1, 0); dummy.updateMatrix(); hWall.setMatrixAt(i, dummy.matrix);
      dummy.rotation.set(0, Math.PI / 4 + (i % 3) * 0.1, 0); dummy.position.set(hx, 1.65 * hs, hz); dummy.updateMatrix(); hRoof.setMatrixAt(i, dummy.matrix);
      if (isHouse) sc = 0;
      dummy.rotation.set(0, a?.heading ?? 0, 0); dummy.scale.setScalar(Math.max(sc, 0.0001));
      const px = a?.x ?? 0, pz = a?.z ?? 0;
      dummy.position.set(px, y + 0.5 * sc, pz); dummy.updateMatrix(); body.setMatrixAt(i, dummy.matrix);
      dummy.position.set(px, y + 1.42 * sc, pz); dummy.updateMatrix(); head.setMatrixAt(i, dummy.matrix);
      dummy.position.set(px, y + 1.47 * sc, pz); dummy.updateMatrix(); hair.setMatrixAt(i, dummy.matrix);
    }
    body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = hair.instanceMatrix.needsUpdate = hWall.instanceMatrix.needsUpdate = hRoof.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (hRoof.instanceColor) hRoof.instanceColor.needsUpdate = true;
    if (hair.instanceColor) hair.instanceColor.needsUpdate = true;
    // 建物の動き(煙、流れる箱、噴水、旗)
    for (const z of S.zones) z.prop?.userData.tick?.(t, z.list.length > 0);
    for (const g of S.propGroups ?? []) g.userData.tick?.(t, true);
    // 村から村へ動く人や荷
    const prog = S.mode === "zones" && S.playing ? clamp(S.timer / interval, 0, 1) : 1;
    for (let i = 0; i < RUN; i++) {
      const f = S.flows?.[i];
      let sc = 0.0001, x = 0, y = 0, z = 0;
      if (f && prog < 1) {
        const p = clamp(prog * 1.25 - f.delay, 0, 1), q = f.back ? 1 - Math.abs(1 - 2 * p) : p; // 交易は行って帰る
        x = f.ax + (f.bx - f.ax) * q; z = f.az + (f.bz - f.az) * q; y = 1 + Math.sin(Math.PI * q) * 5; sc = p > 0 && p < 1 ? 1 : 0.0001;
        col.set(f.color); runner.setColorAt(i, col);
      }
      dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(sc); dummy.position.set(x, y, z); dummy.updateMatrix(); runner.setMatrixAt(i, dummy.matrix);
    }
    runner.instanceMatrix.needsUpdate = true; if (runner.instanceColor) runner.instanceColor.needsUpdate = true;
    // 橋が崩れる
    if (S.bridge?.fallAt != null) {
      const e = t - S.bridge.fallAt;
      S.bridge.deck.forEach((seg, i) => { const d = Math.max(0, e - i * 0.06); seg.visible = seg.built && d < 2.2; seg.position.y = seg.y0 - d * d * 9; seg.rotation.x = d * 1.6 * (i % 2 ? 1 : -1); seg.rotation.z = d * 0.9; if (seg.pier) seg.pier.visible = seg.built && d < 0.4; });
    }
    if (!drag && S.playing) cam.az += dt * 0.02;
    foam.material.opacity = 0.35 + Math.sin(t * 1.3) * 0.15; foam.scale.set(S.R * (1 + Math.sin(t * 1.3) * 0.008), S.R * (1 + Math.sin(t * 1.3) * 0.008), 1);
    if (cam.goal) cam.dist += (cam.goal - cam.dist) * Math.min(1, dt * 1.4);
    const sp = Math.sin(cam.pol), cp = Math.cos(cam.pol);
    camera.position.set(cam.target.x + Math.sin(cam.az) * sp * cam.dist, cp * cam.dist, cam.target.z + Math.cos(cam.az) * sp * cam.dist);
    camera.lookAt(cam.target);
    renderer.render(scene, camera);
    for (const e of S.extra ?? []) { v.set(e.x, 9 * clamp(S.R / 42, 1, 2.6), e.z).project(camera); e.label.style.left = `${clamp(((v.x + 1) / 2) * w, 50, w - 50)}px`; e.label.style.top = `${clamp(((1 - v.y) / 2) * h, 64, h - 60)}px`; }
    for (const z of S.zones) {
      v.set(z.x, 3.4, z.z - z.r).project(camera);
      z.label.style.left = `${clamp(((v.x + 1) / 2) * w, 50, w - 50)}px`; z.label.style.top = `${clamp(((1 - v.y) / 2) * h, 64, h - 60)}px`;
    }
  }
  const run = (on) => { if (on && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); } else if (!on) running = false; };
  // 画面から外れたら止める
  new IntersectionObserver((es) => run(es[0].isIntersecting)).observe(root);
  return { setFrames, setTerrain, run };
}

// コマが多すぎるときに間引く(最初と最後は必ず残す)
export function thin(list, max = 61) {
  if (list.length <= max) return list;
  const out = [];
  for (let i = 0; i < max; i++) out.push(list[Math.round((i / (max - 1)) * (list.length - 1))]);
  return out;
}

// 舞台は1つだけ作り、表示する場所へ移して使い回す(3D描画の枠を増やしすぎないため)
let shared = null, sharedRoot = null;
export function showStage(container, scroll = true) {
  if (!sharedRoot) { sharedRoot = document.createElement("div"); shared = createStage(sharedRoot); }
  container.innerHTML = "";
  container.appendChild(sharedRoot);
  shared?.run(true);
  if (scroll) sharedRoot.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return shared;
}
