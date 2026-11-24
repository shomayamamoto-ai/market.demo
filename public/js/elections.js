// 得票と議席:衆議院の選挙制度(小選挙区+比例代表11ブロック)で、得票率から議席数を試算する。
// 比例代表は、制度どおりのドント式で計算する(名簿不足の上限つき)。小選挙区は、選挙区ごとの実際の得票に全国の得票率の変化を足して試算し(一律スイング)、誤差の大きさを示す。
import ED from "./election-data.js";
import SMD from "./smd-data.js";
import { esc, multiLine } from "./charts.js";

export const ELECTION_ASSUMPTIONS = {
  dhondt: { value: "ドント式", note: "比例代表の議席の分け方。各党の得票を1、2、3…で割り、商の大きい順に議席を配る。制度の決まりどおり" },
  shortage: { value: "公式の配分から逆算した上限", note: "比例代表で、名簿に載せた候補者が足りない党の議席は、ほかの党に回る。過去8回の88ブロックのうち12ブロックで起きた。ドント式の計算より公式の議席が少なかった党を「名簿が足りなくなった党」とみなし、そのブロックでの議席の上限を公式の議席数にした。名簿の人数そのものは確認していない。また、小選挙区で当選した重複立候補者は名簿から外れるので、本当の上限は小選挙区の結果でも変わるが、ここでは固定している。得票率を上げても、上限のある党はそのブロックで議席が増えない" },
  blockSwing: { value: "全ブロックで同じ倍率", note: "比例代表の得票率を変えたとき、各ブロックでのその党の得票を、全国での増減と同じ倍率で動かす。地域ごとの強さの変化は入れていない" },
  smd: { value: "選挙区ごとの一律スイング", note: "小選挙区の試算。基準にした選挙の各選挙区の実際の得票率(総務省 候補者別得票数)に、各党の全国得票率の変化をそのまま足し、いちばん多い候補を当選とする。その選挙で候補を立てなかった党は議席が増えない。k を入力したときだけ、全国の得票率から「議席の割合 ∝ 得票率の k 乗」で配る古い方式を使う(過去8回で k は約1〜6とばらつく)" },
  independent: { value: "そのまま据え置き", note: "無所属・諸派の小選挙区の議席は、基準にした選挙のままとする" },
};

