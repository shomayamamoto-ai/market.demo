// 3Dビジュアル:ペルソナ1人ずつが島を歩き、選んだゲートの後ろに並ぶ。
// 描画には three.js(window.THREE)を使う。
import { makeRng, clamp } from "./rng.js";
import { CATEGORY_LABEL, ageBandOf, AGE_BANDS } from "./constants.js";
import { buyProbability, stratifiedSample } from "./market.js";
import { describePersona } from "./personas.js";

const BLUE = 0x2f6fe4, RED = 0xe2574c;
const GATE_X = 31, ISLAND = 106, COLS = 30, GAP = 1.9, SIZE = 1.45;

// 統計モードでの「その人がそう選んだ理由」
function reasonOf(p, product, bought) {
  const cat = CATEGORY_LABEL[product.category];
  const month = p.spend[product.category];
  const share = (product.price * product.perYear) / Math.max(month * 12, 1);
  const pctText = `${Math.round(share * 100)}%`;
  if (bought) {
    return share < 0.15
      ? `${cat}に月${month.toLocaleString()}円使っており、負担が小さい(年間支出の${pctText})`
      : `${cat}の年間支出の${pctText}にあたるが、価値観に合うと感じた`;
  }
  if (share > 0.5) return `${cat}の予算に対して高い(年間支出の${pctText}にあたる)`;
  const a = product.appeal ?? {};
  const fit = (a.novelty ?? 0) * (p.traits.novelty - 0.5) + (a.health ?? 0) * (p.traits.health - 0.5) + (a.quality ?? 0) * (p.traits.quality - 0.5) + (a.cheap ?? 0) * (p.traits.price - 0.5);
  if (fit < -0.03) return "訴求点が、この人の価値観と合わない";
  if (p.traits.price > 0.65) return "価格に敏感で、新しい出費には慎重";
  return "今の暮らしで足りており、必要を感じない";
}

// 1人ずつの選択を決める。B案があれば A/B/どちらも買わない、無ければ 買う/買わない
export function decide(sample, productA, productB, seed) {
  const rng = makeRng(seed);
  return sample.map((p) => {
    const pa = buyProbability(p, productA), pb = productB ? buyProbability(p, productB) : 0;
    const u = rng.next();
    let choice;
    if (productB) choice = u < Math.max(pa, pb) ? (rng.next() < pa / Math.max(pa + pb, 1e-9) ? "blue" : "red") : "none";
    else choice = u < pa ? "blue" : "red";
    const bought = productB ? choice !== "none" : choice === "blue";
    const chosen = choice === "red" && productB ? productB : productA;
    return { p, choice, bought, reason: reasonOf(p, chosen, bought) };
  });
}

