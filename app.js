'use strict';
/* 受験70: 神奈川県公立高校入試 5教科 毎日学習アプリ (データは全部この端末の中に保存) */
const ORDER = ['eng', 'math', 'sci', 'soc', 'jpn'];
const SUBJ = {
  eng: { name: '英語', icon: '🔤' }, math: { name: '数学', icon: '➗' }, sci: { name: '理科', icon: '🧪' },
  soc: { name: '社会', icon: '🗺️' }, jpn: { name: '国語', icon: '📖' }
};
// 前回までの全県模試(点数・平均点)は、公開ファイルには入れず、端末の中(S.base)だけに保存する
const BASE0 = { score: null, avg: 50, sd: 20, memo: '' };
const ROT = { 1: ['eng', 'math'], 2: ['jpn', 'sci'], 3: ['eng', 'soc'], 4: ['math', 'jpn'], 5: ['sci', 'eng'], 6: ['soc', 'jpn'], 0: ['math', 'sci'] };
const INT = [0, 1, 3, 7, 14, 30]; // 間隔(日)
const DAY = 86400000;
const KEY = 'jk70.v1';

/* ---------- 日付 ---------- */
const dayNum = (d = new Date()) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
const parseDay = s => { const m = /^(\d+)-(\d+)-(\d+)$/.exec(s || ''); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : null; };
const dayStr = n => { const d = new Date(n * DAY); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };
const md = n => { const d = new Date(n * DAY); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); };
const dow = n => new Date(n * DAY).getUTCDay();
const WD = ['日', '月', '火', '水', '木', '金', '土'];

/* ---------- 保存 ---------- */
let mem = null;
function defState() {
  const t = dayNum();
  return { v: 1, set: { exam: '2027-02-16', wk: 150, we: 300, target: 70, goal: '2027-01-25' }, base: null, srs: {}, log: {}, mocks: [], real: [], start: t };
}
function load() {
  try { const r = localStorage.getItem(KEY); if (r) { const s = JSON.parse(r); if (s && s.v === 1) return s; } } catch (e) { }
  return mem || defState();
}
let S = load();
function save() { mem = S; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }

/* ---------- データ読み込み ---------- */
const DB = {}; const QS = []; const QM = new Map(); let TIMELINE = [];
async function loadAll() {
  const files = [['eng', 'q_eng'], ['math', 'q_math'], ['sci', 'q_sci'], ['soc', 'q_soc'], ['soc', 'q_his'], ['jpn', 'q_jpn']];
  const res = await Promise.all(files.map(([s, f]) => fetch('data/' + f + '.json').then(r => r.json())));
  ORDER.forEach(k => DB[k] = { units: [], ctx: {}, mocks: [] });
  let o = 0;
  res.forEach((d, i) => {
    const k = files[i][0]; const deck = files[i][1] === 'q_his';
    d.units.forEach(u => { u.s = k; u.deck = deck; DB[k].units.push(u); });
    Object.assign(DB[k].ctx, d.ctx);
    (d.mocks || []).forEach(m => DB[k].mocks.push(m));
    if (d.timeline) TIMELINE = d.timeline;
    DB[k].refs = (DB[k].refs || []).concat(d.refs || []);
    d.q.forEach(q => { q.s = k; q.deck = deck; q.o = o++; QS.push(q); QM.set(q.id, q); });
  });
}

/* ---------- 小物 ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.className = 'toast'; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200); }
const logOf = d => (S.log[d] = S.log[d] || { sec: {}, n: {}, b: {} });
const baseOf = k => Object.assign({}, BASE0, (S.base && S.base[k]) || {});
const unitOf = q => DB[q.s].units.find(u => u.id === q.u);

/* ---------- 復習の仕組み(ライトナー式) ---------- */
function grade(q, g, secs) { // g: 2=できた 1=あやしい 0=できない
  const t = dayNum(); const s = S.srs[q.id] || [0, 0, 0, 0, 0, 0];
  let box = s[0];
  if (g === 2) box = Math.min(5, box + 1); else if (g === 0) box = 0; else box = Math.max(1, Math.min(box, 2));
  s[0] = box; s[1] = t + INT[box]; s[2]++; if (g === 2) s[3]++; s[4] = t; s[5] = g === 0 ? 1 : 0;
  if (g === 1) s[1] = t + 1;
  S.srs[q.id] = s;
  const L = logOf(t); L.sec[q.s] = (L.sec[q.s] || 0) + secs;
  const n = L.n[q.s] = L.n[q.s] || [0, 0]; n[0]++; if (g === 2) n[1]++;
}
function poolOf(subs, o = {}) {
  return QS.filter(q => subs.includes(q.s) && (o.deck === undefined || !!q.deck === o.deck) && (o.mock || !q.mock || S.srs[q.id]) && (!o.unit || q.u === o.unit));
}
function pick(pool, n, o = {}) {
  const t = dayNum(); const due = [], fresh = [];
  pool.forEach(q => { const s = S.srs[q.id]; if (!s) fresh.push(q); else if (o.wrong ? s[5] === 1 : s[1] <= t) due.push(q); });
  due.sort((a, b) => S.srs[a.id][0] - S.srs[b.id][0] || S.srs[a.id][1] - S.srs[b.id][1]);
  if (o.dueOnly || o.wrong) return due.slice(0, n);
  const cap = Math.ceil(n * 0.7);
  let out = due.slice(0, cap);
  out = out.concat(fresh.slice(0, n - out.length));
  if (out.length < n) out = out.concat(due.slice(cap, cap + (n - out.length)));
  return out.slice(0, n);
}
function stats(sub) {
  const p = poolOf([sub], { deck: undefined });
  let seen = 0, mastered = 0, ok = 0, tot = 0;
  p.forEach(q => { const s = S.srs[q.id]; if (s) { seen++; if (s[0] >= 3) mastered++; ok += s[3]; tot += s[2]; } });
  const all = p.length || 1;
  return { total: p.length, seen, mastered, acc: tot ? Math.round(ok / tot * 100) : null, mpct: Math.round(mastered / all * 100), spct: Math.round(seen / all * 100) };
}
function countDue(subs) { const t = dayNum(); let n = 0; poolOf(subs, {}).forEach(q => { const s = S.srs[q.id]; if (s && s[1] <= t) n++; }); return n; }

