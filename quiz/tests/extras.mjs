/* 追加した5つの機能。
     1 出題から外す（hidden）
     2 自分の説明を書き残す（notes）
     3 面接前チェックリスト
     4 説明モードの記録を Notion に同期（"@<日時>|%..."）
     5 学習記録のバックアップ / 復元

   どれも「解いた記録が壊れないこと」が一番大事なので、
   見た目より先に localStorage の中身を見に行く。 */
import { launchBrowser } from './browser.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');

const f = [];
const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) f.push(m); };
const b = await launchBrowser();

const Q = (id, o) => Object.assign({
  id, chapter: 1, tag: '#1', method: '構成・前提',
  q: '問題' + id, options: ['あ' + id, 'い', 'う', 'え'],
  answer: 0, explanation: '解説' + id, source: 'https://example.com/', addedAt: '2026-08-01',
}, o || {});

const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();

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
const store = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('gcpQuiz.v1') || 'null'));
const turnOnExplain = async (p) => {
  await p.locator('.modesw').click();
  await p.waitForFunction(() => document.getElementById('explainSw').checked);
};

/* ============================================================
   1. 出題から外す
   ============================================================ */
console.log('\n【1】出題から外すと、どのモードにも出なくなる');
{
  const { c, p, errs } = await open([Q(1), Q(2), Q(3)]);
  ok(await p.locator('#stTotal').textContent() === '3', '最初は3問');
  ok(await p.locator('#hiddenCard').isHidden(), '1問も外していなければカードは出ない');

  await p.evaluate(() => {
    localStorage.setItem('gcpQuiz.v1', JSON.stringify({ version: 1, sessions: [], stats: {}, hidden: { 2: true } }));
  });
  await p.reload({ waitUntil: 'networkidle' });
  await p.locator('#screenHome:not(.hidden)').waitFor();

  ok(await p.locator('#stTotal').textContent() === '2', '外した1問は総数から引かれる: '
    + await p.locator('#stTotal').textContent());
  ok(await p.locator('#hiddenCard').isVisible(), '外した問題のカードが出る');
  ok(/1問/.test(await p.locator('#hiddenCount').textContent()), '件数が出る');

  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const seen = [];
  for (let i = 0; i < 2; i++) {
    seen.push(await p.locator('#qText').textContent());
    await p.locator('#qOpts .opt').nth(0).click();
    await p.locator('#nextBtn').click();
  }
  await p.locator('#screenResult:not(.hidden)').waitFor();
  ok(seen.length === 2 && !seen.includes('問題2'), '外した問題は出題されない: ' + seen.join(','));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【1b】「今後出さない」を押すと次から出なくなる（いまの列は崩さない）');
{
  const { c, p, errs } = await open([Q(1), Q(2)]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  ok(await p.locator('#hideQBtn').isHidden(), '解答するまでは出さない');

  await p.locator('#qOpts .opt').nth(0).click();
  await p.locator('#qNextWrap:not(.hidden)').waitFor();
  ok(await p.locator('#hideQBtn').isVisible(), '解答後に出る');
  const hidden = await p.locator('#qText').textContent();
  const total = await p.locator('#qCount').textContent();
  await p.locator('#hideQBtn').click();

  ok(/次から出しません/.test(await p.locator('#hideQBtn').textContent()), 'ボタンの文言が変わる');
  ok(await p.locator('#hideQBtn').isDisabled(), '二度押せない');
  ok(await p.locator('#qCount').textContent() === total,
     'いま解いている列の「n / 2」は動かない: ' + await p.locator('#qCount').textContent());

  const s = await store(p);
  ok(s.hidden && Object.keys(s.hidden).length === 1, 'hidden に1件入る: ' + JSON.stringify(s.hidden));

  await p.locator('#nextBtn').click();
  await p.locator('#qOpts .opt').nth(0).click();
  await p.locator('#nextBtn').click();
  await p.locator('#screenResult:not(.hidden)').waitFor();
  await p.locator('#toHomeBtn').click();
  ok(await p.locator('#stTotal').textContent() === '1', 'ホームの総数が1減る');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
  void hidden;
}

console.log('\n【1c】外した問題は一覧から戻せる');
{
  const ls = JSON.stringify({ version: 1, sessions: [], stats: {}, hidden: { 1: true, 2: true } });
  const { c, p, errs } = await open([Q(1), Q(2), Q(3)], ls);
  ok(await p.locator('#hiddenList').isHidden(), '既定では閉じている');
  await p.locator('#hiddenToggle').click();
  await p.locator('#hiddenList:not(.hidden)').waitFor();
  ok(await p.locator('#hiddenList .hidrow').count() === 2, '2問並ぶ');

  await p.locator('#hiddenList .hidrow button').nth(0).click();
  await p.waitForTimeout(150);
  ok(await p.locator('#hiddenList .hidrow').count() === 1, '戻すと1問に減る');
  ok(await p.locator('#stTotal').textContent() === '2', '総数が2に戻る');

  await p.locator('#hiddenList .hidrow button').nth(0).click();
  await p.waitForTimeout(150);
  ok(await p.locator('#hiddenCard').isHidden(), '0問になるとカードごと消える');
  const s = await store(p);
  ok(Object.keys(s.hidden || {}).length === 0, 'hidden が空になる: ' + JSON.stringify(s.hidden));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【1d】章を丸ごと外してもホームが壊れない');
{
  const ls = JSON.stringify({ version: 1, sessions: [], stats: {}, hidden: { 2: true } });
  const { c, p, errs } = await open([Q(1), Q(2, { chapter: 2 })], ls);
  const chaps = await p.locator('#chapBtns .btn').count();
  ok(chaps === 1, '空になった章のボタンは出さない: ' + chaps + '個');
  await p.locator('#progBtn').click();
  await p.locator('#screenProgress:not(.hidden)').waitFor();
  ok(!/NaN/.test(await p.locator('#screenProgress').innerText()), '学習の記録に NaN が出ない');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

/* ============================================================
   2. 自分の説明を書き残す
   ============================================================ */
console.log('\n【2】説明モードでメモを書くと残る');
{
  const { c, p, errs } = await open([Q(1)]);
  await turnOnExplain(p);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  ok(await p.locator('#qNote').isVisible(), 'メモ欄が出る');
  ok(await p.locator('#qNotePrev').isHidden(), '前のメモはまだ出ない（1回目）');

  await p.locator('#qNote').fill('パーティションで読む量を減らす');
  ok(/\d+ \/ \d+/.test(await p.locator('#qNoteCnt').textContent()), '文字数が出る: '
    + await p.locator('#qNoteCnt').textContent());

  await p.locator('#revealBtn').click();
  await p.locator('#qVerdict:not(.hidden)').waitFor();
  const s = await store(p);
  ok(s.notes && s.notes['1'] === 'パーティションで読む量を減らす',
     '答えを見た時点で保存される: ' + JSON.stringify(s.notes));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【2b】前のメモは答えを見るまで出さない');
{
  const ls = JSON.stringify({ version: 1, sessions: [], stats: {}, notes: { 1: '前に書いた文' } });
  const { c, p, errs } = await open([Q(1)], ls);
  await turnOnExplain(p);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  ok(await p.locator('#qNote').inputValue() === '', 'メモ欄は空で始まる（読んで「言えた」ことにしない）');
  ok(await p.locator('#qNotePrev').isHidden(), '答えを見る前は前の文も出さない');

  await p.locator('#qNote').fill('今回の文');
  await p.locator('#revealBtn').click();
  await p.locator('#qNotePrev:not(.hidden)').waitFor();
  const prev = await p.locator('#qNotePrev').innerText();
  ok(/前に書いた文/.test(prev), '答えと一緒に前の文が出る: ' + prev.replace(/\n/g, ' '));
  ok(!/今回の文/.test(prev), '「前に書いた説明」に今回の文が入らない');
  const s = await store(p);
  ok(s.notes['1'] === '今回の文', '保存は上書き: ' + JSON.stringify(s.notes));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【2c】空欄のまま進めても、前のメモは消さない');
{
  const ls = JSON.stringify({ version: 1, sessions: [], stats: {}, notes: { 1: '消えては困る文' } });
  const { c, p, errs } = await open([Q(1)], ls);
  await turnOnExplain(p);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await p.locator('#qNote').fill('   \n  ');      // 空白だけ
  await p.locator('#revealBtn').click();
  await p.locator('#qVerdict:not(.hidden)').waitFor();
  const s = await store(p);
  ok(s.notes['1'] === '消えては困る文', '空白だけなら書き換えない: ' + JSON.stringify(s.notes));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【2d】メモ欄にいる間はキー操作が効かない');
{
  const { c, p, errs } = await open([Q(1)]);
  await turnOnExplain(p);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await p.locator('#qNote').click();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
  ok(await p.locator('#qVerdict').isHidden(), 'メモの改行で答えが開かない');
  ok((await p.locator('#qNote').inputValue()).indexOf('\n') >= 0, '改行はメモに入る');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

/* ============================================================
   3. 面接前チェックリスト
   ============================================================ */
console.log('\n【3】説明できなかった問題と、直近で間違えた問題が並ぶ');
{
  const ls = JSON.stringify({
    version: 1, sessions: [],
    stats: { 2: { seen: 1, correct: 0, wrong: 1, last: 'wrong', lastAt: ago(1) },
             3: { seen: 1, correct: 1, wrong: 0, last: 'correct', lastAt: ago(1) } },
    explain: { 1: { seen: 1, ok: 0, last: 'ng', lastAt: ago(1) } },
    notes: { 1: '自分で書いた説明' }
  });
  const { c, p, errs } = await open([Q(1), Q(2), Q(3)], ls);
  ok(/2問/.test(await p.locator('#cntPrep').textContent()), 'ホームに2問と出る: '
    + await p.locator('#cntPrep').textContent());

  await p.locator('#prepBtn').click();
  await p.locator('#screenPrep:not(.hidden)').waitFor();
  const cards = p.locator('#prepList .prep');
  ok(await cards.count() === 2, '2件並ぶ: ' + await cards.count());
  const first = await cards.nth(0).innerText();
  ok(/問題1/.test(first) && /説明できなかった/.test(first), '説明できなかった問題が先: '
    + first.split('\n')[0]);
  ok(/自分で書いた説明/.test(first), '自分のメモが出る');
  ok(/解説1/.test(first), '解説が出る');
  ok(/あ1/.test(first), '答えが出る');
  const second = await cards.nth(1).innerText();
  ok(/問題2/.test(second) && /直近で間違えた/.test(second), '次に間違えた問題: '
    + second.split('\n')[0]);
  ok(!/問題3/.test(await p.locator('#prepList').innerText()), '正解済みの問題は出さない');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【3b】外した問題はチェックリストにも出さない');
{
  const ls = JSON.stringify({
    version: 1, sessions: [],
    stats: { 1: { seen: 1, correct: 0, wrong: 1, last: 'wrong', lastAt: ago(1) } },
    hidden: { 1: true }
  });
  const { c, p, errs } = await open([Q(1), Q(2)], ls);
  ok(/いまはありません/.test(await p.locator('#cntPrep').textContent()),
     '件数は0: ' + await p.locator('#cntPrep').textContent());
  ok(await p.locator('#prepBtn').isDisabled(), '0件なら押せない');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【3c】0件のときの表示');
{
  const { c, p, errs } = await open([Q(1)]);
  ok(await p.locator('#prepBtn').isDisabled(), 'ボタンは押せない');
  await p.evaluate(() => { document.getElementById('prepBtn').disabled = false; });
  await p.locator('#prepBtn').click();
  await p.locator('#screenPrep:not(.hidden)').waitFor();
  ok(/読み返すところがありません/.test(await p.locator('#prepList').innerText()),
     '空の説明が出る');
  ok(await p.locator('#prepCopyBtn').isDisabled(), 'コピーも押せない');
  await p.locator('#prepBackBtn').click();
  await p.locator('#screenHome:not(.hidden)').waitFor();
  ok(true, 'ホームに戻れる');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【3d】テキストとしてコピーできる');
{
  const ls = JSON.stringify({
    version: 1, sessions: [],
    stats: { 1: { seen: 1, correct: 0, wrong: 1, last: 'wrong', lastAt: ago(1) } },
    notes: { 1: '複数行\nのメモ' }
  });
  /* クリップボードを読むには許可がいる。localhost なので付けられる。 */
  const c = await b.newContext({ viewport: { width: 375, height: 812 },
    permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/quiz-data.json', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify([Q(1)]) }));
  await p.addInitScript(v => localStorage.setItem('gcpQuiz.v1', v), ls);
  await p.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });
  await p.locator('#screenHome:not(.hidden)').waitFor();

  await p.locator('#prepBtn').click();
  await p.locator('#screenPrep:not(.hidden)').waitFor();
  ok(/複数行/.test(await p.locator('#prepList').innerText()), '画面に改行入りのメモが出る');

  await p.locator('#prepCopyBtn').click();
  await p.waitForFunction(() => /コピーしました/.test(
    document.getElementById('prepCopyBtn').textContent), null, { timeout: 3000 }).catch(() => {});
  const text = await p.evaluate(() => navigator.clipboard.readText());
  ok(/^# 面接前チェックリスト/.test(text), '見出しから始まる: ' + text.split('\n')[0]);
  ok(/## 1\. 問題1/.test(text), '問題文が入る');
  ok(/- 答え: あ1/.test(text), '答えが入る');
  ok(/- 解説: 解説1/.test(text), '解説が入る');
  ok(/- 自分の説明: 複数行 のメモ/.test(text), 'メモは1行にたたんで入る');
  ok(/- 出典: https:\/\/example\.com\//.test(text), '出典が入る');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

/* ============================================================
   4. 説明モードの記録を Notion から取り込む
   ============================================================ */
console.log('\n【4】"%" つきの明細は explain に入り、stats には入らない');
{
  const rows = [{
    '記録': 'x', '日時': ago(1), 'モード': '全範囲（説明）', '出題数': 2, '正解数': 1,
    '明細': '@' + ago(1) + '|%1:1,2:0',
    'date:日時:start': ago(1)
  }];
  const c = await b.newContext({ viewport: { width: 375, height: 812 } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((rs) => {
    window.claude = { use: n => Promise.resolve(
      n === 'mcp' ? {
        callTool: (s, t) => Promise.resolve(
          t === 'notion-create-pages' ? { payload: { pages: [] } }
                                      : { payload: { results: rs, has_more: false } }),
        watchTool: () => () => {}, listTools: () => Promise.resolve([]) } : null) };
  }, rows);
  await p.route('**/quiz-data.json', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify([Q(1), Q(2)]) }));
  await p.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem('gcpQuiz.v1') || '{}');
    return s.explain && Object.keys(s.explain).length > 0;
  }, null, { timeout: 5000 }).catch(() => {});

  const s = await store(p);
  ok(Object.keys(s.stats || {}).length === 0,
     '4択の成績には入らない: ' + JSON.stringify(s.stats));
  ok(s.explain && s.explain['1'] && s.explain['1'].last === 'ok',
     '「できた」が explain に入る: ' + JSON.stringify(s.explain && s.explain['1']));
  ok(s.explain && s.explain['2'] && s.explain['2'].last === 'ng' && s.explain['2'].ok === 0,
     '「できなかった」も入る: ' + JSON.stringify(s.explain && s.explain['2']));
  ok(await p.locator('#stSeen').textContent() === '0',
     'ホームの「解いた」は増えない: ' + await p.locator('#stSeen').textContent());
  ok(/1問/.test(await p.locator('#cntPrep').textContent()),
     '説明できなかった1問がチェックリストに出る: ' + await p.locator('#cntPrep').textContent());
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【4b】"%" の無い古い明細はこれまでどおり stats に入る');
{
  const rows = [{
    '記録': 'x', '日時': ago(1), 'モード': '全範囲', '出題数': 1, '正解数': 1,
    '明細': '@' + ago(1) + '|1:1',
    'date:日時:start': ago(1)
  }];
  const c = await b.newContext({ viewport: { width: 375, height: 812 } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((rs) => {
    window.claude = { use: n => Promise.resolve(
      n === 'mcp' ? {
        callTool: (s, t) => Promise.resolve(
          t === 'notion-create-pages' ? { payload: { pages: [] } }
                                      : { payload: { results: rs, has_more: false } }),
        watchTool: () => () => {}, listTools: () => Promise.resolve([]) } : null) };
  }, rows);
  await p.route('**/quiz-data.json', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify([Q(1)]) }));
  await p.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem('gcpQuiz.v1') || '{}');
    return s.stats && Object.keys(s.stats).length > 0;
  }, null, { timeout: 5000 }).catch(() => {});
  const s = await store(p);
  ok(s.stats && s.stats['1'] && s.stats['1'].last === 'correct',
     '4択として取り込まれる: ' + JSON.stringify(s.stats && s.stats['1']));
  ok(Object.keys(s.explain || {}).length === 0,
     'explain には入らない: ' + JSON.stringify(s.explain));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【4c】説明モードの明細は学習の記録の曲線に混ぜない');
{
  /* 説明モードを1回解いた直後の形。explain と、"%" つきの明細が両方ある。 */
  const ls = JSON.stringify({
    version: 1, stats: {},
    explain: { 1: { seen: 1, ok: 1, last: 'ok', lastAt: ago(2) },
               2: { seen: 1, ok: 1, last: 'ok', lastAt: ago(2) } },
    sessions: [{ at: ago(2), label: '全範囲（説明）', total: 2, correct: 2,
                 detail: '@' + ago(2) + '|%1:1,2:1' }]
  });
  const { c, p, errs } = await open([Q(1), Q(2)], ls);
  await p.locator('#progBtn').click();
  await p.locator('#screenProgress:not(.hidden)').waitFor();
  ok(await p.locator('#pgCover').textContent() === '0%',
     'カバー率は 0%（4択では1問も正解していない）: ' + await p.locator('#pgCover').textContent());
  ok(/100%/.test(await p.locator('#pgExplain').textContent()),
     '説明できた率のほうには出る: ' + await p.locator('#pgExplain').textContent());
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

/* ============================================================
   5. バックアップ / 復元
   ============================================================ */
console.log('\n【5】書き出した JSON に学習記録が全部入る');
{
  const ls = JSON.stringify({
    version: 1,
    sessions: [{ at: ago(1), label: '全範囲', total: 1, correct: 1, detail: '@' + ago(1) + '|1:1' }],
    stats: { 1: { seen: 1, correct: 1, wrong: 0, last: 'correct', lastAt: ago(1), streak: 1 } },
    explain: { 1: { seen: 1, ok: 1, last: 'ok', lastAt: ago(1) } },
    hidden: { 2: true }, notes: { 1: 'メモ' }
  });
  const { c, p, errs } = await open([Q(1), Q(2)], ls);
  await p.locator('#backupBtn').click();
  await p.locator('#screenBackup:not(.hidden)').waitFor();
  const raw = await p.locator('#bkTa').inputValue();
  let j = null;
  try { j = JSON.parse(raw); } catch (e) { /* 下で落とす */ }
  ok(!!j, 'JSON として読める');
  ok(j && j.kind === 'gcpQuiz.backup', '目印が入る: ' + (j && j.kind));
  ok(j && j.state && j.state.sessions.length === 1, 'セッションが入る');
  ok(j && j.state && j.state.stats['1'], '成績が入る');
  ok(j && j.state && j.state.explain['1'], '自己申告が入る');
  ok(j && j.state && j.state.hidden['2'] === true, '外した問題が入る');
  ok(j && j.state && j.state.notes['1'] === 'メモ', 'メモが入る');
  ok(!/"options"/.test(raw), '問題そのものは入れない（quiz-data.json 側）');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【5b】貼り付けた JSON で復元できる');
{
  const backup = {
    kind: 'gcpQuiz.backup', version: 1, exportedAt: ago(0),
    state: {
      version: 1,
      sessions: [{ at: ago(3), label: '全範囲', total: 2, correct: 2, detail: '@' + ago(3) + '|1:1,2:1' }],
      stats: { 1: { seen: 1, correct: 1, wrong: 0, last: 'correct', lastAt: ago(3), streak: 1 },
               2: { seen: 1, correct: 1, wrong: 0, last: 'correct', lastAt: ago(3), streak: 1 } },
      explain: {}, hidden: { 2: true }, notes: { 1: '戻ってきたメモ' }
    }
  };
  const { c, p, errs } = await open([Q(1), Q(2)]);
  p.on('dialog', d => d.accept());
  await p.locator('#backupBtn').click();
  await p.locator('#screenBackup:not(.hidden)').waitFor();
  await p.locator('#bkTa').fill(JSON.stringify(backup));
  await p.locator('#bkRestoreBtn').click();
  await p.waitForTimeout(400);

  ok(/復元しました/.test(await p.locator('#bkMsg').innerText()),
     '復元したと出る: ' + (await p.locator('#bkMsg').innerText()).replace(/\n/g, ' '));
  const s = await store(p);
  ok(s.sessions.length === 1 && s.stats['1'] && s.stats['2'], '成績が入っている');
  ok(s.hidden && s.hidden['2'] === true, '外した問題も戻る');
  ok(s.notes && s.notes['1'] === '戻ってきたメモ', 'メモも戻る');

  await p.locator('#bkBackBtn').click();
  await p.locator('#screenHome:not(.hidden)').waitFor();
  ok(await p.locator('#stTotal').textContent() === '1', 'ホームに反映される（外した1問ぶん減る）');
  ok(await p.locator('#stSeen').textContent() === '1', '解いた数も反映される');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【5c】state だけの JSON も受ける');
{
  const inner = {
    version: 1, sessions: [{ at: ago(1), label: '全範囲', total: 1, correct: 1, detail: '@' + ago(1) + '|1:1' }],
    stats: { 1: { seen: 1, correct: 1, wrong: 0, last: 'correct', lastAt: ago(1) } },
    explain: {}, hidden: {}, notes: {}
  };
  const { c, p, errs } = await open([Q(1)]);
  p.on('dialog', d => d.accept());
  await p.locator('#backupBtn').click();
  await p.locator('#bkTa').fill(JSON.stringify(inner));
  await p.locator('#bkRestoreBtn').click();
  await p.waitForTimeout(400);
  const s = await store(p);
  ok(s.sessions.length === 1, '中身だけでも復元できる');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【5d】壊れた JSON は入れない');
{
  const { c, p, errs } = await open([Q(1)]);
  p.on('dialog', d => d.accept());
  await p.locator('#backupBtn').click();
  await p.locator('#screenBackup:not(.hidden)').waitFor();

  await p.locator('#bkTa').fill('{ これは JSON ではない');
  await p.locator('#bkRestoreBtn').click();
  await p.waitForTimeout(200);
  ok(/JSON として読めません/.test(await p.locator('#bkMsg').innerText()), '読めないと言う');

  await p.locator('#bkTa').fill('{"foo":1}');
  await p.locator('#bkRestoreBtn').click();
  await p.waitForTimeout(200);
  ok(/学習記録が見つかりません/.test(await p.locator('#bkMsg').innerText()), '別物なら断る');

  const s = await store(p);
  ok(!s || !s.sessions || s.sessions.length === 0, '断ったときは何も書かない');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【5e】復元しても、載せられない項目は落として保存し直す');
{
  const bad = {
    kind: 'gcpQuiz.backup', version: 1,
    state: {
      version: 1,
      sessions: [
        { at: ago(1), label: 'ok', total: 1, correct: 1, detail: '@' + ago(1) + '|1:1' },
        { at: ago(2), label: 'detail が文字列でない', total: 1, correct: 1, detail: { x: 1 } },
        { label: '日時がない', total: 1, correct: 1 }
      ],
      stats: { 1: { seen: 1, correct: 1, wrong: 0, last: 'correct', lastAt: ago(1) } },
      notes: { 1: 'ok', 2: 12345 },       // 文字列でないものは落とす
      hidden: { 1: true, 2: false }       // false は「外していない」
    }
  };
  const { c, p, errs } = await open([Q(1), Q(2)], null);
  p.on('dialog', d => d.accept());
  await p.locator('#backupBtn').click();
  await p.locator('#bkTa').fill(JSON.stringify(bad));
  await p.locator('#bkRestoreBtn').click();
  await p.waitForTimeout(400);
  const s = await store(p);
  ok(s.sessions.length === 1, '壊れたセッションは落ちる: ' + s.sessions.length + '件');
  ok(s.notes && s.notes['1'] === 'ok' && s.notes['2'] === undefined,
     '文字列でないメモは落ちる: ' + JSON.stringify(s.notes));
  ok(s.hidden && s.hidden['1'] === true && s.hidden['2'] === undefined,
     'false は入らない: ' + JSON.stringify(s.hidden));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【5f】__proto__ を混ぜた JSON でも汚れない');
{
  const evil = '{"kind":"gcpQuiz.backup","state":{"version":1,"sessions":[],'
    + '"stats":{"__proto__":{"seen":9,"last":"correct"}},'
    + '"notes":{"__proto__":"x"},"hidden":{"__proto__":true}}}';
  const { c, p, errs } = await open([Q(1)]);
  p.on('dialog', d => d.accept());
  await p.locator('#backupBtn').click();
  await p.locator('#bkTa').fill(evil);
  await p.locator('#bkRestoreBtn').click();
  await p.waitForTimeout(400);
  const clean = await p.evaluate(() => ({
    obj: ({}).seen === undefined,
    total: document.getElementById('stTotal').textContent
  }));
  ok(clean.obj, 'Object.prototype が汚れない');
  ok(clean.total === '1', 'ホームが壊れない: ' + clean.total);
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

/* ============================================================
   実装の見張り
   ============================================================ */
console.log('\n【6】実装の見張り');
{
  const src = fs.readFileSync(path.join(QUIZ, 'index.html'), 'utf8');
  ok(/function activeQ\(\)/.test(src), '出題対象は activeQ() 経由');
  ok(!/function poolAll\(\)\{ return QUESTIONS/.test(src), 'poolAll が QUESTIONS 直参照でない');
  ok(/state\.hidden\[String\(id\)\] === true/.test(src), 'hidden は文字列キーで見る');
  ok(/\.slice\(0, NOTE_MAX\)/.test(src), 'メモに上限がある');
  ok(/kind === 'explain'/.test(src), '説明モードの明細を切り分けている');
  ok(/BK_TAG = 'gcpQuiz\.backup'/.test(src), 'バックアップに目印がある');
  ok(/state = loadState\(\);/.test(src), '復元は loadState の検査を通す');

  const art = fs.readFileSync(path.join(QUIZ, 'artifact.html'), 'utf8');
  ok(/id="prepBtn"/.test(art) && /id="backupBtn"/.test(art) && /id="hiddenCard"/.test(art),
     'アーティファクト版にも新しい画面が入っている');
}

await b.close();
console.log('\n' + (f.length ? `FAILURES (${f.length}):\n - ` + f.join('\n - ') : 'ALL PASS'));
process.exit(f.length ? 1 : 0);
