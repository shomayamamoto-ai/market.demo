// 3Dの舞台:シミュレーションの結果を、島の上を歩く人の動きとして見せる共通の部品。
// 各画面は「コマ(frame)」の並びを渡す。1コマは、場所(zone)ごとの人数と色。
// コマが進むと、人数が増えた場所へ、減った場所から人が歩いて移る。
import { clamp } from "./rng.js";
import { esc } from "./charts.js";

const MAX = 720; // 一度に描く人の上限

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

  const inst = (geo, color, n = MAX) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color }), n); m.frustumCulled = false; scene.add(m); return m; };
  const body = inst(new THREE.CylinderGeometry(0.34, 0.5, 0.95, 8), 0xffffff);
  const head = inst(new THREE.SphereGeometry(0.56, 12, 9), 0xfbe3cf);
  const hair = inst(new THREE.SphereGeometry(0.6, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), 0x3a2b26);
  const dummy = new THREE.Object3D(), col = new THREE.Color();

  const S = { frames: [], zones: [], agents: [], at: 0, playing: true, timer: 0, R: 60, mode: "zones", terrain: null };
  const cam = { az: 0, pol: 0.98, dist: 150, target: new THREE.Vector3(0, 0, 0) };

  const slot = (z, k) => { const r = 0.95 * Math.sqrt(k + 0.5), t = k * 2.39996; return [z.x + Math.cos(t) * r, z.z + Math.sin(t) * r]; };

  function setFrames(frames, opts = {}) {
    S.mode = "zones"; S.frames = frames; S.opts = opts; S.at = 0; S.timer = 0;
    while (world.children.length) world.remove(world.children[0]);
    labels.innerHTML = "";
    const names = frames[0].zones.map((z) => z.name), n = names.length;
    const maxCount = names.map((_, i) => Math.max(...frames.map((f) => f.zones[i].count)));
    const total = Math.max(...frames.map((f) => f.zones.reduce((a, z) => a + z.count, 0)));
    S.scale = Math.max(1, Math.ceil(total / (opts.maxFigures ?? 520))); // 人形1体が表す人数
    const rad = maxCount.map((c) => 0.95 * Math.sqrt(c / S.scale + 1) + 2.2);
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
      return { name, x: zx, z: zz, r: rad[i], ring: post, label, list: [] };
    });
    S.R = (ring ? R + Math.max(...rad) : span / 2) + 14;
    island.scale.set(S.R, 1, S.R);
    cam.dist = S.R * 2.5; cam.pol = ring ? 0.8 : 0.98; cam.az = 0;
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
      z.list.forEach((a, k) => { [a.tx, a.tz] = slot(z, k); a.color = f.zones[i].color; if (jump) { a.x = a.tx; a.z = a.tz; } });
      col.set(f.zones[i].color); z.ring.material.color.copy(col);
      z.label.innerHTML = `<b>${esc(f.zones[i].name)}</b>${esc(f.zones[i].note ?? "")} ${f.zones[i].count >= 0 ? `${Math.round(f.zones[i].count).toLocaleString("ja-JP")}${esc(S.opts.unit ?? "人")}` : ""}`;
    });
    for (const a of free) { a.zone = -1; const ang = Math.atan2(a.z, a.x); a.tx = Math.cos(ang) * (S.R - 2); a.tz = Math.sin(ang) * (S.R - 2); } // 島を出ていく
    const total = f.zones.reduce((x, z) => x + z.count, 0) || 1;
    panel.innerHTML = `<h4>${esc(f.label)}</h4>${f.zones.filter((z) => !z.hideBar).map((z) => `<div class="v-row"><span style="color:${z.color}">${esc(z.name)}</span><i><u style="width:${(z.count / total) * 100}%;background:${z.color}"></u></i></div>`).join("")}
      ${(f.gauges ?? []).map((g) => `<div class="v-row"><span>${esc(g.label)} ${esc(g.text)}</span><i><u style="width:${clamp(g.value, 0, 1) * 100}%;background:${g.color}"></u></i></div>`).join("")}`;
    caption.textContent = f.caption ?? "";
  }

  // 学び方:地形と、歩く人の道すじ
  function setTerrain({ height, paths, title: t, caption: capOf, labelOf }) {
    S.mode = "terrain"; S.frames = paths[0].map((_, i) => i); S.at = 0; S.timer = 0; S.paths = paths; S.capOf = capOf; S.labelOf = labelOf; S.height = height;
    while (world.children.length) world.remove(world.children[0]);
    labels.innerHTML = ""; for (const z of S.zones) z.list = []; S.zones = [];
    const N = 70, size = 110, geo = new THREE.PlaneGeometry(size, size, N, N); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const h = height(pos.getX(i) / size + 0.5, 0.5 - pos.getZ(i) / size);
      pos.setY(i, h * 0.3);
      col.setHSL(0.3 - 0.22 * (h / 100), 0.5, 0.42 + 0.3 * (h / 100)); colors.set([col.r, col.g, col.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3)); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); mesh.position.y = 0.2; world.add(mesh);
    S.size = size; S.R = 80; island.scale.set(S.R, 1, S.R);
    cam.dist = 190; cam.pol = 0.95; cam.az = 0.5;
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
  const step = (i, jump) => (S.mode === "terrain" ? applyTerrain(i, jump) : apply(i, jump));

  btn.onclick = () => { S.playing = !S.playing; btn.textContent = S.playing ? "一時停止" : "再生"; if (S.playing && S.at >= S.frames.length - 1) step(0, true); };
  seek.oninput = () => { S.playing = false; btn.textContent = "再生"; step(Number(seek.value), true); };

  let drag = null;
  const dom = renderer.domElement; dom.style.touchAction = "none";
  dom.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener("pointermove", (e) => { if (!drag) return; cam.az -= (e.clientX - drag.x) * 0.005; cam.pol = clamp(cam.pol - (e.clientY - drag.y) * 0.004, 0.2, 1.45); drag = { x: e.clientX, y: e.clientY }; });
  dom.addEventListener("pointerup", () => (drag = null));
  dom.addEventListener("wheel", (e) => { e.preventDefault(); cam.dist = clamp(cam.dist * (1 + e.deltaY * 0.001), 20, 420); }, { passive: false });

  const v = new THREE.Vector3();
  let last = performance.now(), running = false, t = 0;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const w = root.clientWidth, h = root.clientHeight;
    if (dom.width !== Math.floor(w * renderer.getPixelRatio()) || dom.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < 560 ? 58 : 42; camera.updateProjectionMatrix(); }
    const interval = Number(speedSel.value) * (S.mode === "terrain" ? 0.12 : 1);
    if (S.playing && S.frames.length) {
      S.timer += dt * 1000;
      if (S.timer > interval) { S.timer = 0; if (S.at < S.frames.length - 1) step(S.at + 1); else { S.playing = false; btn.textContent = "再生"; } }
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
        col.set(a.color); body.setColorAt(i, col);
      }
      dummy.rotation.set(0, a?.heading ?? 0, 0); dummy.scale.setScalar(Math.max(sc, 0.0001));
      const px = a?.x ?? 0, pz = a?.z ?? 0;
      dummy.position.set(px, y + 0.5 * sc, pz); dummy.updateMatrix(); body.setMatrixAt(i, dummy.matrix);
      dummy.position.set(px, y + 1.42 * sc, pz); dummy.updateMatrix(); head.setMatrixAt(i, dummy.matrix);
      dummy.position.set(px, y + 1.47 * sc, pz); dummy.updateMatrix(); hair.setMatrixAt(i, dummy.matrix);
    }
    body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = hair.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (!drag && S.playing) cam.az += dt * 0.02;
    const sp = Math.sin(cam.pol), cp = Math.cos(cam.pol);
    camera.position.set(cam.target.x + Math.sin(cam.az) * sp * cam.dist, cp * cam.dist, cam.target.z + Math.cos(cam.az) * sp * cam.dist);
    camera.lookAt(cam.target);
    renderer.render(scene, camera);
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
export function showStage(container) {
  if (!sharedRoot) { sharedRoot = document.createElement("div"); shared = createStage(sharedRoot); }
  container.innerHTML = "";
  container.appendChild(sharedRoot);
  shared?.run(true);
  sharedRoot.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return shared;
}
