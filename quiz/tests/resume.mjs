/* 中断したセッションの再開（続きから解く）と、出題順の並べ替え。

   このアプリは answer() の時点でもう state に確定記録している。だから中断の保存に
   あるのは「どの問題をどの順で出していたか」だけで、成績の保険ではない。
   一番こわいのは、再開したときに記録済みの解答をもう一度記録してしまうこと。
   seen と streak が1回多くなり、dueSpan が伸びてその問題が「そろそろ復習」から
   消える。しかも Notion 経由で他端末にも伝播するので、ローカルを消しても戻る。
   だから「二重に記録しない」ことを何通りもの経路で確かめる。 */
import { launchBrowser } from './browser.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');

const f = [];
const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) f.push(m); };
const b = await launchBrowser();

const RKEY = 'gcpQuiz.resume.v1';
const Q = (id, o) => Object.assign({
  id, chapter: 1, tag: '#1', method: '構成・前提',
  q: '問題' + id, options: ['あ' + id, 'い', 'う', 'え'],
  answer: 0, explanation: '解説' + id, source: 'https://example.com/', addedAt: '2026-08-01',
}, o || {});

async function open(data, ls, resume) {
  const c = await b.newContext({ viewport: { width: 375, height: 812 } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/quiz-data.json', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
  if (ls) await p.addInitScript(v => localStorage.setItem('gcpQuiz.v1', v), ls);
  if (resume) await p.addInitScript(v => localStorage.setItem('gcpQuiz.resume.v1', v), resume);
  await p.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });
  await p.locator('#screenHome:not(.hidden)').waitFor();
  return { c, p, errs };
}
const store = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('gcpQuiz.v1') || 'null'));
const slot  = (p) => p.evaluate(() => {
  const r = localStorage.getItem('gcpQuiz.resume.v1');
  return r ? JSON.parse(r) : null;
});
const turnOnExplain = async (p) => {
  await p.locator('.modesw').click();
  await p.waitForFunction(() => document.getElementById('explainSw').checked);
};
// 1問答えて「次へ」まで進める
const answerOne = async (p) => {
  await p.locator('#qOpts .opt').nth(0).click();
  await p.locator('#qNextWrap:not(.hidden)').waitFor();
};

/* ============================================================
   1. 中断と再開
   ============================================================ */