/* ---------- 今日の計画 ---------- */
function planFor(day) {
  const d = dow(day), we = d === 0 || d === 6; const f = (we ? S.set.we : S.set.wk) / (we ? 300 : 150);
  const m = x => Math.max(5, Math.round(x * f / 5) * 5);
  const wi = Math.floor((day + 3) / 7); const focus = ROT[d]; const B = [];
  B.push({ id: 'rev', kind: 'review', label: '朝の復習（全教科）', sub: 'all', mins: m(we ? 30 : 25) });
  B.push({ id: 'f1', kind: 'focus', label: SUBJ[focus[0]].name + ' 重点', sub: focus[0], mins: m(we ? 50 : 40) });
  B.push({ id: 'f2', kind: 'focus', label: SUBJ[focus[1]].name + ' 重点', sub: focus[1], mins: m(we ? 50 : 40) });
  if (we) { const ms = d === 6 ? ['eng', 'jpn', 'soc'][wi % 3] : ['math', 'sci'][wi % 2]; B.push({ id: 'mock', kind: 'mock', label: SUBJ[ms].name + ' 模擬テスト', sub: ms, mins: 60 }); }
  B.push({ id: 'deck', kind: 'deck', label: '社会 年号・できごと', sub: 'soc', mins: m(we ? 30 : 20) });
  B.push({ id: 'wrong', kind: 'wrong', label: '間違いノート（解き直し）', sub: 'all', mins: m(we ? 25 : 15) });
  const SEC = { eng: 45, math: 110, sci: 55, soc: 45, jpn: 75, all: 50 };
  B.forEach(b => b.n = Math.max(5, Math.round(b.mins * 60 / (b.kind === 'deck' ? 20 : b.kind === 'wrong' ? 70 : (SEC[b.sub] || 50)))));
  return B;
}
function blockItems(b) {
  const subs = b.sub === 'all' ? ORDER : [b.sub];
  if (b.kind === 'review') return pick(poolOf(subs, { mock: true }), b.n, { dueOnly: true });
  if (b.kind === 'focus') return pick(poolOf(subs, { deck: false }), b.n);
  if (b.kind === 'deck') return pick(poolOf(['soc'], { deck: true }), Math.min(b.n, 40));
  if (b.kind === 'wrong') return pick(poolOf(subs, { mock: true }), b.n, { wrong: true });
  return [];
}
function blockDone(day, b) {
  const L = S.log[day]; const got = (L && L.b && L.b[b.id]) || 0;
  if (b.kind === 'mock') return S.mocks.some(x => x.day === day && x.sub === b.sub);
  const avail = blockItems(b).length;
  if (avail === 0) return true;
  return got >= Math.min(b.n, got + avail) * 0.8 && got > 0;
}
function streak() {
  let t = dayNum(), n = 0; const has = d => { const L = S.log[d]; if (!L) return false; return Object.values(L.sec).reduce((a, b) => a + b, 0) >= 600; };
  if (!has(t)) t--;
  while (has(t)) { n++; t--; } return n;
}
const minsToday = () => Math.round(Object.values(logOf(dayNum()).sec).reduce((a, b) => a + b, 0) / 60);
function devOf(sub, score, avg) { const b = baseOf(sub); const a = avg != null ? +avg : b.avg; return Math.round((50 + 10 * (score - a) / (b.sd || 20)) * 10) / 10; }
function applyBase(base) {
  S.base = base; S.real = S.real.filter(r => !r.base);
  ORDER.forEach(k => { const b = base[k]; if (b && b.score != null) S.real.push({ day: S.start - 10, sub: k, score: +b.score, avg: b.avg != null ? +b.avg : null, base: 1 }); });
}
function latestDev() {
  const out = {};
  const all = [];
  S.real.forEach(r => all.push({ day: r.day, sub: r.sub, dev: r.dev != null ? +r.dev : devOf(r.sub, r.score, r.avg) }));
  S.mocks.forEach(m => all.push({ day: m.day, sub: m.sub, dev: devOf(m.sub, m.score), mock: 1 }));
  all.sort((a, b) => a.day - b.day || (a.mock ? 1 : 0) - (b.mock ? 1 : 0));
  all.forEach(a => out[a.sub] = a.dev);
  return { latest: out, all };
}

/* ---------- 画面: 共通 ---------- */
const ui = { tab: 'home', sub: null, refSub: 'eng', era: 0, vsub: null };
function setTab(t) { ui.tab = t; ui.sub = null; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); render(); window.scrollTo(0, 0); }
function render() {
  const v = $('#view'); const ex = parseDay(S.set.exam); const left = ex != null ? ex - dayNum() : null;
  $('#countdown').textContent = left != null ? (left >= 0 ? '入試まで' + left + '日' : '入試日を設定') : '入試日を設定';
  if (!QS.length) { v.innerHTML = '<div class="empty">読み込み中…</div>'; return; }
  ({ home: vHome, learn: vLearn, video: vVideo, mock: vMock, record: vRecord, ref: vRef })[ui.tab](v);
}
const subTag = k => '<span class="tag sj s-' + k + '" style="--c:var(--' + k + ')">' + SUBJ[k].name + '</span>';

/* ---------- ホーム ---------- */
function vHome(v) {
  const t = dayNum(); const B = planFor(t); const tot = B.reduce((a, b) => a + b.mins, 0); const done = minsToday();
  const p = clamp(Math.round(done / tot * 100), 0, 100); const st = streak();
  const dv = latestDev(); const vals = ORDER.map(k => dv.latest[k]).filter(x => x != null); const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const gd = parseDay(S.set.goal); const gl = gd != null ? gd - t : null;
  let h = '<div class="card hero"><div class="row"><div class="ring" style="--p:' + p + '"><b>' + p + '%</b></div><div class="grow"><div class="muted">' + md(t) + '（' + WD[dow(t)] + '）の目標 ' + tot + '分</div><div class="big-num">' + done + '<span style="font-size:15px;font-weight:700"> 分 やった</span></div><div class="muted">🔥 連続 ' + st + ' 日（1日10分以上）</div></div></div></div>';
  h += '<div class="card"><div class="row"><div class="grow"><div class="muted">いまの5教科 平均偏差値（目安）</div><div class="big-num">' + (avg != null ? avg.toFixed(1) : '—') + '<span class="muted" style="font-weight:700"> → 目標 ' + S.set.target + '</span></div></div><div style="text-align:right"><div class="muted">' + (gl != null && gl >= 0 ? md(gd) + 'まであと' + gl + '日' : '') + '</div></div></div></div>';
  h += setupCard();
  h += installCard();
  h += '<h2>今日のメニュー</h2>';
  B.forEach(b => {
    const d = blockDone(t, b); const got = (logOf(t).b[b.id]) || 0; const avail = b.kind === 'mock' ? 1 : blockItems(b).length;
    const icon = { review: '🔁', focus: SUBJ[b.sub] ? SUBJ[b.sub].icon : '✏️', deck: '🗺️', wrong: '🩹', mock: '📝' }[b.kind];
    const sub = b.kind === 'mock' ? '本番と同じ形式（約' + (DB[b.sub].mocks[0] ? DB[b.sub].mocks[0].min : 50) + '分）' : (avail ? '約' + Math.min(avail, b.n) + '問' + (got ? '（今日 ' + got + '問 終了）' : '') : '今日は対象なし ✓');
    h += '<div class="block-item' + (d ? ' done' : '') + ' ' + (SUBJ[b.sub] ? 's-' + b.sub : '') + '" data-b="' + b.id + '"><div class="ic" style="background:' + (SUBJ[b.sub] ? 'var(--' + b.sub + ')' : 'var(--navy2)') + '">' + (d ? '✓' : icon) + '</div><div class="grow"><div class="ttl">' + esc(b.label) + '</div><div class="muted">' + b.mins + '分 ・ ' + sub + '</div></div><button class="btn sm ' + (d ? 'ghost' : 'acc') + '">' + (d ? 'もう一度' : 'はじめる') + '</button></div>';
  });
  h += '<h2>🎬 動画授業（YouTube）</h2><div class="grid5 vq">';
  ORDER.forEach(k => { h += '<div class="mini s-' + k + '" data-vid="' + k + '" style="--c:var(--' + k + ')"><b>' + SUBJ[k].name + '</b><span>▶</span></div>'; });
  h += '</div><div class="muted small" style="margin:6px 2px 0">教科をおすと、その教科の動画授業の一覧が開きます</div>';
  h += '<h2>教科ごとの定着度</h2><div class="grid5">';
  ORDER.forEach(k => { const s = stats(k); h += '<div class="mini s-' + k + '" data-sub="' + k + '" style="--c:var(--' + k + ')"><b>' + SUBJ[k].name + '</b><span>' + s.mpct + '%</span></div>'; });
  h += '</div><div class="muted small" style="margin:6px 2px 0">定着＝「復習を3回以上くり返して、できた」問題の割合</div>';
  h += '<div style="margin-top:14px"><button class="btn ghost block" id="btnReport">📋 今日の報告をコピー（LINEにはりつけ）</button></div>';
  v.innerHTML = h;
  v.querySelectorAll('.block-item').forEach(el => el.onclick = () => startBlock(B.find(b => b.id === el.dataset.b)));
  v.querySelectorAll('.mini[data-sub]').forEach(el => el.onclick = () => { setTab('learn'); ui.sub = el.dataset.sub; render(); });
  v.querySelectorAll('.mini[data-vid]').forEach(el => el.onclick = () => { ui.vsub = el.dataset.vid; setTab('video'); });
  $('#btnReport').onclick = copyReport;
  if ($('#goSetup')) $('#goSetup').onclick = openSettings;
  if ($('#hideInstall')) $('#hideInstall').onclick = () => { try { localStorage.setItem('jk70.hideInstall', '1'); } catch (x) { } render(); };
}