export function createVisual(root, fmt) {
  const THREE = window.THREE;
  const el = (cls, html = "") => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; root.appendChild(d); return d; };
  root.innerHTML = "";
  if (!THREE) { root.innerHTML = `<p class="note" style="padding:16px">3D表示の部品を読み込めませんでした。インターネット接続を確認して、ページを開き直してください。</p>`; return null; }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  root.appendChild(renderer.domElement);
  const cards = el("v-cards"), result = el("v-result"), caption = el("v-caption"), tag = el("v-tag");
  result.hidden = tag.hidden = true;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe3f7, 120, 260);
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 600);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6f9a5c, 0.72));
  const sun = new THREE.DirectionalLight(0xffffff, 0.38);
  sun.position.set(40, 80, 30);
  scene.add(sun);

  // ---- 島・広場・海・家・木 ----
  const mat = (color) => new THREE.MeshLambertMaterial({ color });
  const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 48), mat(0x3aa0d8));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -1.2; scene.add(sea);
  const island = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND, ISLAND + 3, 1.6, 64), mat(0x7cc05f));
  island.position.y = -0.8; scene.add(island);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(24, 48), mat(0xd9c89a));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.02, 14); scene.add(plaza);
  const deco = makeRng(11);
  for (let i = 0; i < 64; i++) {
    const ang = deco.next() * Math.PI * 2, r = ISLAND - 4 - deco.next() * 5;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    if (i % 3 === 0) {
      const w = 3 + deco.next() * 2;
      const house = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, w), mat(0xf3ede2));
      house.position.set(x, 1.3, z);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.8, 1.8, 4), mat([0xd98a5c, 0x6da7d8, 0xc98bb5, 0xe2c15a][i % 4]));
      roof.position.set(x, 3.5, z); roof.rotation.y = Math.PI / 4;
      scene.add(house, roof);
    } else {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.6, 6), mat(0x8a6a4a));
      trunk.position.set(x, 0.8, z);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1.9 + deco.next(), 10, 8), mat(0x4f9a52));
      leaf.position.set(x, 3.2, z);
      scene.add(trunk, leaf);
    }
  }
  // ---- ゲート(2本の柱とアーチ) ----
  const gate = (x, color) => {
    const g = new THREE.Group(), m = mat(color);
    for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 8, 12), m); post.position.set(s * 4, 4, 0); g.add(post); }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(4, 0.55, 10, 24, Math.PI), m); arch.position.y = 8; g.add(arch);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.3, 0.3), mat(0xffffff)); sign.position.y = 7.2; g.add(sign);
    g.position.set(x, 0, 0); g.scale.setScalar(1.6); scene.add(g);
  };
  gate(-GATE_X, BLUE); gate(GATE_X, RED);

  // ---- 人(まとめて描画) ----
  let N = 0, agents = [], meshes = null, labelsText = { blue: "買う", red: "買わない" };
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  function buildCrowd(n) {
    if (meshes) for (const m of Object.values(meshes)) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    N = n;
    const inst = (geo, color) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color }), n); m.frustumCulled = false; scene.add(m); return m; };
    meshes = {
      body: inst(new THREE.CylinderGeometry(0.34, 0.5, 0.95, 10), 0xffffff),
      head: inst(new THREE.SphereGeometry(0.56, 14, 10), 0xfbe3cf),
      hair: inst(new THREE.SphereGeometry(0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), 0xffffff),
      eyes: new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 6, 5), new THREE.MeshBasicMaterial({ color: 0x1b1b22 }), n * 2),
    };
    meshes.eyes.frustumCulled = false; scene.add(meshes.eyes);
  }

  const state = { phase: "idle", t: 0, speed: 1, picked: -1, data: null, shown: { blue: 0, red: 0 }, captions: [], capAt: 0 };
  const rnd = makeRng(5);
  const wanderPoint = (rMin = 6, rMax = ISLAND - 14) => { const a = rnd.next() * Math.PI * 2, r = rMin + Math.sqrt(rnd.next()) * (rMax - rMin); return [Math.cos(a) * r, Math.sin(a) * r * 0.9 - 4]; };

  function setCrowd(decisions, opts) {
    labelsText = opts.labels;
    buildCrowd(decisions.length);
    const HAIR = [0x2b2320, 0x4a3426, 0x6b4a32];
    agents = decisions.map((d, i) => {
      const [x, z] = wanderPoint();
      const [tx, tz] = wanderPoint();
      const child = d.p.age < 15;
      const a = { ...d, i, x, z, tx, tz, heading: 0, scale: (child ? 0.7 : 1) * SIZE, pace: 3.2 + rnd.next() * 1.8, phase: rnd.next() * 6.28, arrived: false, slot: null };
      col.setHex(d.p.age >= 65 ? 0xd9d9de : HAIR[i % 3]); meshes.hair.setColorAt(i, col);
      col.setHex(d.p.sex === "male" ? 0x3f8fd6 : 0xf0f0f4); meshes.body.setColorAt(i, col);
      return a;
    });
    meshes.hair.instanceColor.needsUpdate = meshes.body.instanceColor.needsUpdate = true;
    state.phase = "wander"; state.data = opts; state.picked = -1; cam.goal = { ...HOME }; state.shown = { blue: 0, red: 0 };
    result.hidden = tag.hidden = true;
    cards.innerHTML = `<div class="v-card blue"><b>青ゲート</b><span>${fmt.esc(opts.cards.blue)}</span></div><div class="v-card red"><b>赤ゲート</b><span>${fmt.esc(opts.cards.red)}</span></div>`;
    say([opts.intro, "「スタート」を押すと、1人ずつが自分の家計と価値観で選び、ゲートに向かいます。"]);
  }

  function start() {
    if (!agents.length || state.phase === "walk") return;
    const count = { blue: 0, red: 0 };
    for (const a of agents) {
      a.arrived = false;
      if (a.choice === "none") { a.slot = null; continue; }
      const k = count[a.choice]++;
      const side = a.choice === "blue" ? -1 : 1;
      a.slot = [side * GATE_X + ((k % COLS) - (COLS - 1) / 2) * GAP, -16 - Math.floor(k / COLS) * GAP];
      a.wait = rnd.next() * 5; // 一斉に動かないよう、出発をばらす
    }
    state.phase = "walk"; state.t = 0; state.shown = { blue: 0, red: 0 };
    result.hidden = false;
    say([`青いゲートは「${labelsText.blue}」、赤いゲートは「${labelsText.red}」。`, ...(state.data.hasNone ? ["どちらも選ばない人は、広場の外を歩き続けます。"] : [])]);
  }

  function say(lines) { state.captions = lines.filter(Boolean); state.capAt = 0; caption.textContent = state.captions[0] ?? ""; state.capT = 0; }

  function finish() {
    state.phase = "done";
    const D = state.data, total = agents.length, w = D.weight;
    const n = { blue: agents.filter((a) => a.choice === "blue").length, red: agents.filter((a) => a.choice === "red").length };
    const buyers = agents.filter((a) => a.bought);
    const band = AGE_BANDS.map((b) => { const g = agents.filter((a) => ageBandOf(a.p.age) === b.label); return { label: b.label, n: g.length, rate: g.length ? g.filter((a) => a.bought).length / g.length : 0 }; }).filter((b) => b.n >= 20).sort((a, b) => b.rate - a.rate)[0];
    const reasons = new Map();
    for (const a of agents) if (!a.bought) { const key = a.reason.replace(/(.*?)/g, ""); reasons.set(key, (reasons.get(key) || 0) + 1); }
    const top = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
    const old = agents.filter((a) => a.p.age >= 65), young = agents.filter((a) => a.p.age < 40);
    const rate = (g) => (g.length ? g.filter((a) => a.bought).length / g.length : 0);
    say([
      D.hasNone
        ? `青「${labelsText.blue}」が${n.blue}人、赤「${labelsText.red}」が${n.red}人。どちらも選ばなかった人は${total - n.blue - n.red}人でした。`
        : `「${labelsText.blue}」を選んだのは${total}人のうち${n.blue}人。実際の人数に直すと約${fmt.fmtPeople(n.blue * w)}です。`,
      D.hasNone && `多かったのは${n.blue >= n.red ? "青" : "赤"}ゲート。差は${Math.abs(n.blue - n.red)}人(約${fmt.fmtPeople(Math.abs(n.blue - n.red) * w)})です。`,
      band && `買った人の割合が最も高い年代は${band.label}で、${fmt.pct(band.rate)}でした。`,
      old.length >= 20 && young.length >= 20 && `39歳以下では${fmt.pct(rate(young))}、65歳以上では${fmt.pct(rate(old))}。世代で反応が分かれます。`,
      top && `買わなかった理由で最も多いのは「${top[0]}」で、${top[1]}人でした。`,
      `買った${buyers.length}人が全員、年${fmt.num(D.perYear, 1)}回買うと、年間の売上は約${fmt.fmtYen(sum(agents, (a) => (a.bought ? (a.choice === "red" && D.priceB ? D.priceB * D.perYearB : D.price * D.perYear) : 0)) * w)}です。`,
      "気になる人をクリックすると、その人の事情が見られます。ドラッグで視点を回せます。",
    ]);
  }
  const sum = (arr, f) => arr.reduce((x, y) => x + f(y), 0);

  // ---- 視点操作 ----
  const HOME = { az: 0, pol: 1.02, dist: 132, x: 0, y: 0, z: -22 };
  const cam = { ...HOME, target: new THREE.Vector3(HOME.x, HOME.y, HOME.z), goal: { ...HOME } };
  let drag = null;
  const dom = renderer.domElement;
  dom.style.touchAction = "none";
  dom.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
    cam.goal.az = cam.az -= dx * 0.005; cam.goal.pol = cam.pol = clamp(cam.pol - dy * 0.004, 0.18, 1.45);
  });
  dom.addEventListener("pointerup", (e) => { if (drag && drag.moved < 6) pick(e); drag = null; });
  dom.addEventListener("wheel", (e) => { e.preventDefault(); cam.goal.dist = cam.dist = clamp(cam.dist * (1 + e.deltaY * 0.001), 12, 240); }, { passive: false });

  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  function pick(e) {
    if (!meshes) return;
    const r = dom.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects([meshes.head, meshes.body, meshes.hair])[0];
    state.picked = hit ? hit.instanceId : -1;
    tag.hidden = state.picked < 0;
    // 選んだ人に寄る。何もない所をクリックしたら全体に戻る
    if (state.picked < 0) cam.goal = { ...HOME };
    else cam.goal = { ...cam.goal, dist: 13, pol: 1.15 };
    if (state.picked >= 0) {
      const a = agents[state.picked];
      const decided = state.phase === "walk" || state.phase === "done";
      const choiceText = !decided ? "まだ選んでいません" : a.choice === "none" ? "どちらも選ばない" : `${a.choice === "blue" ? "青" : "赤"}ゲート「${labelsText[a.choice]}」`;
      tag.innerHTML = `<b>ID:${a.p.id} ${fmt.esc(describePersona(a.p))}</b>
        <span>年収 ${fmt.num(a.p.income)}万円・月の支出 ${fmt.num(a.p.spendTotal)}円</span>
        <span class="v-choice ${decided ? a.choice : ""}">${choiceText}</span>${decided ? `<span>理由:${fmt.esc(a.reason)}</span>` : ""}`;
    }
  }

  // ---- 毎フレームの更新 ----
  const v = new THREE.Vector3();
  let last = performance.now(), running = false;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000) * state.speed; last = now;
    const w = root.clientWidth, h = root.clientHeight;
    if (dom.width !== Math.floor(w * renderer.getPixelRatio()) || dom.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < 560 ? 58 : 42; camera.updateProjectionMatrix(); }
    state.t += dt;

    let moving = 0;
    const shown = { blue: 0, red: 0 };
    for (const a of agents) {
      let tx = a.tx, tz = a.tz, pace = a.pace * 0.35;
      const going = (state.phase === "walk" || state.phase === "done") && a.slot;
      if (going) {
        if (state.t < a.wait) { /* 出発待ち:その場で歩く */ }
        else if (a.passed) { [tx, tz] = a.slot; pace = a.pace * 2.4; }
        else { tx = (a.choice === "blue" ? -1 : 1) * GATE_X + ((a.i % 5) - 2) * 1.1; tz = 2; pace = a.pace * 2.4; } // まずゲートをくぐる
      }
      const dx = tx - a.x, dz = tz - a.z, dist = Math.hypot(dx, dz);
      if (dist > 0.25) {
        const step = Math.min(dist, pace * dt);
        a.x += (dx / dist) * step; a.z += (dz / dist) * step;
        const want = Math.atan2(dx, dz);
        let diff = want - a.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        a.heading += diff * Math.min(1, dt * 8);
        a.walk = true; if (going) moving++;
      } else if (going && state.t >= a.wait && !a.passed) a.passed = true;
      else if (going) { a.walk = false; a.arrived = true; a.heading += (0 - a.heading) * Math.min(1, dt * 4); }
      else { [a.tx, a.tz] = a.choice === "none" && state.phase !== "wander" ? wanderPoint(62, ISLAND - 12) : wanderPoint(); }
      if (going && a.passed) shown[a.choice]++;

      const bob = a.walk ? Math.abs(Math.sin(state.t * 9 + a.phase)) * 0.16 : 0;
      const s = a.scale, sin = Math.sin(a.heading), cos = Math.cos(a.heading);
      dummy.rotation.set(0, a.heading, 0); dummy.scale.setScalar(s);
      dummy.position.set(a.x, (0.5 + bob) * s, a.z); dummy.updateMatrix(); meshes.body.setMatrixAt(a.i, dummy.matrix);
      dummy.position.set(a.x, (1.42 + bob) * s, a.z); dummy.updateMatrix(); meshes.head.setMatrixAt(a.i, dummy.matrix);
      dummy.position.set(a.x - sin * 0.05 * s, (1.47 + bob) * s, a.z - cos * 0.05 * s); dummy.updateMatrix(); meshes.hair.setMatrixAt(a.i, dummy.matrix);
      for (const e of [0, 1]) {
        const ox = (e ? 0.2 : -0.2) * s, oz = 0.5 * s;
        dummy.position.set(a.x + cos * ox + sin * oz, (1.42 + bob) * s, a.z - sin * ox + cos * oz); dummy.updateMatrix();
        meshes.eyes.setMatrixAt(a.i * 2 + e, dummy.matrix);
      }
    }
    if (meshes) for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true;

    if (state.phase === "walk" || state.phase === "done") {
      const total = Math.max(agents.length, 1), D = state.data;
      const bar = (k) => `<div class="v-row ${k}"><span>${k === "blue" ? "青" : "赤"}:${fmt.esc(labelsText[k])}</span><i><u style="width:${(shown[k] / total) * 100}%"></u></i><b>${shown[k]}</b></div>`;
      const html = `<h4>${fmt.esc(D.title)}</h4><p>${total}人(1人 = 約${fmt.fmtPeople(D.weight)})</p>${bar("blue")}${bar("red")}` +
        (state.phase === "done" ? `<p class="v-verdict ${!D.hasNone || shown.blue >= shown.red ? "blue" : "red"}">${D.hasNone ? `${shown.blue >= shown.red ? "青" : "赤"}ゲートが優勢` : `購入率 ${fmt.pct(shown.blue / total)}`}</p>` : "");
      if (result.innerHTML !== html) result.innerHTML = html;
      if (state.phase === "walk" && state.t > 6 && moving === 0) finish();
    }
    // 字幕を順に送る
    state.capT = (state.capT ?? 0) + dt / state.speed;
    if (state.captions.length > 1 && state.capT > 5.5) { state.capT = 0; state.capAt = (state.capAt + 1) % state.captions.length; caption.textContent = state.captions[state.capAt]; }

    // カメラ
    if (state.picked >= 0) { const a = agents[state.picked]; cam.goal.x = a.x; cam.goal.y = 1.5; cam.goal.z = a.z; }
    const ease = Math.min(1, (dt / state.speed) * 3);
    cam.az += (cam.goal.az - cam.az) * ease; cam.pol += (cam.goal.pol - cam.pol) * ease; cam.dist += (cam.goal.dist - cam.dist) * ease;
    cam.target.x += (cam.goal.x - cam.target.x) * ease; cam.target.y += (cam.goal.y - cam.target.y) * ease; cam.target.z += (cam.goal.z - cam.target.z) * ease;
    const sp = Math.sin(cam.pol), cp = Math.cos(cam.pol);
    camera.position.set(cam.target.x + Math.sin(cam.az) * sp * cam.dist, cam.target.y + cp * cam.dist, cam.target.z + Math.cos(cam.az) * sp * cam.dist);
    camera.lookAt(cam.target);
    renderer.render(scene, camera);

    if (state.picked >= 0) {
      const a = agents[state.picked];
      v.set(a.x, 2.4 * a.scale, a.z).project(camera);
      tag.style.left = `${clamp(((v.x + 1) / 2) * w, 110, w - 110)}px`;
      tag.style.top = `${clamp(((1 - v.y) / 2) * h, 70, h - 10)}px`;
    }
  }

  return {
    setCrowd, start,
    setSpeed: (s) => (state.speed = s),
    run: (on) => { if (on && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); } else if (!on) running = false; },
    get phase() { return state.phase; },
  };
}

