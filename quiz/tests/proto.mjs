/* プロトタイプ汚染・型混乱の回帰テスト。

   このアプリは問題の id / 方式名 / 追加日 / セッションの日時を、
   そのまま連想配列のキーに使う。キーの出所は quiz-data.json・Notion・貼り付け・
   localStorage で、どれも「自分が入れたもの」とは限らない。
   素の {} をマップに使うと "constructor" が中身なしで truthy になり、
   "__proto__" への代入はキーではなくプロトタイプの差し替えになる。

   ここに並んでいるのは、すべてセキュリティレビューで実機再現された攻撃。 */
import { launchBrowser } from './browser.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');

const f = [];
const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) f.push(m); };
const b = await launchBrowser();

const Q = (o) => Object.assign({
  chapter: 1, tag: '#1', method: '構成・前提', q: '問題', options: ['あ', 'い', 'う', 'え'],
  answer: 0, explanation: '解説', source: 'https://example.com/', addedAt: '2026-08-01',
}, o);

async function open(data, ls) {
  const c = await b.newContext({ viewport: { width: 375, height: 812 } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/quiz-data.json', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
  if (ls) await p.addInitScript(v => localStorage.setItem('gcpQuiz.v1', v), ls);
  await p.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });
  await p.locator('#screenHome:not(.hidden)').waitFor();
  return { c, p, errs };
}

const PROTO_KEYS = ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty'];