function setupCard() {
  if (S.base) return '';
  return '<div class="card" style="background:#fff7dc;border-color:#e3c46a"><h3>🎯 はじめに：前回の模試を入れましょう</h3><div class="muted" style="margin-top:4px">教科ごとの点数と平均点を入れると、偏差値の目安と進み具合が出ます。（この端末の中だけに保存されます）</div><button class="btn acc sm" id="goSetup" style="margin-top:8px">入力する</button></div>';
}
function installCard() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || localStorage.getItem('jk70.hideInstall')) return '';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return '<div class="card" id="installCard" style="background:#eef6ff;border-color:#b7d3f5"><h3>📲 ホーム画面に入れると、アプリとして使えます</h3><div class="muted" style="margin-top:4px">' + (ios ? 'Safariの 共有ボタン（□に↑）→「ホーム画面に追加」を押します。' : 'ブラウザのメニュー（︙）→「ホーム画面に追加」または「アプリをインストール」を押します。') + '</div><button class="btn ghost sm" id="hideInstall" style="margin-top:8px">わかった（もう表示しない）</button></div>';
}
function reportText() {
  const t = dayNum(); const L = logOf(t); let n = 0, ok = 0; const parts = [];
  ORDER.forEach(k => { const a = L.n[k]; if (a) { n += a[0]; ok += a[1]; parts.push(SUBJ[k].name + ' ' + Math.round((L.sec[k] || 0) / 60) + '分 ' + a[0] + '問（' + Math.round(a[1] / a[0] * 100) + '%）'); } });
  const ex = parseDay(S.set.exam);
  return '【今日の学習報告 ' + md(t) + '】\n勉強時間：' + minsToday() + '分\n解いた問題：' + n + '問（正答率 ' + (n ? Math.round(ok / n * 100) : 0) + '%）\n' + (parts.length ? parts.join('\n') + '\n' : '') + '連続 ' + streak() + ' 日目' + (ex ? ' ／ 入試まで' + (ex - t) + '日' : '');
}
function copyReport() {
  const txt = reportText();
  const done = () => toast('コピーしました。LINEなどにはりつけてください');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => prompt('コピーしてください', txt)); else prompt('コピーしてください', txt);
}

/* ---------- 学習タブ ---------- */
function vLearn(v) {
  if (ui.sub) return vSubject(v, ui.sub);
  let h = '<h2>教科を選んで練習</h2>';
  ORDER.forEach(k => {
    const s = stats(k);
    h += '<div class="card s-' + k + '" data-sub="' + k + '" style="--c:var(--' + k + ')"><div class="row"><span class="dot"></span><h3 class="grow">' + SUBJ[k].name + '</h3><span class="muted">' + s.seen + ' / ' + s.total + '問 学習ずみ</span></div><div class="bar" style="margin:8px 0 6px"><i style="width:' + s.mpct + '%;background:var(--' + k + ')"></i></div><div class="muted small">定着 ' + s.mpct + '% ・ 正答率 ' + (s.acc != null ? s.acc + '%' : '—') + ' ・ 復習待ち ' + countDue([k]) + '問</div><div class="muted small" style="margin-top:4px">前回の弱点：' + esc(baseOf(k).memo || '（設定で前回の模試を入れると、ここに表示されます）') + '</div></div>';
  });
  v.innerHTML = h;
  v.querySelectorAll('.card[data-sub]').forEach(el => el.onclick = () => { ui.sub = el.dataset.sub; render(); window.scrollTo(0, 0); });
}
function vSubject(v, k) {
  const s = stats(k);
  let h = '<div class="row" style="margin:2px 0 10px"><button class="btn ghost sm" id="back">← もどる</button><h2 style="margin:0">' + SUBJ[k].name + '</h2></div>';
  h += '<div class="card s-' + k + '" style="--c:var(--' + k + ')"><div class="two"><button class="btn acc" id="goNew">今日の分を解く<br><small>約15問</small></button><button class="btn ghost" id="goWrong">間違いを直す<br><small>' + poolOf([k], { mock: true }).filter(q => (S.srs[q.id] || [])[5] === 1).length + '問</small></button></div><div class="muted small" style="margin-top:8px">定着 ' + s.mpct + '% ・ 復習待ち ' + countDue([k]) + '問</div></div>';
  h += '<button class="btn ghost block" id="goVid" style="margin:-2px 0 12px">🎬 ' + SUBJ[k].name + 'の動画授業を見る</button>';
  h += '<h2>回ごとの練習</h2><div class="card list">';
  DB[k].units.forEach(u => {
    const ps = QS.filter(q => q.s === k && q.u === u.id && !q.mock); let seen = 0, mas = 0; ps.forEach(q => { const x = S.srs[q.id]; if (x) { seen++; if (x[0] >= 3) mas++; } });
    h += '<div class="item" data-u="' + u.id + '"><div class="grow"><div style="font-weight:800">' + esc(u.title) + '</div><div class="muted small">' + esc(u.area || '') + '</div><div class="bar" style="margin-top:6px"><i style="width:' + Math.round(seen / (ps.length || 1) * 100) + '%;background:var(--' + k + ')"></i></div></div><div class="muted small" style="text-align:right;white-space:nowrap">' + seen + '/' + ps.length + '<br>定着' + mas + '</div></div>';
  });
  h += '</div>';
  v.innerHTML = h;
  $('#back').onclick = () => { ui.sub = null; render(); };
  $('#goVid').onclick = () => { ui.vsub = k; setTab('video'); };
  $('#goNew').onclick = () => startSession(SUBJ[k].name + ' 今日の分', k, pick(poolOf([k], { deck: false }), 15), {});
  $('#goWrong').onclick = () => { const it = pick(poolOf([k], { mock: true }), 20, { wrong: true }); if (!it.length) return toast('間違いノートは空です 🎉'); startSession(SUBJ[k].name + ' 間違い直し', k, it, {}); };
  v.querySelectorAll('.item[data-u]').forEach(el => el.onclick = () => { const it = pick(poolOf([k], { unit: el.dataset.u, mock: false }).concat([]), 15); if (!it.length) return toast('この回は全部おわりました。復習で出てきます'); startSession(DB[k].units.find(u => u.id === el.dataset.u).title, k, it, {}); });
}
function startBlock(b) {
  if (b.kind === 'mock') return openMockChooser(b.sub);
  const it = blockItems(b);
  if (!it.length) return toast('いまは対象の問題がありません ✓');
  startSession(b.label, b.sub, it, { blockId: b.id });
}