// 画面から呼ぶ:対象者を選び、選択を決めて、群衆を配置する
export function prepareCrowd(visual, { personas, productA, productB, n, seed, fmt }) {
  const sample = stratifiedSample(personas, productA.target, n, seed);
  if (!sample.length) return null;
  const decisions = decide(sample, productA, productB, seed + 17);
  const weight = sample.reduce((a, p) => a + p.sampleWeight, 0) / sample.length;
  const priceText = (p) => `${fmt.num(p.price)}円 × 年${fmt.num(p.perYear, 1)}回`;
  visual.setCrowd(decisions, {
    title: productA.name, weight, hasNone: Boolean(productB),
    price: productA.price, perYear: productA.perYear, priceB: productB?.price, perYearB: productB?.perYear,
    labels: productB ? { blue: `A案 ${fmt.num(productA.price)}円`, red: `B案 ${fmt.num(productB.price)}円` } : { blue: "買う", red: "買わない" },
    cards: productB ? { blue: `A案:${priceText(productA)}`, red: `B案:${priceText(productB)}` } : { blue: `買う(${priceText(productA)})`, red: "買わない" },
    intro: `「${productA.name}」の対象者から${sample.length}人を選びました。1人が約${fmt.fmtPeople(weight)}を代表します。`,
  });
  return { sample, decisions };
}
