/* 学習の記録（カバー率・定着率の推移）。

   新しく記録する項目は無く、既存のセッション明細を読み直して描くだけなので、
   「昔の記録からでも曲線が出るか」「履歴が切り詰められたときに嘘をつかないか」
   をここで見る。 */
import { launchBrowser } from './browser.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');

const f = [];
const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) f.push(m); };
const b = await launchBrowser();

const Q = (id, method) => ({
  id, chapter: 1, tag: '#1', method,
  q: '問題' + id, options: ['あ' + id, 'い', 'う', 'え'],
  answer: 0, explanation: '解説', source: 'https://example.com/', addedAt: '2026-08-01',
});
// 処理方式2問 / データ方式2問
const DATA = [Q(1, '処理方式'), Q(2, '処理方式'), Q(3, 'データ方式'), Q(4, 'データ方式')];

// セッション明細を仕込む。"@<日時>|<id>:1,..."
const sess = (at, pairs, label) => ({
  at, mode: 'all', label: label || '全範囲',
  total: pairs.length, correct: pairs.filter(p => p[1]).length,
  detail: '@' + at + '|' + pairs.map(p => p[0] + ':' + (p[1] ? 1 : 0)).join(','),
});

async function open(sessions, stats) {
  const c = await b.newContext({ viewport: { width: 375, height: 812 } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/quiz-data.json', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(DATA) }));
  await p.addInitScript(([s, st]) => {
    localStorage.setItem('gcpQuiz.v1', JSON.stringify({ version: 1, stats: st, sessions: s }));
  }, [sessions, stats || {}]);
  await p.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });
  await p.locator('#screenHome:not(.hidden)').waitFor();
  return { c, p, errs };
}

const statsFrom = (map) => {
  const st = {};
  Object.keys(map).forEach(id => {
    const good = map[id];
    st[id] = { seen: 1, correct: good ? 1 : 0, wrong: good ? 0 : 1,
               last: good ? 'correct' : 'wrong', lastAt: '2026-08-10T00:00:00.000Z' };
  });
  return st;
};