// ドント式:votes(党ごとの得票)に seats 議席を配る
// caps(党ごとの議席の上限。名簿の人数)を渡すと、上限に達した党は飛ばして次の党に配る
export function dhondt(votes, seats, caps = []) {
  const got = votes.map(() => 0);
  for (let s = 0; s < seats; s++) { let best = -1, top = -1; votes.forEach((v, i) => { if (caps[i] != null && got[i] >= caps[i]) return; const q = v / (got[i] + 1); if (q > top) { top = q; best = i; } }); if (best < 0) break; got[best]++; }
  return got;
}
// 名簿が足りなくなった党の上限:ドント式の計算より公式の議席が少なかった党は、公式の議席数を上限とみなす(選挙・ブロックごと)
const CAPS = new Map();
export function listCaps(election, block) {
  const key = `${election.name}|${block.name ?? block.block}`;
  if (!CAPS.has(key)) { const g = dhondt(block.parties.map((p) => p[1]), block.seats); CAPS.set(key, block.parties.map((p, i) => (g[i] > p[2] ? p[2] : null))); }
  return CAPS.get(key);
}
// 比例代表:党ごとの得票の倍率(全国)を各ブロックに掛けて、ブロックごとにドント式で配る。返り値は 党名→議席
export function prSeats(election, scale = {}) {
  const total = {};
  for (const b of election.pr.blocks) { const votes = b.parties.map(([name, v]) => v * (scale[name] ?? 1)), got = dhondt(votes, b.seats, listCaps(election, b)); b.parties.forEach(([name], i) => { total[name] = (total[name] ?? 0) + got[i]; }); }
  return total;
}
// 小選挙区:得票率の k 乗に比例して議席を配る(最大剰余で整数にする)。fixed は据え置く党
export function smdSeats(shares, seats, k) {
  const w = shares.map((v) => Math.max(v, 0) ** k), sum = w.reduce((a, b) => a + b, 0) || 1, raw = w.map((x) => (x / sum) * seats), out = raw.map(Math.floor);
  let rest = seats - out.reduce((a, b) => a + b, 0);
  for (const [, i] of raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0])) { if (rest-- <= 0) break; out[i]++; }
  return out;
}
const isOther = (name) => /無所属|諸派/.test(name);
// その選挙の小選挙区の結果をいちばんよく再現する k と、そのときの議席のずれ(党ごとのずれの絶対値の合計 ÷ 2)
export function fitK(election) {
  const P = election.smd.parties.filter(([n]) => !isOther(n)), seats = P.reduce((a, p) => a + p[2], 0), err = (k) => { const g = smdSeats(P.map((p) => p[1]), seats, k); return P.reduce((a, p, i) => a + Math.abs(g[i] - p[2]), 0) / 2; };
  let best = 3, e = Infinity; for (let k = 0.5; k <= 8; k += 0.05) { const x = err(k); if (x < e) { e = x; best = k; } }
  return { k: Math.round(best * 100) / 100, miss: e, seats, err };
}
// 選挙区別の結果(総務省 候補者別得票数)。その選挙の名前で探す
export const districtsOf = (election) => SMD.elections.find((x) => x.name.startsWith(election.name)) ?? null;
// 小選挙区の一律スイング:選挙区ごとの実際の得票率に、その党の全国得票率の変化をそのまま足し、いちばん多い候補を当選とする。
// shift(党名, 得票率) で変化の足し方を変えられる(既定は、全国の小選挙区の得票率の変化)。無所属・諸派は動かさない
export function swingSeats(election, smdShare = {}, shift) {
  const D = districtsOf(election); if (!D) return null;
  const base = Object.fromEntries(election.smd.parties.map(([n, v]) => [n, v]));
  const move = shift ?? ((n) => (isOther(n) ? 0 : (smdShare[n] ?? base[n] ?? 0) - (base[n] ?? 0)));
  const seats = {}, close = [];
  for (const [name, flat] of D.districts) {
    let best = -1, who = null, second = -1;
    for (let i = 0; i < flat.length; i += 2) { const party = D.parties[flat[i]], v = Math.max(0, flat[i + 1] + move(party, flat[i + 1]));
      if (v > best) { second = best; best = v; who = party; } else if (v > second) second = v; }
    seats[who] = (seats[who] ?? 0) + 1; close.push({ name, party: who, margin: best - Math.max(second, 0) });
  }
  return { seats, close: close.sort((a, b) => a.margin - b.margin).slice(0, 10) };
}
// 全体の試算。smdShare / prShare は 党名→得票率(%)。省略した党は基準の選挙のまま。
// k を指定したときは、全国の得票率から「得票率^k」で配る古い方式。指定しなければ、選挙区別の結果からの一律スイング
export function simulate(election, { smdShare = {}, prShare = {}, k } = {}) {
  const P = election.smd.parties, sw = k == null ? swingSeats(election, smdShare) : null;
  let smd, kk = null;
  if (sw) smd = sw.seats;
  else { kk = k ?? fitK(election).k; const fixed = P.filter(([n]) => isOther(n)), free = P.filter(([n]) => !isOther(n));
    const seats = election.smd.seats - fixed.reduce((a, p) => a + p[2], 0), g = smdSeats(free.map(([n, v]) => smdShare[n] ?? v), seats, kk);
    smd = Object.fromEntries([...free.map(([n], i) => [n, g[i]]), ...fixed.map(([n, , s]) => [n, s])]); }
  const scale = Object.fromEntries(election.pr.parties.map(([n, v]) => [n, v > 0 ? (prShare[n] ?? v) / v : 1])), pr = prSeats(election, scale);
  const names = [...new Set([...P.map((p) => p[0]), ...election.pr.parties.map((p) => p[0])])];
  return { k: kk, method: sw ? "swing" : "k", close: sw?.close ?? [], rows: names.map((n) => ({ party: n, smd: smd[n] ?? 0, pr: pr[n] ?? 0, total: (smd[n] ?? 0) + (pr[n] ?? 0), smd0: P.find((p) => p[0] === n)?.[2] ?? 0, pr0: election.pr.parties.find((p) => p[0] === n)?.[2] ?? 0 })).sort((a, b) => b.total - a.total), seats: election.smd.seats + election.pr.seats };
}
// 検算:ドント式の計算と公式の配分、小選挙区の再現の度合い
export function electionChecks() {
  const rows = []; let match = 0, blocks = 0, seatDiff = 0, seatsAll = 0;
  for (const e of ED.elections) for (const b of e.pr.blocks) { const got = dhondt(b.parties.map((p) => p[1]), b.seats), d = b.parties.reduce((a, p, i) => a + Math.abs(got[i] - p[2]), 0) / 2; blocks++; if (d === 0) match++; seatDiff += d; seatsAll += b.seats; }
  rows.push({ basis: "公的統計", model: "得票と議席", label: "比例代表:ドント式の計算が公式の配分と一致したブロック", a: `${match} / ${blocks}`, b: `${blocks} / ${blocks}`, diff: match / blocks - 1, points: (match / blocks - 1) * 100, tol: 15, source: "総務省 衆議院議員総選挙結果調(第44〜51回)。一致しないブロックは、名簿の候補者が足りない党の議席がほかの党に回った場合と考えられる(原因は個別に確認していない)" });
  rows.push({ basis: "公的統計", model: "得票と議席", label: "比例代表:公式の配分と違った議席の割合", a: `${((seatDiff / seatsAll) * 100).toFixed(1)}%`, b: "0%", diff: seatDiff / seatsAll, points: (seatDiff / seatsAll) * 100, tol: 5, source: "同上(8回・延べ1,424議席)" });
  for (const e of ED.elections) { const f = fitK(e), others = ED.elections.filter((x) => x !== e).map((x) => fitK(x).k).sort((a, b) => a - b), med = others[Math.floor(others.length / 2)], miss = f.err(med);
    rows.push({ basis: "公的統計", model: "得票と議席", label: `小選挙区(${e.name}):ほかの回から求めた k で試算したときの議席のずれ`, a: `${miss}議席`, b: "0議席", diff: miss / f.seats, points: (miss / f.seats) * 100, tol: 5, source: `総務省 結果調。この回をいちばんよく再現する k は${f.k}(そのときのずれ${f.miss}議席)、ほかの7回の中央の k は${med}` }); }
  for (const r of swingBacktest()) rows.push({ basis: "公的統計", model: "得票と議席", label: `小選挙区(${r.name}):前回の選挙区別の結果から試算した自民党の議席`, a: `${r.swing}議席`, b: `${r.real}議席`, diff: (r.swing - r.real) / r.seats, points: ((r.swing - r.real) / r.seats) * 100, tol: 5,
    source: `総務省 結果調(候補者別得票数・小選挙区)。前回の各選挙区の得票率に、各党の全国得票率の変化を足して当落を決めた(今回の全国得票率は実際の値を使う)。同じ条件で k の式なら${r.k}議席` });
  return rows;
}
// 一律スイングの検算:前回の選挙区別の結果に、今回の実際の全国得票率の変化を当てはめ、自民党の小選挙区の議席を当てる。
// 次の回に無い党(合流・改名)の候補は、新しくできた党の得票率の合計 ÷ 無くなった党の得票率の合計 の倍率(上限1.5)で得票率を変える。
// この扱いは、変化0とする案と比べて、8回の結果を見たうえで選んだ(後から選んだので、少し有利に出ている)
export function swingBacktest(party = "自由民主党") {
  const out = [], nat = (e, n) => e.smd.parties.find((x) => x[0] === n)?.[1];
  for (let i = 1; i < ED.elections.length; i++) {
    const prev = ED.elections[i - 1], cur = ED.elections[i], names = (e) => new Set(e.smd.parties.filter(([n]) => !isOther(n)).map(([n]) => n));
    const A = names(prev), B = names(cur), gone = [...A].filter((n) => !B.has(n)), born = [...B].filter((n) => !A.has(n));
    const g = gone.reduce((a, n) => a + nat(prev, n), 0), b = born.reduce((a, n) => a + nat(cur, n), 0), ratio = g > 0 ? Math.min(b / g, 1.5) : 1;
    const shift = (n, v) => (isOther(n) ? 0 : nat(prev, n) != null && nat(cur, n) != null ? nat(cur, n) - nat(prev, n) : nat(prev, n) != null ? v * (ratio - 1) : 0);
    const sw = swingSeats(prev, {}, shift), D = districtsOf(prev); if (!sw) continue;
    const swing = Math.round(((sw.seats[party] ?? 0) * cur.smd.seats) / D.districts.length), real = cur.smd.parties.find((x) => x[0] === party)?.[2] ?? 0;
    const others = ED.elections.filter((x) => x !== cur).map((x) => fitK(x).k).sort((a, c) => a - c), med = others[Math.floor(others.length / 2)];
    const P = cur.smd.parties.filter(([n]) => !isOther(n)), kSeats = smdSeats(P.map((p) => p[1]), P.reduce((a, p) => a + p[2], 0), med)[P.findIndex((p) => p[0] === party)];
    out.push({ name: cur.name, seats: cur.smd.seats, real, swing, k: kSeats });
  }
  return out;
}