/* ---------- 問題の表示 ---------- */
function qHtml(q, withCtx = true) {
  let h = '';
  if (withCtx && q.cx && DB[q.s].ctx[q.cx]) h += '<div class="qcard" style="background:#fafbfe;font-size:15px">' + DB[q.s].ctx[q.cx] + '</div>';
  h += '<div class="qcard"><div class="qmeta">' + subTag(q.s) + '<span class="muted small">' + esc((unitOf(q) || {}).title || '') + '</span></div>' + q.q + (q.qf ? '<div class="figc">' + q.qf + '</div>' : '') + '</div>';
  return h;
}
const chLabel = i => ['1', '2', '3', '4', '5', '6'][i];
function choicesHtml(q) {
  const cols = q.ch.every(c => c.replace(/<[^>]+>/g, '').length <= 8) ? 'c2' : '';
  return '<div class="chs ' + cols + '">' + q.ch.map((c, i) => '<button class="chb" data-i="' + i + '"><span class="no">' + chLabel(i) + '</span><span>' + c + '</span></button>').join('') + '</div>';
}
function refLink(q) { const c = chapterOf(q); return c != null && (DB[q.s].refs || [])[c] ? '<div style="margin-top:8px"><button class="btn ghost sm" onclick="openRef(\'' + q.s + '\',' + c + ')">📖 参考書を読む（' + esc(DB[q.s].refs[c].title.slice(0, 18)) + '…）</button></div>' : ''; }
function showAnswerHtml(q) { return '<div class="ansbox"><b>答え</b>　' + (q.t === 'mc' ? q.ch[q.a] : q.a) + '</div>' + (q.e ? '<div class="fb" style="background:#f4f6fb;border:1px solid var(--line)"><div class="h">解説</div>' + q.e + (q.ef ? '<div class="figc">' + q.ef + '</div>' : '') + '</div>' : ''); }