console.log('\n【1】記録が無いとき');
{
  const { c, p, errs } = await open([]);
  await p.locator('#progBtn').click();
  await p.locator('#screenProgress:not(.hidden)').waitFor();
  ok(/まだ記録がありません/.test(await p.locator('#pgCurve').innerText()), '記録が無い旨を出す');
  ok(await p.locator('#pgMethodCard').isHidden(), '方式別のカードは出さない');
  ok(await p.locator('#pgSessions').textContent() === '0', 'セッション数は0');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【2】1セッションだけのとき');
{
  const s = [sess('2026-08-10T01:00:00.000Z', [[1, true], [2, false]])];
  const { c, p, errs } = await open(s, statsFrom({ 1: true, 2: false }));
  await p.locator('#progBtn').click();
  await p.locator('#screenProgress:not(.hidden)').waitFor();
  ok(/あと1回解くと推移が出ます/.test(await p.locator('#pgCurve').innerText()),
     '1件では推移にならない旨を出す');
  ok(await p.locator('#pgCover').textContent() === '25%', 'カバー率 1/4 = 25%');
  ok(await p.locator('#pgRetain').textContent() === '25%', '定着率 1/4 = 25%');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【3】3セッションで曲線が出るか');
{
  const s = [
    sess('2026-08-10T01:00:00.000Z', [[1, true], [2, false]]),
    sess('2026-08-11T01:00:00.000Z', [[2, true], [3, false]]),
    sess('2026-08-12T01:00:00.000Z', [[3, true], [4, true]]),
  ];
  const { c, p, errs } = await open(s, statsFrom({ 1: true, 2: true, 3: true, 4: true }));
  await p.locator('#progBtn').click();
  await p.locator('#screenProgress:not(.hidden)').waitFor();

  ok(await p.locator('#pgSessions').textContent() === '3', 'セッション数3');
  ok(await p.locator('#pgCover').textContent() === '100%', 'カバー率 4/4 = 100%');
  ok(await p.locator('#pgCurve svg').count() === 1, '折れ線が1枚描かれる');
  const lines = await p.locator('#pgCurve svg polyline').count();
  ok(lines === 2, 'カバー率と定着率の2本: ' + lines);

  // カバー率は単調に増える（これが「正直な進捗」の根拠）
  const pts = await p.locator('#pgCurve svg polyline').first().getAttribute('points');
  const ys = pts.trim().split(/\s+/).map(t => Number(t.split(',')[1]));
  ok(ys.every((y, i) => i === 0 || y <= ys[i - 1] + 0.001),
     'カバー率の線は下がらない（y が単調に減る）: ' + ys.map(v => v.toFixed(0)).join('→'));

  ok(/カバー率/.test(await p.locator('#pgCurve .lgd').innerText()), '凡例が出る');
  ok(await p.locator('#pgMethodCard').isVisible(), '方式別のカードが出る');
  const rows = await p.locator('#pgMethods .mrow').count();
  ok(rows === 2, '方式が2行（処理方式・データ方式）: ' + rows);
  const mtxt = await p.locator('#pgMethods').innerText();
  ok(/処理方式/.test(mtxt) && /データ方式/.test(mtxt), '方式名が出る');
  ok((await p.locator('#pgMethods .msp svg').count()) === 2, '方式ごとに小さな折れ線が出る');
  ok(/100%/.test(mtxt), '定着した方式は100%と出る');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【4】正答率の推移は出さない（間違い優先で出題するため誤解を生む）');
{
  const s = [
    sess('2026-08-10T01:00:00.000Z', [[1, true], [2, false]]),
    sess('2026-08-11T01:00:00.000Z', [[2, true], [3, false]]),
  ];
  const { c, p } = await open(s, statsFrom({ 1: true, 2: true, 3: false }));
  await p.locator('#progBtn').click();
  await p.locator('#screenProgress:not(.hidden)').waitFor();
  const t = await p.locator('#screenProgress').innerText();
  ok(/正答率の推移はあえて出していません/.test(t), 'なぜ出さないかを書いてある');
  ok(/間違えた問題を優先/.test(t), '理由（間違い優先で出題）が書いてある');
  await c.close();
}

console.log('\n【5】履歴が切り詰められているとき、曲線の左端が低く出ることを隠さない');
{
  // 明細のあるセッションは1件だけ。でも stats では4問すべて正解済み
  // ＝ 古い履歴が落ちている状態。
  const s = [
    sess('2026-08-11T01:00:00.000Z', [[1, true]]),
    sess('2026-08-12T01:00:00.000Z', [[2, true]]),
  ];
  const { c, p } = await open(s, statsFrom({ 1: true, 2: true, 3: true, 4: true }));
  await p.locator('#progBtn').click();
  await p.locator('#screenProgress:not(.hidden)').waitFor();
  ok(await p.locator('#pgCover').textContent() === '100%', '見出しの数字は state.stats の正しい値');
  const note = await p.locator('#pgNote').textContent();
  ok(/左端は実際より低め/.test(note), '曲線が過小に出ることを注記する: ' + note.slice(0, 40));
  await c.close();
}

console.log('\n【6】消した問題は数に入れない / 手書きの明細は信用しない');
{
  const s = [
    // id 99 はいまのデータに無い
    sess('2026-08-10T01:00:00.000Z', [[1, true], [99, true]]),
    sess('2026-08-11T01:00:00.000Z', [[2, true]]),
    // アプリが書いたものではない明細（"@" 始まりでない）
    { at: '2026-08-12T01:00:00.000Z', mode: 'all', label: '手書き',
      total: 4, correct: 4, detail: '1:1,2:1,3:1,4:1' },
  ];
  const { c, p } = await open(s, statsFrom({ 1: true, 2: true }));
  await p.locator('#progBtn').click();
  await p.locator('#screenProgress:not(.hidden)').waitFor();
  ok(await p.locator('#pgSessions').textContent() === '2',
     '信用できる明細2件だけを数える（手書きは除く）');
  ok(await p.locator('#pgCover').textContent() === '50%',
     '存在しない id 99 はカバー率に入らない（2/4 = 50%）');
  await c.close();
}

console.log('\n【7】ホームに戻れる / 保存件数の上限');
{
  const { c, p } = await open([sess('2026-08-10T01:00:00.000Z', [[1, true]])]);
  await p.locator('#progBtn').click();
  await p.locator('#screenProgress:not(.hidden)').waitFor();
  await p.locator('#pgBackBtn').click();
  await p.locator('#screenHome:not(.hidden)').waitFor();
  ok(true, '「ホームに戻る」で戻れる');
  const max = await p.evaluate(() => window.__HIST || null);
  await c.close();

  const src = fs.readFileSync(path.join(QUIZ, 'index.html'), 'utf8');
  const m = src.match(/var HIST_MAX\s*=\s*(\d+)/);
  const sh = src.match(/var HIST_SHOW\s*=\s*(\d+)/);
  ok(m && Number(m[1]) >= 100, '曲線が伸びるよう履歴を100件以上保存する: ' + (m && m[1]));
  ok(sh && Number(sh[1]) <= 20, 'ホームの一覧は20件までに抑える: ' + (sh && sh[1]));
}

await b.close();
console.log('\n' + (f.length ? `FAILURES (${f.length}):\n - ` + f.join('\n - ') : 'ALL PASS'));
process.exit(f.length ? 1 : 0);