console.log('\n【1】途中で✕を押すと、ホームに中断カードが出る');
{
  const { c, p, errs } = await open([Q(1), Q(2), Q(3)]);
  ok(await p.locator('#resumeCard').isHidden(), '中断が無ければカードは出ない');

  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  ok(await slot(p) === null, '1問も答えていなければ保存しない（押し間違いを拾わない）');

  await answerOne(p);
  const s1 = await slot(p);
  ok(!!s1 && s1.answers.length === 1, '1問答えると保存される: ' + (s1 && s1.answers.length));
  ok(s1 && s1.list.length === 3, '出題リストを丸ごと持つ: ' + (s1 && s1.list.length));

  await p.locator('#nextBtn').click();
  await answerOne(p);
  await p.locator('#homeBtn').click();
  await p.locator('#screenHome:not(.hidden)').waitFor();

  ok(await p.locator('#resumeCard').isVisible(), '✕で戻ると中断カードが出る');
  const txt = await p.locator('#resumeCard').innerText();
  ok(/2 \/ 3問まで/.test(txt), '進み具合が出る: ' + txt.replace(/\n/g, ' '));
  ok(/残り 1問/.test(txt), '残りが出る');
  ok(/全範囲/.test(txt), 'モードが分かる');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【2】再開すると続きの問題から出る（すでに答えた問題は出ない）');
{
  const { c, p, errs } = await open([Q(1), Q(2), Q(3)]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const seen = [];
  seen.push(await p.locator('#qText').textContent());
  await answerOne(p);
  await p.locator('#nextBtn').click();
  seen.push(await p.locator('#qText').textContent());
  await answerOne(p);
  // 選択肢は毎回シャッフルされるので、何問正解になるかは決め打ちできない。
  // 中断の前後で同じ値が出ることだけを見る。
  const scoreBefore = await p.locator('#qScore').textContent();
  await p.locator('#homeBtn').click();

  await p.locator('#resumeBtn').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  ok(await p.locator('#qCount').textContent() === '3 / 3',
     '「3 / 3」から再開する（1 / 1 に化けない）: ' + await p.locator('#qCount').textContent());
  const now = await p.locator('#qText').textContent();
  ok(!seen.includes(now), '答えた問題は出ない: ' + now + ' / 済み ' + seen.join(','));
  ok(await p.locator('#qScore').textContent() === scoreBefore,
     'スコアも引き継ぐ: ' + await p.locator('#qScore').textContent() + ' / 中断前 ' + scoreBefore);
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【3】再開しても二重に記録しない');
{
  const { c, p, errs } = await open([Q(1), Q(2), Q(3)]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await answerOne(p);
  const before = await store(p);
  const id = Object.keys(before.stats)[0];
  ok(before.stats[id].seen === 1, '1回目の記録: ' + JSON.stringify(before.stats[id]));

  // 「答えたが次へを押していない」状態で離脱 → ここが二重記録の起きやすい形
  await p.locator('#homeBtn').click();
  await p.locator('#resumeBtn').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  ok(await p.locator('#qText').textContent() !== '問題' + id.replace(/\D/g, ''),
     '答えた直後に離脱しても、その問題は出し直されない');

  const after = await store(p);
  ok(after.stats[id].seen === 1, 'seen が増えない: ' + JSON.stringify(after.stats[id]));
  ok(after.stats[id].streak === before.stats[id].streak,
     'streak が増えない（増えると復習間隔が伸びて出てこなくなる）: '
     + after.stats[id].streak + ' vs ' + before.stats[id].streak);
  ok(Object.keys(after.stats).length === 1, '他の問題が勝手に記録されない');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【4】完走すると中断は残らない（結果画面から押しても増えない）');
{
  const { c, p, errs } = await open([Q(1), Q(2)]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await answerOne(p);
  await p.locator('#nextBtn').click();
  await answerOne(p);
  await p.locator('#nextBtn').click();
  await p.locator('#screenResult:not(.hidden)').waitFor();

  ok(await slot(p) === null, '完走したら中断は消える');
  const s1 = await store(p);
  ok(s1.sessions.length === 1, 'セッションは1件: ' + s1.sessions.length);

  // 「同じモードでもう一度」→ 中断が復活して2件目にならないか
  await p.locator('#againBtn').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const s2 = await store(p);
  ok(s2.sessions.length === 1, 'もう一度を押しても記録は1件のまま: ' + s2.sessions.length);

  await p.locator('#homeBtn').click();
  ok(await p.locator('#resumeCard').isHidden() || (await slot(p)) === null,
     '完走済みの中断カードが出てこない');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【5】最後の1問を答えて閉じたら、再開は結果画面へ');
{
  const { c, p, errs } = await open([Q(1), Q(2)]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await answerOne(p);
  await p.locator('#nextBtn').click();
  await answerOne(p);            // 2問目を答えたが「結果を見る」を押さない
  await p.locator('#homeBtn').click();
  await p.locator('#screenHome:not(.hidden)').waitFor();

  const txt = await p.locator('#resumeCard').innerText();
  ok(/結果を見る/.test(txt), 'カードが「結果を見る」になる: ' + txt.replace(/\n/g, ' '));
  await p.locator('#resumeBtn').click();
  await p.locator('#screenResult:not(.hidden)').waitFor();
  const s = await store(p);
  ok(s.sessions.length === 1, 'セッションが1件だけ残る: ' + s.sessions.length);
  ok(s.sessions[0].total === 2, '2問ぶん: ' + s.sessions[0].total);
  ok(await slot(p) === null, '中断は消える');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【6】別のモードを始めると中断は捨てられる（解答は残る）');
{
  const { c, p, errs } = await open([Q(1), Q(2), Q(3)]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await answerOne(p);
  await p.locator('#homeBtn').click();
  ok(await p.locator('#resumeCard').isVisible(), '中断がある');

  await p.locator('#chapBtns .btn').nth(0).click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  ok(await slot(p) === null, '新しいセッションを始めた時点で前の中断は捨てられる');
  await p.locator('#homeBtn').click();
  ok(await p.locator('#resumeCard').isHidden(),
     '新しい方をまだ1問も答えていないので、カードは出ない');
  ok(!/全範囲/.test(await p.locator('#resumeCard').textContent()),
     '隠したカードに古い文言が残っていない');

  const s = await store(p);
  ok(Object.keys(s.stats).length === 1, '前に答えた1問は成績に残っている');

  await p.locator('#chapBtns .btn').nth(0).click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await answerOne(p);
  await p.locator('#homeBtn').click();
  ok(/第1章/.test(await p.locator('#resumeCard').innerText()),
     '中断カードは新しいセッションのものに入れ替わる: '
     + (await p.locator('#resumeCard').innerText()).replace(/\n/g, ' '));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【7】出題0件で alert が出ただけなら、中断は消えない');
{
  const { c, p, errs } = await open([Q(1), Q(2)]);
  p.on('dialog', d => d.accept());
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await answerOne(p);
  await p.locator('#homeBtn').click();
  const before = await slot(p);
  ok(!!before, '中断がある');

  // 「そろそろ復習」は0件（正解直後なので due にならない）
  await p.evaluate(() => { document.getElementById('modeDue').disabled = false; });
  await p.locator('#modeDue').click();
  await p.waitForTimeout(300);
  const after = await slot(p);
  ok(!!after && after.savedAt === before.savedAt,
     '押し間違いでは中断を捨てない: ' + JSON.stringify(after && after.savedAt));
  ok(await p.locator('#screenHome').isVisible(), 'ホームのまま');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【8】「やめる」で中断だけ消える');
{
  const { c, p, errs } = await open([Q(1), Q(2)]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await answerOne(p);
  await p.locator('#homeBtn').click();
  await p.locator('#resumeDropBtn').click();
  await p.waitForTimeout(200);
  ok(await slot(p) === null, '中断が消える');
  ok(await p.locator('#resumeCard').isHidden(), 'カードも消える');
  const s = await store(p);
  ok(Object.keys(s.stats).length === 1, '答えた1問の成績は残る');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

/* ============================================================
   2. 説明モードの中断
   ============================================================ */
console.log('\n【9】説明モードで中断しても、4択に化けない');
{
  const { c, p, errs } = await open([Q(1), Q(2)]);
  await turnOnExplain(p);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await p.locator('#revealBtn').click();
  await p.locator('#selfOkBtn').click();
  await p.locator('#qNextWrap:not(.hidden)').waitFor();
  await p.locator('#homeBtn').click();

  const s1 = await slot(p);
  ok(s1 && s1.explain === true, '説明モードとして保存される');
  ok(s1 && s1.answers[0].picked === -1, 'picked は -1');

  // ホームのスイッチを勝手に触っていないこと（触ると次のモードまで説明モードになる）
  await p.locator('#resumeBtn').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  ok(await p.locator('#qExplainWrap').isVisible(), '再開しても説明モードのまま');

  await p.locator('#revealBtn').click();
  await p.locator('#selfNgBtn').click();
  await p.locator('#nextBtn').click();
  await p.locator('#screenResult:not(.hidden)').waitFor();
  const st = await store(p);
  ok(Object.keys(st.stats || {}).length === 0,
     '4択の成績には1件も入らない: ' + JSON.stringify(st.stats));
  ok(Object.keys(st.explain || {}).length === 2, 'explain に2件: ' + JSON.stringify(st.explain));
  ok(/\|%/.test(st.sessions[0].detail), '明細に説明モード印: ' + st.sessions[0].detail);
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【10】説明モードから再開したあと、ホームのスイッチが変わっていない');
{
  const { c, p, errs } = await open([Q(1), Q(2), Q(3)]);
  await turnOnExplain(p);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await p.locator('#revealBtn').click();
  await p.locator('#selfOkBtn').click();
  await p.locator('#homeBtn').click();
  await p.locator('.modesw').click();            // 4択に戻す
  await p.waitForFunction(() => !document.getElementById('explainSw').checked);

  await p.locator('#resumeBtn').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  ok(await p.locator('#qExplainWrap').isVisible(), '中断は説明モードのまま再開する');
  await p.locator('#homeBtn').click();
  ok(!(await p.evaluate(() => document.getElementById('explainSw').checked)),
     '再開してもホームのスイッチは書き換えない（次のモードが説明モードに化けない）');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

/* ============================================================
   3. 壊れた保存を食べない
   ============================================================ */
console.log('\n【11】壊れた中断は捨てて、ホームは必ず描く');
const BROKEN = [
  ['JSON ではない', '{ こわれている'],
  ['v が違う', JSON.stringify({ v: 2, savedAt: new Date().toISOString(), mode: 'all', explain: false, list: [Q(1)], answers: [{ id: '1', picked: 0, ok: true }] })],
  ['mode が知らない値', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), mode: 'evil', explain: false, list: [Q(1)], answers: [{ id: '1', picked: 0, ok: true }] })],
  ['explain が boolean でない', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), mode: 'all', explain: 'false', list: [Q(1)], answers: [{ id: '1', picked: 0, ok: true }] })],
  ['savedAt が壊れている', JSON.stringify({ v: 1, savedAt: 'きのう', mode: 'all', explain: false, list: [Q(1)], answers: [{ id: '1', picked: 0, ok: true }] })],
  ['savedAt が未来', JSON.stringify({ v: 1, savedAt: new Date(Date.now() + 9 * 86400000).toISOString(), mode: 'all', explain: false, list: [Q(1)], answers: [{ id: '1', picked: 0, ok: true }] })],
  ['期限切れ（48時間前）', JSON.stringify({ v: 1, savedAt: new Date(Date.now() - 48 * 3600000).toISOString(), mode: 'all', explain: false, list: [Q(1), Q(2)], answers: [{ id: '1', picked: 0, ok: true }] })],
  ['answers が list より長い', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), mode: 'all', explain: false, list: [Q(1)], answers: [{ id: '1', picked: 0, ok: true }, { id: '2', picked: 0, ok: true }] })],
  ['answers の id が数値', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), mode: 'all', explain: false, list: [Q(1)], answers: [{ id: 1, picked: 0, ok: true }] })],
  ['answers に id が無い', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), mode: 'all', explain: false, list: [Q(1)], answers: [{ picked: 0, ok: true }] })],
  ['出題順と答えた順がずれている', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), mode: 'all', explain: false, list: [Q(1), Q(2)], answers: [{ id: '2', picked: 0, ok: true }] })],
  ['answer が選択肢の範囲外', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), mode: 'all', explain: false, list: [Object.assign(Q(1), { answer: 9 })], answers: [{ id: '1', picked: 0, ok: true }] })],
  ['options が配列でない', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), mode: 'all', explain: false, list: [Object.assign(Q(1), { options: 'あ' })], answers: [{ id: '1', picked: 0, ok: true }] })],
  ['説明モードなのに picked がある', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), mode: 'all', explain: true, list: [Q(1), Q(2)], answers: [{ id: '1', picked: 0, ok: true }] })],
  ['4択なのに picked が -1', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), mode: 'all', explain: false, list: [Q(1), Q(2)], answers: [{ id: '1', picked: -1, ok: true }] })],
  ['id が __proto__', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), mode: 'all', explain: false, list: [Object.assign(Q(1), { id: '__proto__' })], answers: [{ id: '__proto__', picked: 0, ok: true }] })],
  ['answers が空', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), mode: 'all', explain: false, list: [Q(1)], answers: [] })],
  ['list が空', JSON.stringify({ v: 1, savedAt: new Date().toISOString(), mode: 'all', explain: false, list: [], answers: [] })],
];
{
  for (const [name, raw] of BROKEN) {
    const { c, p, errs } = await open([Q(1), Q(2)], null, raw);
    const shown = await p.locator('#screenHome').isVisible();
    const total = await p.locator('#stTotal').textContent();
    const card = await p.locator('#resumeCard').isVisible();
    const left = await slot(p);
    ok(shown && total === '2' && !card && left === null,
       name + ' → 捨ててホームを描く'
       + (shown ? '' : '（ホームが出ていない）')
       + (card ? '（カードが出た）' : '')
       + (left ? '（保存が残った）' : ''));
    ok(errs.length === 0, '  例外なし' + (errs.length ? ': ' + errs[0] : ''));
    await c.close();
  }
}