/* ---------- 学習セッション ---------- */
let SS = null;
function startSession(title, sub, items, opt) {
  if (!items.length) return toast('問題がありません');
  SS = { title, sub, items, i: 0, res: [], t0: Date.now(), blockId: opt.blockId, day: dayNum(), qs: Date.now(), revealed: false };
  $('#overlay').hidden = false; document.body.style.overflow = 'hidden'; renderQ();
}
function closeOverlay() { $('#overlay').hidden = true; $('#overlay').innerHTML = ''; document.body.style.overflow = ''; SS = null; MS = null; clearInterval(tick); render(); }
function sessTop(title, i, n, extra) {
  return '<div class="sess-top"><div class="row"><button class="x" id="xClose">× 終了</button><div class="grow" style="text-align:center;font-weight:800;font-size:14px">' + esc(title) + '</div><div style="font-weight:800;min-width:56px;text-align:right">' + (extra || (i + 1) + '/' + n) + '</div></div><div class="bar"><i style="width:' + Math.round(i / n * 100) + '%"></i></div></div>';
}
function renderQ() {
  const q = SS.items[SS.i]; const o = $('#overlay'); SS.qs = Date.now(); SS.revealed = false;
  let h = sessTop(SS.title, SS.i, SS.items.length) + '<div class="qwrap">' + qHtml(q);
  if (q.t === 'mc') h += choicesHtml(q) + '<div id="fbArea"></div>';
  else h += '<div id="fbArea"></div>';
  h += '</div><div class="foot"><div class="in" id="footIn">' + (q.t === 'mc' ? '<button class="btn ghost" id="skip">わからない</button>' : '<button class="btn acc" id="reveal">答えを見る</button>') + '</div></div>';
  o.innerHTML = h; o.scrollTop = 0;
  $('#xClose').onclick = () => endSession(true);
  if (q.t === 'mc') {
    o.querySelectorAll('.chb').forEach(b => b.onclick = () => answerMc(+b.dataset.i));
    $('#skip').onclick = () => answerMc(-1);
  } else $('#reveal').onclick = revealSelf;
}
function answerMc(i) {
  if (SS.revealed) return; SS.revealed = true; const q = SS.items[SS.i]; const secs = clamp((Date.now() - SS.qs) / 1000, 2, 150); const ok = i === q.a;
  document.querySelectorAll('.chb').forEach((b, j) => { b.disabled = true; if (j === q.a) b.classList.add('right'); else if (j === i) b.classList.add('wrong'); });
  grade(q, ok ? 2 : 0, secs); SS.res.push({ id: q.id, ok: ok ? 2 : 0 }); countBlock();
  $('#fbArea').innerHTML = '<div class="fb ' + (ok ? 'ok' : 'ng') + '"><div class="h">' + (ok ? '⭕ 正解！' : (i < 0 ? '🙈 答えを確認しよう' : '❌ ざんねん')) + '</div>' + (q.e || '') + (q.ef ? '<div class="figc">' + q.ef + '</div>' : '') + (ok ? '' : refLink(q)) + '</div>';
  $('#footIn').innerHTML = '<button class="btn acc" id="next">' + (SS.i + 1 < SS.items.length ? '次へ' : '結果を見る') + '</button>'; $('#next').onclick = nextQ; save();
  setTimeout(() => $('#fbArea').scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
}
function revealSelf() {
  SS.revealed = true; const q = SS.items[SS.i]; $('#fbArea').innerHTML = showAnswerHtml(q);
  $('#footIn').innerHTML = '<button class="btn ng" data-g="0">× できない</button><button class="btn warn" data-g="1">△ あやしい</button><button class="btn ok" data-g="2">○ できた</button>';
  $('#footIn').querySelectorAll('button').forEach(b => b.onclick = () => { const g = +b.dataset.g; const secs = clamp((Date.now() - SS.qs) / 1000, 3, 180); grade(q, g, secs); SS.res.push({ id: q.id, ok: g }); countBlock(); save(); nextQ(); });
  setTimeout(() => $('#fbArea').scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
}
function countBlock() { if (SS.blockId) { const L = logOf(SS.day); L.b[SS.blockId] = (L.b[SS.blockId] || 0) + 1; } }
function nextQ() { SS.i++; if (SS.i >= SS.items.length) return endSession(false); renderQ(); }
function endSession(early) {
  if (early && SS.res.length === 0) return closeOverlay();
  const r = SS.res; const ok = r.filter(x => x.ok === 2).length; const sec = Math.round((Date.now() - SS.t0) / 1000);
  const wrong = r.filter(x => x.ok !== 2).map(x => QM.get(x.id));
  save();
  let h = sessTop(SS.title, SS.items.length, SS.items.length, 'おつかれさま') + '<div class="qwrap"><div class="card" style="text-align:center"><div class="muted">' + (early ? 'ここまでの結果' : '結果') + '</div><div class="score-big">' + (r.length ? Math.round(ok / r.length * 100) : 0) + '<span style="font-size:22px">%</span></div><div class="muted">' + ok + ' / ' + r.length + '問 できた ・ ' + Math.round(sec / 60) + '分' + (sec % 60 ? sec % 60 + '秒' : '') + '</div></div>';
  if (wrong.length) { h += '<h2>まちがえた・あやしい問題（復習に出ます）</h2>'; wrong.forEach(q => { h += '<details class="card"><summary>' + subTag(q.s) + ' ' + esc(q.q.replace(/<[^>]+>/g, ' ').slice(0, 46)) + '…</summary><div style="margin-top:8px">' + q.q + '</div>' + showAnswerHtml(q) + '</details>'; }); } else h += '<div class="card" style="text-align:center">🎉 ぜんぶ できました！</div>';
  h += '</div><div class="foot"><div class="in"><button class="btn ghost" id="again">続けてもう1セット</button><button class="btn acc" id="home">ホームへ</button></div></div>';
  const keepTitle = SS.title, keepSub = SS.sub, keepBlock = SS.blockId; const wasBlock = SS.blockId;
  $('#overlay').innerHTML = h; $('#xClose').onclick = closeOverlay; $('#home').onclick = closeOverlay;
  $('#again').onclick = () => { const ids = new Set(r.map(x => x.id)); const b = planFor(dayNum()).find(x => x.id === keepBlock); let it = b ? blockItems(b) : pick(poolOf(keepSub === 'all' ? ORDER : [keepSub], { deck: keepBlock === 'deck' ? true : false }), 15); it = it.filter(q => !ids.has(q.id)); if (!it.length) { toast('いまの分はぜんぶ終わりました'); return; } startSession(keepTitle, keepSub, it, { blockId: keepBlock }); };
}

/* ---------- 模擬テスト ---------- */
let MS = null; let tick = null;
function vMock(v) {
  let h = '<div class="card" style="background:#fff7dc;border-color:#e3c46a">本番と同じ形式・同じ配点（100点）の模擬テストです。時間をはかって、紙のメモを使いながら解きます。<br><span class="muted small">※ 英語のリスニングは音声が必要なので、アプリではのぞいています（点数は100点に換算）。</span></div>';
  ORDER.forEach(k => {
    h += '<h2>' + SUBJ[k].name + '</h2>';
    if (!DB[k].mocks.length) { h += '<div class="card muted">模擬テストの準備中です</div>'; return; }
    DB[k].mocks.forEach(m => {
      const done = S.mocks.filter(x => x.sub === k && x.id === m.id); const last = done[done.length - 1];
      h += '<div class="card s-' + k + '" style="--c:var(--' + k + ')"><div class="row"><div class="grow"><h3>' + esc(m.title) + '（' + (m.id === 't2' ? '第2回' : '第1回') + '）</h3><div class="muted small">' + m.min + '分 ・ ' + m.secs.reduce((a, s) => a + s.ids.length, 0) + '問' + (last ? ' ・ 前回 ' + last.score + '点（' + md(last.day) + '）' : '') + '</div></div><button class="btn acc sm" data-k="' + k + '" data-m="' + m.id + '">解く</button></div></div>';
    });
  });
  v.innerHTML = h;
  v.querySelectorAll('button[data-m]').forEach(b => b.onclick = () => startMock(b.dataset.k, b.dataset.m));
}
function openMockChooser(sub) {
  const ms = DB[sub].mocks; if (!ms.length) return toast('準備中です');
  const done = id => S.mocks.some(x => x.sub === sub && x.id === id); const m = ms.find(x => !done(x.id)) || ms[0]; startMock(sub, m.id);
}
function startMock(sub, id) {
  const m = DB[sub].mocks.find(x => x.id === id); const qs = []; const secs = [];
  m.secs.forEach(s => { const st = qs.length; s.ids.forEach(i => qs.push(QM.get(i))); secs.push({ label: s.label, name: s.name, from: st, to: qs.length }); });
  MS = { sub, m, qs, secs, ans: {}, i: 0, end: Date.now() + m.min * 60000, t0: Date.now(), phase: 'solve' };
  $('#overlay').hidden = false; document.body.style.overflow = 'hidden'; renderMock();
  clearInterval(tick); tick = setInterval(() => { const el = $('#mtimer'); if (!el || !MS) return; const rem = Math.max(0, Math.round((MS.end - Date.now()) / 1000)); el.textContent = Math.floor(rem / 60) + ':' + String(rem % 60).padStart(2, '0'); if (rem === 0 && MS.phase === 'solve') { toast('時間です'); finishMock(); } }, 1000);
}
function renderMock() {
  const q = MS.qs[MS.i]; const sec = MS.secs.find(s => MS.i >= s.from && MS.i < s.to); const o = $('#overlay');
  const answered = Object.keys(MS.ans).length;
  let h = '<div class="sess-top"><div class="row"><button class="x" id="xClose">× 中止</button><div class="grow" style="text-align:center;font-weight:800;font-size:14px">' + esc(SUBJ[MS.sub].name) + ' 模試</div><div style="font-weight:800;min-width:56px;text-align:right">⏱ <span id="mtimer"></span></div></div><div class="bar"><i style="width:' + Math.round(answered / MS.qs.length * 100) + '%"></i></div></div><div class="qwrap">';
  h += '<div class="muted small" style="margin:0 2px 6px">' + esc(sec ? sec.label + ' ' + (sec.name || '') : '') + ' ・ 第' + (MS.i + 1) + '問 / 全' + MS.qs.length + '問' + (q.p ? ' ・ ' + q.p + '点' : '') + '</div>';
  h += qHtml(q);
  if (q.t === 'mc') h += '<div class="chs ' + (q.ch.every(c => c.replace(/<[^>]+>/g, '').length <= 8) ? 'c2' : '') + '">' + q.ch.map((c, i) => '<button class="chb' + (MS.ans[q.id] === i ? ' sel' : '') + '" data-i="' + i + '"><span class="no">' + chLabel(i) + '</span><span>' + c + '</span></button>').join('') + '</div>';
  else h += '<div class="card" style="background:#fff7dc;border-color:#e3c46a">📝 紙に答えを書いてから、次へ進みます。<br><span class="muted small">答え合わせは、最後にまとめて行います。</span></div>';
  h += '<div class="qnav">' + MS.qs.map((x, j) => '<button class="' + (MS.ans[x.id] !== undefined ? 'a ' : '') + (j === MS.i ? 'cur' : '') + '" data-j="' + j + '">' + (j + 1) + '</button>').join('') + '</div></div>';
  h += '<div class="foot"><div class="in"><button class="btn ghost" id="prev"' + (MS.i === 0 ? ' disabled' : '') + '>← 前へ</button>' + (MS.i + 1 < MS.qs.length ? '<button class="btn acc" id="nxt">次へ →</button>' : '<button class="btn ok" id="fin">答え合わせへ</button>') + '</div></div>';
  o.innerHTML = h; o.scrollTop = 0;
  $('#xClose').onclick = () => { if (confirm('模擬テストを中止しますか？（記録されません）')) closeOverlay(); };
  o.querySelectorAll('.chb').forEach(b => b.onclick = () => { MS.ans[q.id] = +b.dataset.i; renderMock(); });
  o.querySelectorAll('.qnav button').forEach(b => b.onclick = () => { if (q.t !== 'mc') MS.ans[q.id] = MS.ans[q.id] === undefined ? -1 : MS.ans[q.id]; MS.i = +b.dataset.j; renderMock(); });
  $('#prev').onclick = () => { MS.i--; renderMock(); };
  if ($('#nxt')) $('#nxt').onclick = () => { if (q.t !== 'mc' && MS.ans[q.id] === undefined) MS.ans[q.id] = -1; MS.i++; renderMock(); };
  if ($('#fin')) $('#fin').onclick = () => { if (q.t !== 'mc' && MS.ans[q.id] === undefined) MS.ans[q.id] = -1; finishMock(); };
}
function finishMock() {
  MS.phase = 'grade'; clearInterval(tick);
  const selfQs = MS.qs.filter(q => q.t !== 'mc'); MS.selfOk = {};
  const o = $('#overlay');
  let h = '<div class="sess-top"><div class="row"><div class="grow" style="font-weight:800;text-align:center">答え合わせ</div></div></div><div class="qwrap">';
  if (selfQs.length) {
    h += '<div class="card" style="background:#fff7dc;border-color:#e3c46a">紙に書いた答えを、正しい答えと見くらべて、<b>○（合っていた）</b> か <b>×</b> を選んでください。部分点は、だいたいの半分で ○ にしてOK。</div>';
    selfQs.forEach((q, j) => { h += '<div class="card" data-q="' + q.id + '"><div class="muted small">' + (MS.qs.indexOf(q) + 1) + '問目' + (q.p ? '（' + q.p + '点）' : '') + '</div><div style="font-size:15px">' + q.q + '</div>' + showAnswerHtml(q) + '<div class="two"><button class="btn ng sm" data-v="0">× ちがった</button><button class="btn ok sm" data-v="1">○ 合っていた</button></div></div>'; });
  } else h += '<div class="card">すべて選択式でした。「採点する」を押してください。</div>';
  h += '</div><div class="foot"><div class="in"><button class="btn acc" id="score">採点する</button></div></div>';
  o.innerHTML = h; o.scrollTop = 0;
  o.querySelectorAll('.card[data-q]').forEach(c => c.querySelectorAll('button[data-v]').forEach(b => b.onclick = () => { MS.selfOk[c.dataset.q] = +b.dataset.v; c.querySelectorAll('button').forEach(x => x.style.opacity = x === b ? 1 : .35); }));
  $('#score').onclick = () => { const miss = selfQs.filter(q => MS.selfOk[q.id] === undefined).length; if (miss && !confirm('○×を選んでいない問題が' + miss + '問あります。×として採点しますか？')) return; scoreMock(); };
}
function scoreMock() {
  const m = MS.m; let got = 0, max = 0; const rows = []; const wrong = [];
  MS.secs.forEach(s => {
    let g = 0, mx = 0;
    for (let i = s.from; i < s.to; i++) { const q = MS.qs[i]; const p = q.p || 1; mx += p; const ok = q.t === 'mc' ? MS.ans[q.id] === q.a : MS.selfOk[q.id] === 1; if (ok) g += p; else wrong.push(q); grade(q, ok ? 2 : 0, 20); }
    rows.push({ label: s.label, name: s.name, g, mx }); got += g; max += mx;
  });
  const score = Math.round(got / max * 100); const sec = Math.round((Date.now() - MS.t0) / 1000);
  S.mocks.push({ day: dayNum(), sub: MS.sub, id: m.id, score, got, max, sec }); save();
  const dv = devOf(MS.sub, score); const prev = S.mocks.filter(x => x.sub === MS.sub).slice(-2, -1)[0];
  let h = '<div class="sess-top"><div class="row"><div class="grow" style="font-weight:800;text-align:center">結果</div></div></div><div class="qwrap"><div class="card" style="text-align:center"><div class="muted">' + esc(SUBJ[MS.sub].name) + ' ' + esc(m.title) + '</div><div class="score-big">' + score + '<span style="font-size:22px">点</span></div><div class="muted">100点に換算 ・ 偏差値の目安 <b>' + dv.toFixed(1) + '</b>' + (prev ? ' ・ 前回 ' + prev.score + '点' : '') + '</div></div>';
  h += '<div class="card"><table class="res"><tr><th>大問</th><th>得点</th></tr>' + rows.map(r => '<tr><td>' + esc(r.label + ' ' + (r.name || '')) + '</td><td>' + r.g + ' / ' + r.mx + '</td></tr>').join('') + '</table></div>';
  if (wrong.length) { h += '<h2>まちがえた問題（間違いノートに入りました）</h2>'; wrong.forEach(q => { h += '<details class="card"><summary>' + (MS.qs.indexOf(q) + 1) + '問目 ' + esc(q.q.replace(/<[^>]+>/g, ' ').slice(0, 40)) + '…</summary><div style="margin-top:8px">' + q.q + '</div>' + showAnswerHtml(q) + '</details>'; }); }
  h += '</div><div class="foot"><div class="in"><button class="btn acc" id="home">ホームへ</button></div></div>';
  $('#overlay').innerHTML = h; $('#overlay').scrollTop = 0; $('#home').onclick = closeOverlay;
}

/* ---------- 記録 ---------- */
function lineChart(series, opt) {
  const W = 340, H = 190, L = 30, R = 8, T = 10, B = 24; const xs = series.flatMap(s => s.pts.map(p => p[0]));
  const x0 = Math.min(...xs, opt.x0), x1 = Math.max(...xs, opt.x1); const y0 = opt.y0, y1 = opt.y1;
  const X = x => L + (x - x0) / (x1 - x0 || 1) * (W - L - R), Y = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" width="100%"><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff"/>';
  for (let y = y0; y <= y1; y += 10) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(y) + '" y2="' + Y(y) + '" stroke="#e5e9f2"/><text x="' + (L - 4) + '" y="' + (Y(y) + 4) + '" font-size="10" text-anchor="end" fill="#667">' + y + '</text>';
  (opt.marks || []).forEach(m => { s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(m.y) + '" y2="' + Y(m.y) + '" stroke="' + m.c + '" stroke-dasharray="5 4" stroke-width="1.6"/><text x="' + (W - R - 2) + '" y="' + (Y(m.y) - 4) + '" font-size="10" text-anchor="end" fill="' + m.c + '">' + m.t + '</text>'; });
  [x0, Math.round((x0 + x1) / 2), x1].forEach(x => s += '<text x="' + X(x) + '" y="' + (H - 6) + '" font-size="10" text-anchor="middle" fill="#667">' + md(Math.round(x)) + '</text>');
  series.forEach(se => { if (se.pts.length) { s += '<polyline fill="none" stroke="' + se.c + '" stroke-width="2.4" stroke-linejoin="round" points="' + se.pts.map(p => X(p[0]) + ',' + Y(clamp(p[1], y0, y1))).join(' ') + '"/>'; se.pts.forEach(p => s += '<circle cx="' + X(p[0]) + '" cy="' + Y(clamp(p[1], y0, y1)) + '" r="3.6" fill="' + se.c + '"/>'); } });
  return s + '</svg>';
}
function avgSeries() {
  const dv = latestDev(); const cur = {}; const pts = []; let lastDay = null;
  dv.all.forEach(a => { cur[a.sub] = a.dev; const vals = ORDER.map(k => cur[k]).filter(x => x != null); if (vals.length === 5) pts.push([a.day, vals.reduce((x, y) => x + y, 0) / 5]); });
  return pts;
}
function vRecord(v) {
  const t = dayNum(); let h = '<h2>勉強時間（直近14日）</h2><div class="card">';
  const days = []; for (let i = 13; i >= 0; i--) days.push(t - i);
  const mins = days.map(d => Math.round(Object.values((S.log[d] || { sec: {} }).sec).reduce((a, b) => a + b, 0) / 60)); const mx = Math.max(60, ...mins);
  h += '<svg viewBox="0 0 340 130" width="100%"><rect width="340" height="130" fill="#fff"/>' + mins.map((m, i) => { const bh = m / mx * 90; const wd = dow(days[i]); const tgt = (wd === 0 || wd === 6) ? S.set.we : S.set.wk; return '<rect x="' + (10 + i * 23.4) + '" y="' + (100 - bh) + '" width="17" height="' + bh + '" rx="3" fill="' + (m >= tgt * 0.8 ? '#1f9d63' : '#7d96cf') + '"/><text x="' + (18.5 + i * 23.4) + '" y="' + (96 - bh) + '" font-size="9" text-anchor="middle" fill="#445">' + (m || '') + '</text><text x="' + (18.5 + i * 23.4) + '" y="118" font-size="9" text-anchor="middle" fill="#667">' + md(days[i]).split('/')[1] + '</text>'; }).join('') + '</svg><div class="muted small">緑＝目標の8割以上（平日' + S.set.wk + '分・休日' + S.set.we + '分）</div></div>';
  const pts = avgSeries(); const tg = +S.set.target; const gd = parseDay(S.set.goal); const ex = parseDay(S.set.exam);
  h += '<h2>5教科 平均偏差値の推移（目安）</h2><div class="card">' + lineChart([{ c: '#14284b', pts }], { x0: S.start - 12, x1: ex || t + 60, y0: 30, y1: 80, marks: [{ y: tg, c: '#e8710a', t: '目標' + tg }, { y: 55, c: '#1f9d63', t: '1月の中間目標 55' }] }) + '<div class="muted small">実際の模試の結果と、アプリの模擬テストの得点から計算した目安です。</div></div>';
  const dv = latestDev();
  h += '<div class="card"><table class="res"><tr><th>教科</th><th>前回</th><th>いま</th><th>目標</th></tr>';
  ORDER.forEach(k => { const bb = baseOf(k); const base = bb.score != null ? devOf(k, bb.score, bb.avg) : null; const cur = dv.latest[k]; h += '<tr><td>' + subTag(k) + '</td><td>' + (base != null ? base.toFixed(1) : '—') + '</td><td><b>' + (cur != null ? cur.toFixed(1) : '—') + '</b></td><td>' + tg + '</td></tr>'; });
  h += '</table></div>';
  h += '<h2>実際の模試の結果を入力</h2><div class="card"><div class="two"><label class="f">教科<select id="rSub">' + ORDER.map(k => '<option value="' + k + '">' + SUBJ[k].name + '</option>').join('') + '</select></label><label class="f">日付<input type="date" id="rDay" value="' + dayStr(t) + '"></label></div><div class="two"><label class="f">点数<input type="number" id="rScore" inputmode="decimal" placeholder="例 56"></label><label class="f">偏差値（わかれば）<input type="number" id="rDev" inputmode="decimal" placeholder="例 52"></label></div><label class="f">平均点（わかれば）<input type="number" id="rAvg" inputmode="decimal" placeholder="例 53.8"></label><button class="btn block" id="rAdd">記録する</button></div>';
  h += '<h2>勉強のバックアップ</h2><div class="card"><div class="muted small" style="margin-bottom:8px">記録はこのスマホの中だけに保存されています。機種変更や、ブラウザのデータ削除の前にバックアップを取ってください。</div><div class="two"><button class="btn ghost" id="bkOut">書き出す</button><button class="btn ghost" id="bkIn">読み込む</button></div><input type="file" id="bkFile" accept="application/json" hidden></div>';
  v.innerHTML = h;
  $('#rAdd').onclick = () => { const sc = $('#rScore').value, dv2 = $('#rDev').value; if (sc === '' && dv2 === '') return toast('点数か偏差値を入れてください'); S.real.push({ day: parseDay($('#rDay').value) || t, sub: $('#rSub').value, score: sc === '' ? null : +sc, dev: dv2 === '' ? null : +dv2, avg: $('#rAvg').value === '' ? null : +$('#rAvg').value }); S.real.forEach(r => { if (r.score == null && r.dev == null) r.dev = 50; }); save(); toast('記録しました'); render(); };
  $('#bkOut').onclick = () => { const blob = new Blob([JSON.stringify(S)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'juken70_backup_' + dayStr(t) + '.json'; a.click(); };
  $('#bkIn').onclick = () => $('#bkFile').click();
  $('#bkFile').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const s = JSON.parse(r.result); if (!s || s.v !== 1) throw 0; S = s; save(); toast('読み込みました'); render(); } catch (x) { toast('読み込めませんでした'); } }; r.readAsText(f); };
}

/* ---------- 動画授業 (YouTube『とある男が授業をしてみた』の再生リストへのリンク) ---------- */
const plUrl = id => 'https://www.youtube.com/playlist?list=' + id;
function openExternal(url) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove(); }
function vVideo(v) {
  if (typeof VIDEOS === 'undefined') { v.innerHTML = '<div class="empty">動画の一覧を読み込めませんでした。開き直してください。</div>'; return; }
  const CH = VIDEOS.ch;
  if (!ORDER.includes(ui.vsub)) ui.vsub = ROT[dow(dayNum())][0];
  const k = ui.vsub;
  let h = '<div class="card vch"><div class="muted small">YouTubeチャンネル</div><div class="vch-name">' + esc(CH.name) + '</div><div class="two" style="margin-top:8px"><a class="btn ghost sm" href="' + CH.url + '" target="_blank" rel="noopener noreferrer">チャンネルを開く</a><a class="btn ghost sm" href="' + CH.all + '" target="_blank" rel="noopener noreferrer">再生リストの一覧</a></div>';
  h += '<form id="vsForm" class="vs"><input id="vsq" type="search" enterkeyhint="search" placeholder="単元で探す（例：相似）"><button class="btn sm" type="submit">探す</button></form></div>';
  h += '<div class="seg">' + ORDER.map(s => '<button data-vs="' + s + '" class="' + (k === s ? 'on' : '') + '">' + SUBJ[s].name + '</button>').join('') + '</div>';
  (VIDEOS.subj[k] || []).forEach(g => {
    h += '<details class="card vgroup s-' + k + '" style="--c:var(--' + k + ')"' + (g.open ? ' open' : '') + '><summary>' + esc(g.title) + '</summary>' + (g.note ? '<div class="muted small" style="margin:4px 0 2px">' + esc(g.note) + '</div>' : '') + '<div class="list">';
    g.items.forEach(it => { h += '<a class="item vrow" href="' + plUrl(it.id) + '" target="_blank" rel="noopener noreferrer"><span class="vplay">▶</span><div class="grow"><div class="vt">' + esc(it.t) + '</div><div class="muted small">全' + it.n + '本</div></div><span class="muted">見る ›</span></a>'; });
    h += '</div></details>';
  });
  h += '<div class="muted small" style="margin:2px 2px 0">動画はYouTubeで開きます（通信が必要です）。見たあとは「学習」タブで同じ分野の問題を解くと、身につきます。</div>';
  v.innerHTML = h;
  v.querySelectorAll('.seg button').forEach(b => b.onclick = () => { ui.vsub = b.dataset.vs; render(); });
  $('#vsForm').onsubmit = e => { e.preventDefault(); const q = $('#vsq').value.trim(); if (!q) return toast('探したい言葉を入れてください'); openExternal(CH.search + encodeURIComponent(q)); };
}