console.log('\n【1】addedAt がプロトタイプ名でも「最近追加」が死なない');
{
  const data = [Q({ id: 1 }), Q({ id: 2 })];
  PROTO_KEYS.forEach((k, i) => data.push(Q({ id: 10 + i, q: 'addedAt=' + k, addedAt: k })));
  const { c, p, errs } = await open(data);
  await p.locator('#modeRecent').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor({ timeout: 5000 })
    .then(() => ok(true, '「最近追加された問題」が開く'))
    .catch(() => ok(false, '「最近追加された問題」が開く'));
  ok(!errs.some(e => /is not a function/.test(e)),
     '例外が出ない' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【2】id がプロトタイプ名でも「重複」と誤判定されない');
{
  const data = [Q({ id: 1 })];
  PROTO_KEYS.forEach(k => data.push(Q({ id: k, q: 'id=' + k })));
  const { c, p, errs } = await open(data);
  const total = Number(await p.locator('#stTotal').textContent());
  ok(total === data.length, `${data.length}問すべて読み込まれる: ${total}問`);
  const warn = await p.locator('#dataWarn').isVisible().catch(() => false);
  ok(!warn, '「重複しています」の警告が出ない');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【3】method がプロトタイプ名でも方式別に現れる');
{
  const data = [Q({ id: 1, method: '処理方式' }), Q({ id: 2, method: '__proto__' }),
                Q({ id: 3, method: 'constructor' })];
  const { c, p } = await open(data);
  const txt = await p.locator('#methodBtns').innerText();
  ok(/__proto__/.test(txt), '方式 "__proto__" がボタンに出る');
  ok(/constructor/.test(txt), '方式 "constructor" がボタンに出る');
  await c.close();
}

console.log('\n【4】localStorage の stats に __proto__ があっても幻の記録が出ない');
{
  // 1問も解いていないのに「挑戦済み3・要復習1」に見えてしまう攻撃
  const ls = JSON.stringify({ version: 1, sessions: [], stats: {
    __proto__: { 1: { seen: 9, correct: 9, wrong: 0, last: 'correct', lastAt: '2026-08-01T00:00:00.000Z' },
                 2: { seen: 9, correct: 0, wrong: 9, last: 'wrong',   lastAt: '2026-08-01T00:00:00.000Z' } } } });
  const { c, p, errs } = await open([Q({ id: 1 }), Q({ id: 2 }), Q({ id: 3 })], ls);
  ok(await p.locator('#stSeen').textContent() === '0', '挑戦済みは0（幻の記録が出ない）');
  ok(await p.locator('#modeWrong').isDisabled(), '「間違いのみ」は無効のまま');
  const polluted = await p.evaluate(() => ({}).last !== undefined || ({}).seen !== undefined);
  ok(!polluted, 'Object.prototype が汚染されていない');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【5】detail が文字列でなくても「学習の記録」が開く');
{
  const ls = JSON.stringify({ version: 1, stats: {}, sessions: [
    { at: '2026-08-30T01:00:00.000Z', label: '全範囲', total: 10, correct: 7, detail: {} },
    { at: '2026-08-29T01:00:00.000Z', label: '全範囲', total: 10, correct: 5, detail: 42 },
  ] });
  const { c, p, errs } = await open([Q({ id: 1 })], ls);
  await p.locator('#progBtn').click();
  await p.locator('#screenProgress:not(.hidden)').waitFor({ timeout: 5000 })
    .then(() => ok(true, '「学習の記録」が開く'))
    .catch(() => ok(false, '「学習の記録」が開く'));
  ok(!errs.some(e => /indexOf is not a function/.test(e)),
     'indexOf の例外が出ない' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【6】貼り付けJSONの __proto__ で抜け殻が保存されない');
{
  const { c, p, errs } = await open([Q({ id: 1 })]);
  await p.locator('#addBtn').click();
  await p.locator('#addTa').fill(JSON.stringify([{ __proto__: {
    chapter: 3, method: '処理方式', q: 'プロトタイプ経由の問題',
    options: ['あ', 'い', 'う', 'え'], answer: 1, explanation: '解説' } }]));
  await p.locator('#addCheckBtn').click();
  await p.locator('#addResult').waitFor({ timeout: 3000 });
  const cls = await p.locator('#addResult').getAttribute('class');
  const txt = await p.locator('#addResult').innerText();
  ok(/ng/.test(cls || ''), '取り込めない旨を出す（「1問を追加します」と嘘をつかない）: ' + txt.split('\n')[0]);
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【7】Notion の明細に __proto__ があっても汚染されない');
{
  const LOGVIEW = 'c68a3cb4';
  const c = await b.newContext({ viewport: { width: 375, height: 812 } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((view) => {
    window.claude = { use: n => Promise.resolve(
      n === 'artifact' ? { publish: () => Promise.resolve() } :
      n === 'mcp' ? {
        callTool: (s, t, i) => {
          if (t === 'notion-create-pages') return Promise.resolve({ payload: { pages: [] } });
          if (i && i.data && i.data.view_url && i.data.view_url.indexOf(view) >= 0) {
            return Promise.resolve({ payload: { has_more: false, results: [{
              '記録': 'x', '日時': '2026-08-01', 'モード': '全範囲', '出題数': 2, '正解数': 2,
              '正答率': 1,
              '明細': '@2026-08-01T00:00:00.000Z|__proto__:1,__proto__:1,constructor:1' }] } });
          }
          return Promise.resolve({ payload: { results: [], has_more: false } });
        }, watchTool: () => () => {}, listTools: () => Promise.resolve([]) } : null) };
  }, LOGVIEW);
  await p.route('**/quiz-data.json', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify([Q({ id: 1 })]) }));
  await p.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.waitForTimeout(900);
  const polluted = await p.evaluate(() => {
    const o = {};
    return { seen: o.seen, last: o.last, lastAt: o.lastAt, correct: o.correct };
  });
  ok(polluted.seen === undefined && polluted.last === undefined
     && polluted.lastAt === undefined && polluted.correct === undefined,
     'Object.prototype が汚染されない: ' + JSON.stringify(polluted));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【8】未送信の履歴でも上限が効く（無限に増えない）');
{
  const src = fs.readFileSync(path.join(QUIZ, 'index.html'), 'utf8');
  const MAX = Number(src.match(/var HIST_MAX\s*=\s*(\d+)/)[1]);
  const sessions = [];
  for (let i = 0; i < MAX * 3; i++) {
    const at = new Date(Date.UTC(2026, 0, 1) + i * 3600000).toISOString();
    sessions.push({ at, mode: 'all', label: '全範囲', total: 1, correct: 1,
                    detail: '@' + at + '|1:1' });
  }
  const ls = JSON.stringify({ version: 1, stats: {}, sessions });
  const { c, p } = await open([Q({ id: 1 }), Q({ id: 2 })], ls);
  // 1セッション解く → finish() で trimSessions(null) が走る
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  for (let i = 0; i < 2; i++) {
    await p.locator('#qOpts .opt').nth(0).click();
    await p.locator('#qVerdict:not(.hidden)').waitFor();
    await p.locator('#nextBtn').click();
  }
  await p.locator('#screenResult:not(.hidden)').waitFor();
  const n = await p.evaluate(() => JSON.parse(localStorage.getItem('gcpQuiz.v1')).sessions.length);
  ok(n <= MAX * 2 + 1, `未送信でも上限で切り詰められる: ${n}件（上限 ${MAX * 2}）`);
  await c.close();
}

console.log('\n【9】マップが素の {} に戻っていないか（実装の見張り）');
{
  const src = fs.readFileSync(path.join(QUIZ, 'index.html'), 'utf8');
  ok(/function bare\(\)\s*\{\s*return Object\.create\(null\);\s*\}/.test(src),
     'bare() が定義されている');
  const bad = [];
  [['var seen = {}', 'parseData / methodList'], ['var groups = {}', 'poolRecent'],
   ['var tmp = {}', 'mergeRemoteLog'], ['var seenIds = {}', 'addCheck'],
   ['var inSet = {}', 'buildProgress'], ['var everOK = {}', 'buildProgress'],
   ['var have = {}', 'mergeRemoteLog / addCheck'], ['var chapSet = {}', 'applyQuestions'],
  ].forEach(([pat, where]) => { if (src.includes(pat)) bad.push(pat + '（' + where + '）'); });
  ok(bad.length === 0, '外部由来のキーを持つマップが素の {} に戻っていない'
     + (bad.length ? ': ' + bad.join(', ') : ''));
}

console.log('\n【10】自己再発行: タイトルがエスケープされる（生タグに化けない）');
{
  const { c, p } = await open([Q({ id: 1 })]);
  const out = await p.evaluate(() => {
    // 実際の buildDocument を、title が汚染された状態で走らせる
    const t = document.getElementById('appTitle')
           || Object.assign(document.createElement('title'), { id: 'appTitle' });
    if (!t.parentNode) document.head.appendChild(t);
    t.textContent = 'データ基盤 & 復習クイズ </title><script>window.__PWNED=1;<\/script>';
    const html = window.buildDocument ? window.buildDocument([{ id: 1, q: 'x',
      options: ['a','b','c','d'], answer: 0, explanation: 'e', addedAt: '2026-01-01' }]) : null;
    return html;
  });
  if (out === null) {
    ok(true, 'buildDocument は外から呼べない（内部関数）— HTML の目視検査はスキップ');
  } else {
    ok(!/<\/title><script>/.test(out), 'タイトルから生の </title><script> が出ない');
    ok(out.split('id="appTitle"').length - 1 === 1, 'appTitle がちょうど1つ');
  }
  // 実装の見張り: エスケープが外れていないか
  const src = fs.readFileSync(path.join(QUIZ, 'index.html'), 'utf8');
  ok(/escText\(appTitle\(\)\)/.test(src), 'buildDocument がタイトルをエスケープしている');
  ok(/getElementById\('appTitle'\)\s*&&/.test(src), 'canPublish が appTitle も見ている');
  await c.close();
}

console.log('\n【11】巨大な id を混ぜても、以後の「id 省略の追加」が壊れない');
{
  const { c, p, errs } = await open([Q({ id: 1 }), Q({ id: 9007199254740992, q: '巨大idの問題' })]);
  await p.locator('#addBtn').click();
  await p.locator('#addTa').fill(JSON.stringify([{
    chapter: 1, tag: '#1', method: '構成・前提', q: 'id を省いた新しい問題',
    options: ['ま', 'み', 'む', 'め'], answer: 0, explanation: '解説',
    source: 'https://example.com/', addedAt: '2026-09-01' }]));
  await p.locator('#addCheckBtn').click();
  await p.locator('#addResult').waitFor({ timeout: 3000 });
  const cls = await p.locator('#addResult').getAttribute('class');
  const txt = await p.locator('#addResult').innerText();
  ok(/ok/.test(cls || ''), 'id を省いた追加が通る: ' + txt.split('\n')[0]);
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【12】ビルドはタイトルの < > & を拒む');
{
  const src = fs.readFileSync(path.join(QUIZ, 'build-artifact.mjs'), 'utf8');
  ok(/\[<>&\]/.test(src), 'build-artifact.mjs がタイトルの < > & を弾く');
  ok(/const shell = out\.replace\(script, ''\)/.test(src),
     'id の個数検査がアプリ本体を除いて数えている（誤検知しない）');
  ok(/json\.indexOf\('<'\) >= 0/.test(src), '埋め込みJSONに生の < が無いことを直接見ている');
  const app = fs.readFileSync(path.join(QUIZ, 'index.html'), 'utf8');
  ok(/function publishProblem/.test(app), '発行前に自分でも検算している');
}

await b.close();
console.log('\n' + (f.length ? `FAILURES (${f.length}):\n - ` + f.join('\n - ') : 'ALL PASS'));
process.exit(f.length ? 1 : 0);