// ---------- 画面 ----------
export function mountElections({ before }) {
  const el = document.createElement("section"); el.id = "tab-seats"; el.className = "tab";
  const E = [...ED.elections].reverse();
  el.innerHTML = `<div class="page-head"><h1>得票と議席</h1><p>衆議院の選挙制度で、各党の得票率が変わると議席数がどう変わるかを試算します。比例代表は制度どおりに計算し、小選挙区は選挙区ごとの実際の得票から試算します。</p></div>
    <div class="card"><div class="form-grid"><label class="wide">基準にする選挙 <select id="se-election">${E.map((e, i) => `<option value="${i}">${esc(e.name)}(${e.date}、投票率${e.turnout}%)</option>`).join("")}</select></label>
      <label>小選挙区の k(空欄なら、選挙区別の結果から計算) <input id="se-k" type="number" min="0.5" max="8" step="0.1" placeholder="使わない"></label></div>
      <p class="note">下の表で各党の得票率(%)を書き換えると、結果がすぐ変わります。最初は、その選挙の実際の得票率が入っています。<br>得票率そのもの(次の選挙でどの党がどれだけ得票するか)は、このツールでは予測しません。</p></div>
    <div id="se-out"></div>
    <div class="card"><h2>各党の得票率を変える</h2>
      <div id="se-inputs" class="table-scroll"></div>
      <div class="form-row"><button id="se-run" class="primary">計算する</button><button id="se-reset" type="button">実際の得票率に戻す</button></div><p id="se-msg" class="msg"></p></div>
    <div class="card"><h2>過去8回での確かめ</h2><div id="se-check" class="table-scroll"></div>
      <p class="note">比例代表は、ドント式の計算と公式の配分を比べています。小選挙区は、「その回に合う k」と「ほかの7回の中央の k で試算したときのずれ」を並べています。k が回によって約1〜6と大きく違うので、全国の得票率だけから小選挙区の議席を当てることはできません。</p></div>
    <div class="card"><h2>選挙区別の計算を、次の選挙で試した結果</h2><div id="se-swing" class="table-scroll"></div>
      <p class="note">前回の各選挙区の得票率に、今回の実際の全国得票率の変化を足して、自民党の小選挙区の議席を当てた結果です。今回の全国の得票率は分かっている前提なので、得票率そのものの予測ではありません。<br>党の合流・改名があると、どの党の票がどこへ移ったかが分からず、ずれが大きくなります。合流・改名した党の扱い方は、2つの案を8回の結果で比べてから選んだので、その分だけ有利に出ています。<br>出典:総務省「衆議院議員総選挙・最高裁判所裁判官国民審査結果調」候補者別得票数(小選挙区)、第44〜51回。選挙区の合計が全国集計と一致することを確かめています。</p></div>
    <div class="card"><h2>投票率の推移</h2><div id="se-turnout"></div><p class="note">${esc(ED.turnout.source)}。</p></div>`;
  before.parentNode.insertBefore(el, before);
  const $ = (id) => el.querySelector(`#${id}`), cur = () => E[Number($("se-election").value)], D0 = (e) => districtsOf(e)?.districts.length ?? 0;
  const fill = () => { const e = cur(), names = [...new Set([...e.smd.parties.map((p) => p[0]), ...e.pr.parties.map((p) => p[0])])];
    $("se-inputs").innerHTML = `<table class="verify"><tr><th>政党(総務省の表記)</th><th class="num">小選挙区の得票率(%)</th><th class="num">比例代表の得票率(%)</th><th class="num">実際の議席(小+比)</th></tr>${names.map((n) => { const s = e.smd.parties.find((p) => p[0] === n), p = e.pr.parties.find((x) => x[0] === n);
      return `<tr data-party="${esc(n)}"><td>${esc(n)}</td><td class="num">${s ? `<input class="se-smd" type="number" min="0" max="100" step="0.1" value="${s[1].toFixed(2)}" ${/無所属|諸派/.test(n) ? "disabled" : ""}>` : "―"}</td><td class="num">${p ? `<input class="se-pr" type="number" min="0" max="100" step="0.1" value="${p[1].toFixed(2)}">` : "―"}</td><td class="num">${(s?.[2] ?? 0) + (p?.[2] ?? 0)}(${s?.[2] ?? 0}+${p?.[2] ?? 0})</td></tr>`; }).join("")}</table>`; };
  const run = () => { const e = cur(), smdShare = {}, prShare = {};
    el.querySelectorAll("#se-inputs tr[data-party]").forEach((tr) => { const n = tr.dataset.party, a = tr.querySelector(".se-smd"), b = tr.querySelector(".se-pr"); if (a && !a.disabled) smdShare[n] = Math.max(0, Number(a.value) || 0); if (b) prShare[n] = Math.max(0, Number(b.value) || 0); });
    const k = Number($("se-k").value) || undefined, r = simulate(e, { smdShare, prShare, k }), f = fitK(e), majority = Math.floor(r.seats / 2) + 1, top = r.rows[0];
    const sumS = Object.values(smdShare).reduce((a, b) => a + b, 0), sumP = Object.values(prShare).reduce((a, b) => a + b, 0);
    $("se-msg").textContent = sumP > 100.5 || sumS > 100.5 ? `得票率の合計が100%を超えています(小選挙区${sumS.toFixed(1)}%、比例${sumP.toFixed(1)}%)。割合として計算しますが、入力を見直してください。` : "";
    $("se-out").innerHTML = `<div class="analysis"><h2>${esc(e.name)}を基準にした試算</h2>
      <div class="a-cards"><div class="a-card"><small>いちばん多い党</small><b>${top.total}議席</b> <i>${esc(top.party)}。実際は${top.smd0 + top.pr0}議席</i></div><div class="a-card"><small>過半数</small><b>${majority}議席</b> <i>定数${r.seats}</i></div>${r.method === "swing" ? `<div class="a-card"><small>小選挙区の計算</small><b>選挙区別</b> <i>${D0(e)}選挙区の実際の得票から</i></div>` : `<div class="a-card"><small>小選挙区の k</small><b>${r.k}</b> <i>この選挙に合う値は${f.k}</i></div>`}</div>
      <p class="a-headline">${esc(top.party)}は${top.total}議席で、過半数(${majority}議席)${top.total >= majority ? "を上回ります" : `に${majority - top.total}議席届きません`}。</p>
      <p class="a-note">比例代表は制度どおりの計算です(名簿の候補者が足りない場合の議席の移動は入れていません)。${r.method === "swing" ? "小選挙区は、その選挙の各選挙区の実際の得票率に、各党の全国得票率の変化をそのまま足して当落を決めています(一律スイング)。その選挙で候補を立てなかった党は、得票率を上げても議席は増えません。" : "小選挙区は、全国の得票率から「得票率^k」で配るおおまかな試算です。"}</p></div>
      ${r.close.length ? `<div class="card"><h3>差がいちばん小さい10選挙区</h3><p class="note">得票率を少し動かすと、ここから当落が入れ替わります。</p><div class="table-scroll"><table class="verify"><tr><th>選挙区</th><th>当選する党</th><th class="num">2位との差</th></tr>${r.close.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.party)}</td><td class="num">${c.margin.toFixed(1)}ポイント</td></tr>`).join("")}</table></div></div>` : ""}
      <div class="card"><h3>党ごとの議席</h3><div class="table-scroll"><table class="verify"><tr><th>政党</th><th class="num">小選挙区</th><th class="num">比例代表</th><th class="num">合計</th><th class="num">実際の議席</th><th class="num">差</th></tr>${r.rows.filter((x) => x.total || x.smd0 + x.pr0).map((x) => `<tr><td>${esc(x.party)}</td><td class="num">${x.smd}<small>実際${x.smd0}</small></td><td class="num">${x.pr}<small>実際${x.pr0}</small></td><td class="num"><b>${x.total}</b></td><td class="num">${x.smd0 + x.pr0}</td><td class="num">${x.total - x.smd0 - x.pr0 >= 0 ? "+" : ""}${x.total - x.smd0 - x.pr0}</td></tr>`).join("")}</table></div></div>`; };
  let timer = null; // 入力のたびに計算し直す(打ち終わるのを少し待つ)
  $("se-inputs").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 250); });
  $("se-k").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 250); });
  $("se-election").onchange = () => { fill(); run(); }; $("se-run").onclick = run; $("se-reset").onclick = () => { fill(); run(); };
  el.addEventListener("lab:open", () => { if (!$("se-inputs").innerHTML) { fill(); run();
    $("se-check").innerHTML = `<table class="verify"><tr><th>選挙</th><th class="num">比例:一致したブロック</th><th class="num">小選挙区に合う k</th><th class="num">そのときのずれ</th><th class="num">ほかの回の k でのずれ</th></tr>${ED.elections.map((e) => { let m = 0; for (const b of e.pr.blocks) { const g = dhondt(b.parties.map((p) => p[1]), b.seats); if (b.parties.every((p, i) => g[i] === p[2])) m++; }
      const f = fitK(e), others = ED.elections.filter((x) => x !== e).map((x) => fitK(x).k).sort((a, b) => a - b), med = others[Math.floor(others.length / 2)]; return `<tr><td>${esc(e.name)}(${e.date.slice(0, 4)}年)</td><td class="num">${m} / ${e.pr.blocks.length}</td><td class="num">${f.k}</td><td class="num">${f.miss}議席</td><td class="num">${f.err(med)}議席(k=${med})</td></tr>`; }).join("")}</table>`;
    { const B = swingBacktest(), mae = (f) => (B.reduce((a, r) => a + Math.abs(f(r) - r.real), 0) / B.length).toFixed(1);
      $("se-swing").innerHTML = `<table class="verify"><tr><th>選挙</th><th class="num">実際</th><th class="num">選挙区別の計算</th><th class="num">k の式</th></tr>${B.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${r.real}</td><td class="num">${r.swing}(${r.swing - r.real >= 0 ? "+" : ""}${r.swing - r.real})</td><td class="num">${r.k}(${r.k - r.real >= 0 ? "+" : ""}${r.k - r.real})</td></tr>`).join("")}<tr><td><b>ずれの平均</b></td><td></td><td class="num"><b>${mae((r) => r.swing)}議席</b></td><td class="num"><b>${mae((r) => r.k)}議席</b></td></tr></table>`; }
    $("se-turnout").innerHTML = multiLine([{ name: "衆院選", color: "#b4473b", points: ED.turnout["衆院選"].map(([x, y]) => ({ x, y: y / 100 })) }, { name: "参院選", color: "#4a7fb5", points: ED.turnout["参院選"].map(([x, y]) => ({ x, y: y / 100 })) }], { xLabel: "年" }); } });
  return { tabs: [["seats", "得票と議席"]] };
}