/* ---------- 参考書 ---------- */
function chapterOf(q) { const u = unitOf(q); const m = u && /第(\d+)章/.exec(u.guide || ''); return m ? +m[1] - 1 : null; }
function openRef(sub, idx) {
  const r = (DB[sub].refs || [])[idx]; if (!r) return;
  const z = document.createElement('div'); z.id = 'refov';
  z.innerHTML = '<div class="sess-top"><div class="row"><button class="x" id="rx">← もどる</button><div class="grow" style="text-align:center;font-weight:800;font-size:14px">' + esc(SUBJ[sub].name) + ' 参考書</div><span></span></div></div><div class="qwrap"><h2 style="margin-top:6px">' + esc(r.title) + '</h2>' + (r.lead ? '<div class="card" style="background:#eef2fb">' + r.lead + '</div>' : '') + r.secs.map((x, i) => '<details class="card refsec"' + (i === 0 ? ' open' : '') + '><summary>' + x[0] + '</summary><div class="refbody">' + x[1] + '</div></details>').join('') + '</div>';
  document.body.appendChild(z); z.scrollTop = 0; $('#rx').onclick = () => z.remove();
}
function vRef(v) {
  const subs = ORDER.concat(['time']);
  if (!subs.includes(ui.refSub)) ui.refSub = 'eng';
  let h = '<div class="seg">' + ORDER.map(k => '<button data-r="' + k + '" class="' + (ui.refSub === k ? 'on' : '') + '">' + SUBJ[k].name + '</button>').join('') + '<button data-r="time" class="' + (ui.refSub === 'time' ? 'on' : '') + '">歴史年表</button></div>';
  if (ui.refSub !== 'time') {
    const rs = DB[ui.refSub].refs || [];
    h += '<div class="card list">' + rs.map((r, i) => '<div class="item" data-i="' + i + '"><div class="grow"><div style="font-weight:800">' + esc(r.title) + '</div><div class="muted small">' + r.secs.length + 'つの項目</div></div><span class="muted">読む ›</span></div>').join('') + '</div><div class="muted small">各回の問題（学習タブ）に対応する章です。まちがえた問題の下の「参考書を読む」からも開けます。</div>';
  } else {
    h += '<select id="eraSel">' + TIMELINE.map((e, i) => '<option value="' + i + '"' + (i === ui.era ? ' selected' : '') + '>第' + (i + 1) + '回 ' + esc(e.title) + '（' + esc(e.span) + '）</option>').join('') + '</select>';
    const e = TIMELINE[ui.era] || TIMELINE[0];
    if (e) {
      h += '<div class="card" style="margin-top:10px"><div class="muted">' + esc(e.flow) + '</div></div><div class="card"><table class="yt2">' + e.items.map(it => '<tr class="' + (it.w ? 'w' : '') + '"><td class="y">' + esc(it.y) + (it.rk === 'A' ? ' <span class="tag" style="background:#c0182b">A</span>' : '') + '</td><td>' + it.t.replace(/\{([^{}|]*)(\|[^{}]*)?\}/g, '<span class="kw">$1</span>').replace(/\[([^\[\]]*)\]/g, '<span class="kw">$1</span>') + (it.m ? '<br><span class="muted small">語呂：' + esc(it.m) + '</span>' : '') + '</td></tr>').join('') + '</table></div>';
      h += '<div class="card" style="background:#fff8f8;border-color:#f1c3c0"><h3 style="color:#c0182b">ここがねらわれる</h3><ul style="margin:6px 0 0;padding-left:18px;font-size:14px">' + e.watch.map(w => '<li>' + w + '</li>').join('') + '</ul></div>';
    }
  }
  v.innerHTML = h;
  v.querySelectorAll('.seg button').forEach(b => b.onclick = () => { ui.refSub = b.dataset.r; render(); });
  v.querySelectorAll('.item[data-i]').forEach(el => el.onclick = () => openRef(ui.refSub, +el.dataset.i));
  if ($('#eraSel')) $('#eraSel').onchange = e => { ui.era = +e.target.value; render(); };
}

