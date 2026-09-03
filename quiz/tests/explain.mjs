/* 説明モード。

   4択は「選択肢を見て正解を認識できるか」を測るが、面接で問われるのは
   「何も無いところから説明を組み立てられるか」。この2つは別の能力なので、
   選択肢を隠して出題し、説明できたかを自己申告する。

   4択の成績（stats）と混ぜないことが要。混ぜると正答率が濁る。 */
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
const store = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('gcpQuiz.v1')));
// チェックボックスは視覚的に隠してあるので、実ユーザーと同じくラベルを押す
const turnOnExplain = async (p) => {
  await p.locator('.modesw').click();
  await p.waitForFunction(() => document.getElementById('explainSw').checked);
};

console.log('\n【1】選択肢を隠して出題する');
{
  const { c, p, errs } = await open([Q(1), Q(2)]);
  await turnOnExplain(p);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();

  ok(await p.locator('#qOpts').isHidden(), '選択肢が見えない');
  ok(await p.locator('#qExplainWrap').isVisible(), '「答えを見る」が出る');
  ok(await p.locator('#qVerdict').isHidden(), '解説はまだ出ない');
  ok(await p.locator('#qSelfWrap').isHidden(), '自己申告もまだ出ない');
  ok(/答えを見る/.test(await p.locator('#revealBtn').textContent()), 'ボタンの文言');

  await p.locator('#revealBtn').click();
  await p.locator('#qVerdict:not(.hidden)').waitFor();
  ok(await p.locator('#qOpts').isVisible(), '答えを見ると選択肢が出る');
  ok((await p.locator('#qOpts .opt.is-correct').count()) === 1, '正解が1つ示される');
  ok(/解説/.test(await p.locator('#qVerdict').innerText()), '解説が出る');
  ok(await p.locator('#qSelfWrap').isVisible(), '自己申告が出る');
  ok(await p.locator('#qNextWrap').isHidden(), '申告するまで「次へ」は出ない');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【2】自己申告は explain に入り、stats を汚さない');
{
  const { c, p } = await open([Q(1), Q(2)]);
  await turnOnExplain(p);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();

  // 未挑戦の問題はシャッフルされるので、出題順は決め打ちできない。
  // 画面に出た問題文から id を割り出して突き合わせる。
  const idOf = async () => (await p.locator('#qText').textContent()).replace('問題', '');
  await p.locator('#revealBtn').click();
  await p.locator('#qSelfWrap:not(.hidden)').waitFor();
  const first = await idOf();
  await p.locator('#selfOkBtn').click();
  await p.locator('#qNextWrap:not(.hidden)').waitFor();
  await p.locator('#nextBtn').click();

  await p.locator('#revealBtn').click();
  await p.locator('#qSelfWrap:not(.hidden)').waitFor();
  const second = await idOf();
  await p.locator('#selfNgBtn').click();
  await p.locator('#nextBtn').click();
  await p.locator('#screenResult:not(.hidden)').waitFor();

  const s = await store(p);
  ok(Object.keys(s.stats || {}).length === 0,
     '4択の成績（stats）には何も入らない: ' + JSON.stringify(s.stats));
  const ids = Object.keys(s.explain || {});
  ok(ids.length === 2, 'explain に2問ぶん入る: ' + ids.join(','));
  const e1 = s.explain[first], e2 = s.explain[second];
  ok(e1 && e1.last === 'ok' && e1.ok === 1,
     `「できた」と申告した問題${first}: ` + JSON.stringify(e1));
  ok(e2 && e2.last === 'ng' && e2.ok === 0,
     `「できなかった」と申告した問題${second}: ` + JSON.stringify(e2));
  await c.close();
}

console.log('\n【3】結果画面が説明モードの文言になる');
{
  const { c, p } = await open([Q(1)]);
  await turnOnExplain(p);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await p.locator('#revealBtn').click();
  // 振り返りカードは「できなかった」問題があるときだけ出るので、そちらで確認する
  await p.locator('#selfNgBtn').click();
  await p.locator('#nextBtn').click();
  await p.locator('#screenResult:not(.hidden)').waitFor();
  const t = await p.locator('#screenResult').innerText();
  ok(/説明できた率/.test(t), '「説明できた率」と出る（正答率ではない）');
  ok(!/正答率/.test(t), '「正答率」とは書かない');
  ok(/説明できなかった問題/.test(t), '振り返りの見出しも説明モード向け');
  ok(!/undefined/.test(t), '振り返りに「undefined」が出ない');
  ok(/自己申告/.test(t) && /説明できなかった/.test(t), '「あなたの解答」ではなく自己申告として出る');
  ok(await p.locator('#retryWrongBtn').isHidden(), '「間違いだけ解く」は出さない（4択の間違いとは別物）');
  await c.close();
}

console.log('\n【4】説明モードの記録は Notion 経由で stats に混ざらない');
{
  const { c, p } = await open([Q(1)]);
  await turnOnExplain(p);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await p.locator('#revealBtn').click();
  await p.locator('#selfOkBtn').click();
  await p.locator('#nextBtn').click();
  await p.locator('#screenResult:not(.hidden)').waitFor();
  const s = await store(p);
  const rec = s.sessions[0];
  /* '' にすると送信対象から外れて Notion に一切残らない。
     "@<日時>|"（信用できる形・中身なし）なら送られるが stats は汚れない。 */
  ok(/^@[^|]+\|$/.test(rec.detail), '明細は「信用できる形で中身なし」: ' + JSON.stringify(rec.detail));
  ok(rec.total === 1 && rec.correct === 1, '件数と正解数は残る');
  ok(/説明/.test(rec.label), 'ラベルで説明モードと分かる: ' + rec.label);
  await c.close();
}

console.log('\n【4b】説明モードのセッションも Notion に送られる（明細なしで）');
{
  const LOGVIEW = 'c68a3cb4';
  const c = await b.newContext({ viewport: { width: 375, height: 812 } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((view) => {
    window.__PUSHED = [];
    window.claude = { use: n => Promise.resolve(
      n === 'artifact' ? { publish: () => Promise.resolve() } :
      n === 'mcp' ? {
        callTool: (s, t, i) => {
          if (t === 'notion-create-pages') { window.__PUSHED.push(i); return Promise.resolve({ payload: { pages: [] } }); }
          return Promise.resolve({ payload: { results: [], has_more: false } });
        }, watchTool: () => () => {}, listTools: () => Promise.resolve([]) } : null) };
  }, LOGVIEW);
  await p.route('**/quiz-data.json', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify([Q(1)]) }));
  await p.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await turnOnExplain(p);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await p.locator('#revealBtn').click();
  await p.locator('#selfOkBtn').click();
  await p.locator('#nextBtn').click();
  await p.locator('#screenResult:not(.hidden)').waitFor();
  await p.waitForFunction(() => window.__PUSHED.length > 0, null, { timeout: 5000 }).catch(() => {});
  const pushed = await p.evaluate(() => window.__PUSHED);
  ok(pushed.length === 1, 'notion-create-pages が呼ばれる: ' + pushed.length + '回');
  const props = pushed[0] && pushed[0].pages && pushed[0].pages[0] && pushed[0].pages[0].properties;
  ok(!!props && /説明/.test(String(props['モード'] || '')), '送られた行のモードに「説明」: ' + (props && props['モード']));
  ok(!!props && /^@[^|]+\|$/.test(String(props['明細'] || '')), '明細は中身なし: ' + (props && props['明細']));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【5】オフにすれば従来どおりの4択');
{
  const { c, p } = await open([Q(1)]);
  await p.locator('#modeAll').click();          // スイッチは触らない（既定オフ）
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  ok(await p.locator('#qOpts').isVisible(), '選択肢が見える');
  ok(await p.locator('#qExplainWrap').isHidden(), '「答えを見る」は出ない');
  await p.locator('#qOpts .opt').nth(0).click();
  await p.locator('#qVerdict:not(.hidden)').waitFor();
  ok(await p.locator('#qSelfWrap').isHidden(), '自己申告は出ない');
  ok(await p.locator('#qNextWrap').isVisible(), 'すぐ「次へ」が出る');
  await p.locator('#nextBtn').click();
  await p.locator('#screenResult:not(.hidden)').waitFor();
  const s = await store(p);
  ok(Object.keys(s.stats).length === 1, '4択は stats に入る');
  ok(Object.keys(s.explain || {}).length === 0, 'explain は空のまま');
  await c.close();
}

console.log('\n【6】キーボードで操作できる');
{
  const { c, p, errs } = await open([Q(1), Q(2)]);
  await turnOnExplain(p);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const idOf2 = async () => (await p.locator('#qText').textContent()).replace('問題', '');
  await p.keyboard.press('Enter');                       // 答えを見る
  await p.locator('#qSelfWrap:not(.hidden)').waitFor();
  ok(true, 'Enter で答えが出る');
  const kFirst = await idOf2();
  await p.keyboard.press('1');                           // できた
  await p.locator('#qNextWrap:not(.hidden)').waitFor();
  ok(true, '1 で「できた」');
  await p.keyboard.press('Enter');                       // 次へ
  await p.locator('#qExplainWrap:not(.hidden)').waitFor();
  await p.keyboard.press('Enter');
  await p.locator('#qSelfWrap:not(.hidden)').waitFor();
  const kSecond = await idOf2();
  await p.keyboard.press('2');                           // できなかった
  await p.keyboard.press('Enter');
  await p.locator('#screenResult:not(.hidden)').waitFor();
  const s = await store(p);
  ok(s.explain[kFirst] && s.explain[kFirst].last === 'ok'
     && s.explain[kSecond] && s.explain[kSecond].last === 'ng',
     `キーボードの申告が記録される（できた=${kFirst} / できなかった=${kSecond}）`);
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【7】申告せずに次へ進めない');
{
  const { c, p } = await open([Q(1), Q(2)]);
  await turnOnExplain(p);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await p.locator('#revealBtn').click();
  await p.locator('#qSelfWrap:not(.hidden)').waitFor();
  const before = await p.locator('#qCount').textContent();
  await p.keyboard.press('Enter');                       // 申告前の Enter は無視
  await p.keyboard.press(' ');
  await p.waitForTimeout(200);
  ok(await p.locator('#qCount').textContent() === before,
     '申告するまで進まない: ' + before + ' → ' + await p.locator('#qCount').textContent());
  ok(await p.locator('#screenQuiz').isVisible(), 'クイズ画面のまま');
  /* 4択の癖で押す Enter が、フォーカスの乗ったボタンを活性化して「できた」を
     勝手に記録していた。申告欄が出たままで、記録も空のままであること。 */
  ok(await p.locator('#qSelfWrap').isVisible(), 'Enter/Space を押しても申告欄は出たまま');
  const s7 = (await store(p)) || {};   // まだ何も保存していなければ null
  ok(Object.keys(s7.explain || {}).length === 0,
     'Enter/Space では申告が記録されない: ' + JSON.stringify(s7.explain));
  const active = await p.evaluate(() => document.activeElement && document.activeElement.id);
  ok(active !== 'selfOkBtn' && active !== 'selfNgBtn',
     '答えを見た直後にボタンへフォーカスが乗っていない: ' + active);
  await c.close();
}

console.log('\n【8】「選べるのに説明できない」問題が学習の記録に出る');
{
  // 4択は正解済み、説明はできなかった
  const ls = JSON.stringify({ version: 1, sessions: [],
    stats: { 1: { seen: 1, correct: 1, wrong: 0, streak: 1, last: 'correct',
                  lastAt: new Date().toISOString() } },
    explain: { 1: { seen: 1, ok: 0, last: 'ng', lastAt: new Date().toISOString() } } });
  const { c, p } = await open([Q(1, { method: 'データ方式' }), Q(2)], ls);
  await p.locator('#progBtn').click();
  await p.locator('#screenProgress:not(.hidden)').waitFor();
  ok(await p.locator('#pgExplain').textContent() === '0%',
     '説明できた率が出る: ' + await p.locator('#pgExplain').textContent());
  ok(await p.locator('#pgGapCard').isVisible(), 'ギャップの注意が出る');
  const g = await p.locator('#pgGapCard').innerText();
  ok(/データ方式/.test(g), 'どの方式かが出る: ' + g.replace(/\n/g, ' ').slice(0, 60));
  await c.close();
}

console.log('\n【9】説明モードを一度も使っていなければギャップは出さない');
{
  const { c, p } = await open([Q(1)]);
  await p.locator('#progBtn').click();
  await p.locator('#screenProgress:not(.hidden)').waitFor();
  ok(await p.locator('#pgExplain').textContent() === '–', '説明できた率は「–」');
  ok(await p.locator('#pgGapCard').isHidden(), 'ギャップの注意は出ない');
  await c.close();
}

console.log('\n【10】履歴リセットで explain も消える');
{
  const ls = JSON.stringify({ version: 1, sessions: [], stats: {},
    explain: { 1: { seen: 1, ok: 1, last: 'ok', lastAt: new Date().toISOString() } } });
  const { c, p } = await open([Q(1)], ls);
  p.on('dialog', d => d.accept());
  await p.locator('#resetBtn').click();
  await p.waitForTimeout(400);
  const s = await store(p);
  ok(Object.keys(s.explain || {}).length === 0, 'explain が空になる: ' + JSON.stringify(s.explain));
  await c.close();
}

console.log('\n【11】実装の見張り');
{
  const src = fs.readFileSync(path.join(QUIZ, 'index.html'), 'utf8');
  ok(/state\.explain\[q\.id\] = e/.test(src), '自己申告は state.explain に書く');
  ok(!/recordAnswer\(q, ok\);\s*\n\s*recordExplain/.test(src), '4択と二重には記録しない');
  ok(/encodeDetail\(nowIso, session\.explain \? \[\] : session\.answers\)/.test(src),
     '説明モードのセッションは明細を「中身なし」で残す（送信はされる）');
  ok(/if\(session && session\.explain\) return;/.test(src),
     'answer() に説明モードの保険が入っている');
}

await b.close();
console.log('\n' + (f.length ? `FAILURES (${f.length}):\n - ` + f.join('\n - ') : 'ALL PASS'));
process.exit(f.length ? 1 : 0);