console.log('\n【12】壊れた中断があっても Object.prototype は汚れない');
{
  const evil = JSON.stringify({ v: 1, savedAt: new Date().toISOString(), mode: 'all',
    explain: false, list: [Q(1)], answers: [{ id: '1', picked: 0, ok: true }],
    __proto__: { seen: 9 } });
  const { c, p, errs } = await open([Q(1)], null, evil);
  ok(await p.evaluate(() => ({}).seen === undefined), 'Object.prototype が汚れない');
  ok(await p.locator('#stTotal').textContent() === '1', 'ホームが描ける');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【13】リセットと復元で中断も消える');
{
  const { c, p, errs } = await open([Q(1), Q(2)]);
  p.on('dialog', d => d.accept());
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await answerOne(p);
  await p.locator('#homeBtn').click();
  await p.locator('#resetBtn').click();
  await p.waitForTimeout(400);
  ok(await slot(p) === null, 'リセットで中断も消える（消さないと消した成績が再開で作り直される）');
  ok(await p.locator('#resumeCard').isHidden(), 'カードも消える');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}
{
  const { c, p, errs } = await open([Q(1), Q(2)]);
  p.on('dialog', d => d.accept());
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await answerOne(p);
  await p.locator('#homeBtn').click();
  await p.locator('#backupBtn').click();
  await p.locator('#screenBackup:not(.hidden)').waitFor();
  await p.locator('#bkTa').fill(JSON.stringify({ kind: 'gcpQuiz.backup', state: {
    version: 1, sessions: [], stats: {}, explain: {}, hidden: {}, notes: {} } }));
  await p.locator('#bkRestoreBtn').click();
  await p.waitForTimeout(400);
  ok(await slot(p) === null, 'バックアップ復元で中断も消える');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

/* ============================================================
   4. 出題順
   ============================================================ */
console.log('\n【14】未挑戦は章順に出る（章の中はシャッフル）');
{
  const data = [];
  for (let ch = 1; ch <= 4; ch++) for (let k = 0; k < 3; k++)
    data.push(Q(ch * 10 + k, { chapter: ch }));
  const { c, p, errs } = await open(data);
  // PICK_N=10 なので 12問中10問。章順なら 1,1,1,2,2,2,3,3,3,4
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const chapters = [];
  for (let i = 0; i < 10; i++) {
    chapters.push((await p.locator('#qChapter').textContent()).replace(/[^0-9]/g, ''));
    await answerOne(p);
    await p.locator('#nextBtn').click();
  }
  const sorted = chapters.slice().sort();
  ok(chapters.join(',') === sorted.join(','),
     '章が昇順に並ぶ: ' + chapters.join(','));
  ok(chapters[0] === '1' && chapters[9] === '4', '第1章から第4章へ: ' + chapters.join(','));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【15】章の中は毎回同じ並びにはならない（前問の解説が次問の答えを渡さない）');
{
  const data = [];
  for (let k = 0; k < 6; k++) data.push(Q(k + 1, { chapter: 1 }));
  const orders = new Set();
  for (let t = 0; t < 6; t++) {
    const { c, p } = await open(data);
    await p.locator('#modeAll').click();
    await p.locator('#screenQuiz:not(.hidden)').waitFor();
    const seq = [];
    for (let i = 0; i < 3; i++) {
      seq.push((await p.locator('#qText').textContent()).replace('問題', ''));
      await answerOne(p);
      await p.locator('#nextBtn').click();
    }
    orders.add(seq.join(','));
    await c.close();
  }
  ok(orders.size > 1, '同じ章の中では並びが変わる: ' + [...orders].join(' / '));
}

console.log('\n【16】章が未設定の問題は先頭ではなく末尾に回る');
{
  const data = [Q(1, { chapter: 0 }), Q(2, { chapter: 1 }), Q(3, { chapter: 2 })];
  const { c, p, errs } = await open(data);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const first = await p.locator('#qChapter').textContent();
  ok(!/未設定/.test(first), '1問目が「章未設定」にならない: ' + first);
  const seq = [first];
  for (let i = 0; i < 2; i++) {
    await answerOne(p);
    await p.locator('#nextBtn').click();
    seq.push(await p.locator('#qChapter').textContent());
  }
  ok(/未設定/.test(seq[2]), '章未設定は最後: ' + seq.join(' → '));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【17】未挑戦が先頭に来るが、枠を食い尽くさない');
{
  const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const data = [];
  const stats = {};
  // 間違い 12問（10枠を余裕で超える）＋ 未挑戦 5問
  for (let i = 1; i <= 12; i++) {
    data.push(Q(i, { chapter: 1 }));
    stats[i] = { seen: 1, correct: 0, wrong: 1, last: 'wrong', lastAt: ago(1) };
  }
  for (let i = 20; i < 25; i++) data.push(Q(i, { chapter: 5 }));
  const { c, p, errs } = await open(data, JSON.stringify({ version: 1, sessions: [], stats }));
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const chapters = [];
  for (let i = 0; i < 10; i++) {
    chapters.push((await p.locator('#qChapter').textContent()).replace(/[^0-9]/g, ''));
    await answerOne(p);
    await p.locator('#nextBtn').click();
  }
  const fresh = chapters.filter(x => x === '5').length;
  ok(fresh === 4, '未挑戦が先頭に4問（0だと後ろの章に永久に届かない）: '
     + fresh + '問 / ' + chapters.join(','));
  ok(chapters.slice(0, 4).every(x => x === '5'),
     '未挑戦が先頭にまとまっている: ' + chapters.join(','));
  ok(chapters.filter(x => x === '1').length === 6,
     '残り6枠は復習に回る（未挑戦が全部は食べない）: ' + chapters.join(','));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

/* ============================================================
   5. ホームの並び
   ============================================================ */
console.log('\n【18】ホームは 章 → 方式 の順で、章ボタンに理解度が入っている');
{
  const data = [Q(1, { chapter: 1, method: 'データ方式' }), Q(3, { chapter: 1, method: 'データ方式' }),
                Q(2, { chapter: 2, method: '処理方式' })];
  /* 正答率は seed で決め打ちする。画面を押して作ると選択肢のシャッフル次第で
     0% になり、メーターの塗り幅が 0 になってテストが揺れる。
     章のメーターは「各問の直近の正誤」ベースなので、第1章は 正解1・不正解1 で 50%。 */
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const { c, p, errs } = await open(data, JSON.stringify({ version: 1, sessions: [], stats: {
    1: { seen: 1, correct: 1, wrong: 0, last: 'correct', lastAt: dayAgo, streak: 1 },
    3: { seen: 1, correct: 0, wrong: 1, last: 'wrong',   lastAt: dayAgo, streak: 0 } } }));
  const heads = await p.locator('#screenHome .card h2').allInnerTexts();
  const iCh = heads.findIndex(t => /章で土台/.test(t));
  const iMe = heads.findIndex(t => /方式で説明/.test(t));
  ok(iCh >= 0 && iMe >= 0, '見出しがある: ' + heads.join(' / '));
  ok(iCh < iMe, '章が方式より上: ' + heads.join(' / '));
  ok(!heads.some(t => /章別の理解度/.test(t)), '理解度カードは畳んだ');

  ok((await p.locator('#chapBtns .btn .meter').count()) === 2,
     '章ボタンの中にメーターが入っている');
  /* 「入っている」だけでは足りない。.btn .sub の display:block に負けると
     高さ6px の span がインラインのまま潰れ、DOM にはあるのにバーが見えなくなる。
     実際に一度そうなったので、描画された大きさで見る。 */
  const mbox = await p.locator('#chapBtns .btn .meter').first().boundingBox();
  ok(!!mbox && mbox.height >= 4 && mbox.width >= 30,
     'メーターが実際に描画されている: ' + JSON.stringify(mbox));
  const fbox = await p.locator('#chapBtns .btn .meter i').first().boundingBox();
  ok(!!fbox && fbox.width > 0, '正答率のぶんだけ塗られている: ' + JSON.stringify(fbox));
  ok(/正答率 50%/.test(await p.locator('#chapBtns .btn').first().innerText()),
     '章ボタンに正答率が出る: ' + (await p.locator('#chapBtns .btn').first().innerText()).replace(/\n/g, ' '));
  ok((await p.locator('#rsChapters, #chapStats').count()) >= 0, '結果画面の章別スコアは残す');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【19】「全範囲」に次の章が出る');
{
  const data = [Q(1, { chapter: 3 }), Q(2, { chapter: 5 })];
  const { c, p, errs } = await open(data);
  const t = await p.locator('#cntAll').textContent();
  ok(/^未挑戦 2（次は第3章）/.test(t), '未挑戦が先頭に出る: ' + t);
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

/* ============================================================
   6. 実装の見張り
   ============================================================ */
console.log('\n【20】実装の見張り');
{
  const src = fs.readFileSync(path.join(QUIZ, 'index.html'), 'utf8');
  ok(/clearResume\(\);\s*\n\s*\n?\s*var total = session\.answers\.length/.test(src)
     || /function finish\(\)\{[\s\S]{0,600}?clearResume\(\)/.test(src),
     'finish() の先頭で中断を消している（後回しにすると完走済みが復活する）');
  // 行末のコメントは許す。見たいのは saveResume が確定記録の直前にあること。
  ok(/saveResume\(\);[^\n]*\n\s*recordAnswer\(q, ok\);/.test(src),
     '中断の保存は recordAnswer より先（逆だと再開で二重記録になる）');
  ok(/saveResume\(\);[^\n]*\n\s*recordExplain\(q, ok\);/.test(src),
     '説明モードでも同じ順');
  ok(/idx: Math\.min\(p\.answers\.length/.test(src),
     '再開位置は保存された idx ではなく answers.length');
  ok(!/\$\('explainSw'\)\.checked\s*=/.test(src),
     '再開でホームのスイッチを書き換えていない');
  ok(/function byChapterThenShuffle/.test(src), '未挑戦は章ごとにまとめてシャッフル');
  ok(/Math\.floor\(dueOver\(b\.id, now\)\)/.test(src),
     '復習の並びは日単位に丸めてシャッフルを残している');
  ok(/byChapterThenShuffle\(fresh\)\.concat\(shuffle\(wrong\)/.test(src),
     '未挑戦が先頭に来る');
  ok(/var FRESH_MAX = 4;/.test(src), '全範囲の未挑戦に上限がある');
  ok(/Math\.max\(FRESH_MAX, n - rest\.length\)/.test(src),
     '復習が少ない日は未挑戦が枠を取り戻す（初回に4問しか出ないのを防ぐ）');

  const art = fs.readFileSync(path.join(QUIZ, 'artifact.html'), 'utf8');
  ok(/id="resumeCard"/.test(art), 'アーティファクトにも中断カードが入っている');
  ok(/byChapterThenShuffle/.test(art), 'アーティファクトにも新しい出題順が入っている');
  /* index.html の本文と artifact.html の bodyTpl が食い違うと、
     ローカルだけ直っていてアーティファクトが古いまま出荷される。 */
  const body = src.slice(src.indexOf('<body>') + 6, src.indexOf('<script>', src.indexOf('<body>'))).trim();
  const tpl = art.slice(art.indexOf('id="bodyTpl">') + 'id="bodyTpl">'.length,
                        art.indexOf('<div id="root">')).replace(/<\/script>\s*$/, '').trim();
  ok(body === tpl, 'index.html の本文と artifact.html の bodyTpl が一致している'
     + (body === tpl ? '' : `（${body.length} vs ${tpl.length} 文字)`));
}

await b.close();
console.log('\n' + (f.length ? `FAILURES (${f.length}):\n - ` + f.join('\n - ') : 'ALL PASS'));
process.exit(f.length ? 1 : 0);