/* ---------- 設定 ---------- */
function openSettings() {
  const o = $('#overlay'); o.hidden = false; document.body.style.overflow = 'hidden';
  const bs = ORDER.map(k => { const b = baseOf(k); return '<div class="card" style="margin-bottom:8px"><b>' + SUBJ[k].name + '</b><div class="two" style="margin-top:6px"><label class="f">点数<input type="number" inputmode="decimal" id="b_' + k + '_s" value="' + (b.score != null ? b.score : '') + '"></label><label class="f">平均点<input type="number" inputmode="decimal" id="b_' + k + '_a" value="' + (S.base && S.base[k] && S.base[k].avg != null ? b.avg : '') + '"></label></div><label class="f" style="margin:0">つまずいたところ（メモ）<input id="b_' + k + '_m" value="' + esc(b.memo || '') + '"></label></div>'; }).join('');
  o.innerHTML = '<div class="sess-top"><div class="row"><div class="grow" style="font-weight:800">設定</div><button class="x" id="xClose">閉じる</button></div></div><div class="qwrap"><div class="card"><label class="f">入試日（共通選抜の学力検査）<input type="date" id="sExam" value="' + S.set.exam + '"></label><label class="f">中間目標の日（1月の模試など）<input type="date" id="sGoal" value="' + S.set.goal + '"></label><div class="two"><label class="f">平日の勉強時間（分）<input type="number" id="sWk" value="' + S.set.wk + '"></label><label class="f">休日の勉強時間（分）<input type="number" id="sWe" value="' + S.set.we + '"></label></div><label class="f">目標偏差値<input type="number" id="sTg" value="' + S.set.target + '"></label></div><h2>前回の全県模試</h2><div class="muted small" style="margin:0 2px 8px">点数と平均点から、偏差値の目安を計算します。この端末の中だけに保存されます。</div>' + bs + '<button class="btn block" id="sSave" style="margin-top:6px">保存</button><div class="card" style="margin-top:14px"><button class="btn ng block" id="sReset">すべての記録を消す</button><div class="muted small" style="margin-top:6px">先にバックアップ（記録タブ）を取ってください。</div></div><div class="muted small" style="text-align:center">受験70 v1 ・ 問題 ' + QS.length + '問</div></div>';
  $('#xClose').onclick = closeOverlay;
  $('#sSave').onclick = () => {
    S.set.exam = $('#sExam').value || S.set.exam; S.set.goal = $('#sGoal').value || S.set.goal; S.set.wk = clamp(+$('#sWk').value || 150, 30, 600); S.set.we = clamp(+$('#sWe').value || 300, 30, 900); S.set.target = clamp(+$('#sTg').value || 70, 40, 80);
    const base = {}; let any = false;
    ORDER.forEach(k => { const sc = $('#b_' + k + '_s').value, av = $('#b_' + k + '_a').value, me = $('#b_' + k + '_m').value; const old = (S.base && S.base[k]) || {}; base[k] = { score: sc === '' ? null : +sc, avg: av === '' ? null : +av, sd: old.sd || 20, memo: me }; if (sc !== '') any = true; });
    if (any) applyBase(base); else S.base = base;
    save(); toast('保存しました'); closeOverlay();
  };
  $('#sReset').onclick = () => { if (confirm('本当にすべての記録を消しますか？（元にもどせません）')) { S = defState(); save(); closeOverlay(); } };
}
// 設定用リンク(#setup=...)で、前回の模試などを1回で入れる(内容は通信されません)
function applySetupFromHash() {
  const m = /#setup=([A-Za-z0-9_-]+)/.exec(location.hash); if (!m) return;
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/')); const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    if (o.set) Object.assign(S.set, o.set); if (o.base) applyBase(o.base); save();
    history.replaceState(null, '', location.pathname + location.search); setTimeout(() => toast('設定を読み込みました'), 600);
  } catch (e) { }
}

/* ---------- 図の拡大 ---------- */
document.addEventListener('click', e => {
  const sv = e.target.closest && e.target.closest('#overlay svg.fig, #view svg.fig');
  if (!sv) return;
  const z = document.createElement('div'); z.id = 'zoom';
  z.innerHTML = '<div class="zbar"><button id="zx">閉じる ×</button><span>指でひろげて見られます</span></div><div class="zbody">' + sv.outerHTML.replace('<svg', '<svg style="width:230%;max-width:none"') + '</div>';
  document.body.appendChild(z); $('#zx').onclick = () => z.remove();
});

/* ---------- 起動 ---------- */
applySetupFromHash();
window.addEventListener('hashchange', () => { applySetupFromHash(); render(); });
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
$('#btnSettings').onclick = openSettings;
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); else if (!SS && !MS && $('#overlay').hidden) render(); });
render();
loadAll().then(() => { save(); render(); }).catch(e => { $('#view').innerHTML = '<div class="empty">データを読み込めませんでした。電波のある場所で開き直してください。<br><small>' + esc(e) + '</small></div>'; });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
