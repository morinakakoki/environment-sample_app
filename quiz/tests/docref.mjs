/* 方式設計書との紐付け。

   これまで画面には「データ方式」という区分名しか出ておらず、それが設計書の §4 の
   ことだとも、何を決めている節なのかも分からなかった。方式は章とちがって名前だけでは
   中身が想像できないので、節番号と一行の説明を添える。
   問題が section を持っていれば、節より細かい行（§10 #6 など）まで指す。 */
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
  id, chapter: 1, tag: '#1', method: 'データ方式',
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
const answerOne = async (p) => {
  await p.locator('#qOpts .opt').nth(0).click();
  await p.locator('#qNextWrap:not(.hidden)').waitFor();
};

console.log('\n【1】方式別ボタンに節番号と一行の説明が出る');
{
  const data = [Q(1, { method: 'データ方式' }), Q(2, { method: 'コスト方式' }),
                Q(3, { method: '設計判断' })];
  const { c, p, errs } = await open(data);
  const txt = await p.locator('#methodBtns').innerText();
  ok(/データ方式　§4/.test(txt), '「データ方式　§4」と出る');
  ok(/raw → staging → mart/.test(txt), 'データ方式の説明が出る');
  ok(/コスト方式　§7/.test(txt), '「コスト方式　§7」と出る');
  ok(/課金を止める3層/.test(txt), 'コスト方式の説明が出る');
  ok(/設計判断　§10/.test(txt), '「設計判断　§10」と出る');
  ok(/なぜ B にしたか/.test(txt), '設計判断の説明が出る');
  ok(/まだ解いていません/.test(txt), '未挑戦の表示は残っている');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【2】解説の「戻る先」に方式設計書の指し先が出る');
{
  const { c, p, errs } = await open([Q(1, { method: 'データ方式' })]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await answerOne(p);
  const v = await p.locator('#qVerdict').innerText();
  ok(/戻る先/.test(v), '「戻る先」がある');
  ok(/第1章/.test(v), '章が出る（基礎知識ノート側）');
  ok(/理解度表 #1/.test(v), '理解度表の番号が出る');
  ok(/方式設計書 §4 データ方式/.test(v),
     '方式設計書の節が出る: ' + v.replace(/\n/g, ' ').slice(0, 120));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【3】section があれば節より細かい行を指す');
{
  const { c, p, errs } = await open([Q(1, { method: 'IaC方式', section: '§10 #6 スキーマの所有者' })]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await answerOne(p);
  const v = await p.locator('#qVerdict').innerText();
  ok(/方式設計書 §10 #6 スキーマの所有者/.test(v),
     'section が優先される: ' + v.replace(/\n/g, ' ').slice(0, 140));
  ok(!/§8/.test(v), 'method から引いた §8 は出ない（二重に出さない）');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【4】説明モードの「答えを見る」でも出る');
{
  const { c, p, errs } = await open([Q(1, { method: 'コスト方式' })]);
  await p.locator('.modesw').click();
  await p.waitForFunction(() => document.getElementById('explainSw').checked);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await p.locator('#revealBtn').click();
  await p.locator('#qVerdict:not(.hidden)').waitFor();
  ok(/方式設計書 §7 コスト方式/.test(await p.locator('#qVerdict').innerText()),
     '説明モードでも方式設計書の節が出る');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【5】面接前チェックリストにも出る（画面とコピーの両方）');
{
  const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const ls = JSON.stringify({ version: 1, sessions: [], stats: {
    1: { seen: 1, correct: 0, wrong: 1, last: 'wrong', lastAt: ago(1) } } });
  const c = await b.newContext({ viewport: { width: 375, height: 812 },
    permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/quiz-data.json', r => r.fulfill({ contentType: 'application/json',
    body: JSON.stringify([Q(1, { method: '設計判断', section: '§10 #1 クラウド／DWH の選定' })]) }));
  await p.addInitScript(v => localStorage.setItem('gcpQuiz.v1', v), ls);
  await p.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.locator('#prepBtn').click();
  await p.locator('#screenPrep:not(.hidden)').waitFor();
  ok(/方式設計書 §10 #1 クラウド／DWH の選定/.test(await p.locator('#prepList').innerText()),
     '一覧に出る');

  await p.locator('#prepCopyBtn').click();
  await p.waitForFunction(() => /コピーしました/.test(
    document.getElementById('prepCopyBtn').textContent), null, { timeout: 3000 }).catch(() => {});
  const text = await p.evaluate(() => navigator.clipboard.readText());
  ok(/方式設計書 §10 #1 クラウド／DWH の選定/.test(text),
     'コピーしたテキストにも入る: ' + (text.split('\n')[3] || ''));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【6】知らない方式・壊れた方式名でも落ちない');
{
  const { c, p, errs } = await open([Q(1, { method: '新しい方式' }), Q(2, { method: '__proto__' }),
                                     Q(3, { method: '' })]);
  const txt = await p.locator('#methodBtns').innerText();
  ok(/新しい方式/.test(txt), '知らない方式もボタンには出る');
  ok(!/undefined/.test(txt), 'undefined が出ない: ' + txt.replace(/\n/g, ' ').slice(0, 100));
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  for (let i = 0; i < 3; i++) {
    await answerOne(p);
    const v = await p.locator('#qVerdict').innerText();
    ok(!/undefined/.test(v), (i + 1) + '問目の解説に undefined が出ない');
    await p.locator('#nextBtn').click();
  }
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【7】section が中断セッションでも消えない');
{
  const { c, p, errs } = await open([Q(1, { section: '§4 データ方式（as-of）' }), Q(2), Q(3)]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await answerOne(p);
  await p.locator('#homeBtn').click();
  const slot = await p.evaluate(() => JSON.parse(localStorage.getItem('gcpQuiz.resume.v1')));
  ok(slot && slot.list.some(x => x.section === '§4 データ方式（as-of）'),
     '中断の保存に section が残る（写し忘れるとセッション中に消える）');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【8】実データの紐付け');
{
  const raw = JSON.parse(fs.readFileSync(path.join(QUIZ, 'quiz-data.json'), 'utf8'));
  const qs = Array.isArray(raw) ? raw : raw.questions;
  const withSec = qs.filter(q => q.section);
  ok(withSec.length >= 20, 'section を持つ問題が20問以上: ' + withSec.length + '問');
  ok(withSec.every(q => /^§\d/.test(q.section)),
     'すべて § から始まる: ' + withSec.filter(q => !/^§\d/.test(q.section)).map(q => q.id).join(','));
  ok(qs.every(q => !q.method || /^(構成・前提|処理方式|データ方式|認証・権限方式|運用・監視方式|コスト方式|IaC方式|設計判断)$/.test(q.method)),
     '方式名がすべて設計書の区分に収まっている');

  const src = fs.readFileSync(path.join(QUIZ, 'index.html'), 'utf8');
  const m = src.match(/var METHOD_DOC = \{([\s\S]*?)\n\};/);
  ok(!!m, 'METHOD_DOC がある');
  const methods = [...new Set(qs.map(q => q.method).filter(Boolean))];
  const missing = methods.filter(x => !m[1].includes("'" + x + "'"));
  ok(missing.length === 0, '出てくる方式がすべて METHOD_DOC にある: 欠け ' + (missing.join(',') || 'なし'));

  const art = fs.readFileSync(path.join(QUIZ, 'artifact.html'), 'utf8');
  ok(/METHOD_DOC/.test(art) && /"section"/.test(art),
     'アーティファクトにも節の対応と section が入っている');
}

console.log('\n【9】節のチップから方式設計書の該当節へ飛べる');
{
  const { c, p, errs } = await open([
    Q(1, { method: 'データ方式' }),
    Q(2, { method: '構成・前提' }),                              // §1・2・9（複数節）
    Q(3, { method: 'IaC方式', section: '§10 #6 スキーマの所有者' }), // section が優先
    Q(4, { method: '新しい方式' }),                              // METHOD_DOC に無い
  ]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();

  /* 同じ章の中はシャッフルされるので、出題順は決め打ちにしない。
     画面に出ている指し先の文字から、その行き先を引く。 */
  const want = {
    '方式設計書 §4 データ方式'            : '#s4',
    '方式設計書 §1・2・9 構成・前提'      : '#s1',   // 複数節にまたがる方式は先頭へ
    '方式設計書 §10 #6 スキーマの所有者'  : '#s10',  // section が優先される
  };
  const seen = [];
  for (let i = 0; i < 4; i++) {
    await answerOne(p);
    const link = p.locator('#qVerdict .backto a.chip-link.method');
    if (await link.count() === 0) {
      seen.push('（リンクなし）');
      ok(!/方式設計書/.test(await p.locator('#qVerdict .backto').innerText()),
         '節が分からない方式にはチップごと出さない');
    } else {
      const label = (await link.innerText()).trim();
      const href = await link.getAttribute('href');
      seen.push(label);
      ok(want[label] && href.endsWith(want[label]),
         label + ' → ' + want[label] + '（実際 ' + String(href).slice(-5) + '）');
      /* ローカル版と Pages では隣の design-doc.html（同じオリジン）を指す。
         アーティファクト版だけ build-artifact.mjs が絶対 URL に差し替える。 */
      ok(/\/design-doc\.html#s\d+$/.test(href), label + ': 隣の設計書を指している');
      ok(await link.getAttribute('target') === '_blank' &&
         /noopener/.test(await link.getAttribute('rel') || ''),
         label + ': 別タブで開く（noopener 付き）');
    }
    if (i < 3) await p.locator('#nextBtn').click();
  }
  ok(Object.keys(want).every(k => seen.includes(k)) && seen.includes('（リンクなし）'),
     '4通りすべてを通った: ' + seen.join(' / '));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【10】面接前チェックリストからも飛べる（画面とコピーの両方）');
{
  const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const ls = JSON.stringify({ version: 1, sessions: [], stats: {
    1: { seen: 1, correct: 0, wrong: 1, last: 'wrong', lastAt: ago(1) } } });
  const c = await b.newContext({ viewport: { width: 375, height: 812 },
    permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/quiz-data.json', r => r.fulfill({ contentType: 'application/json',
    body: JSON.stringify([Q(1, { method: 'コスト方式' })]) }));
  await p.addInitScript(v => localStorage.setItem('gcpQuiz.v1', v), ls);
  await p.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.locator('#prepBtn').click();
  await p.locator('#screenPrep:not(.hidden)').waitFor();
  const href = await p.locator('#prepList a.chip-link.method').first().getAttribute('href');
  ok(href && href.endsWith('#s7'), '一覧のチップが §7 を指す: ' + String(href).slice(-24));

  await p.locator('#prepCopyBtn').click();
  await p.waitForFunction(() => /コピーしました/.test(
    document.getElementById('prepCopyBtn').textContent), null, { timeout: 3000 }).catch(() => {});
  const text = await p.evaluate(() => navigator.clipboard.readText());
  /* 相対のままだと Notion に貼った先で行き先を失う。絶対 URL に直して載せること。 */
  ok(/\[方式設計書 §7 コスト方式\]\(https?:\/\/[^)]*\/design-doc\.html#s7\)/.test(text),
     'コピーしたテキストは絶対 URL の Markdown リンクになる（Notion に貼っても飛べる）: '
     + (text.match(/\(http[^)]*\)/) || ['なし'])[0]);
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【11】設計書側に行き先の id が実在する');
{
  /* 節番号を振り直したのに設計書の id を直し忘れると、リンクは 404 にならず
     黙って先頭に着く。押しても何も起きないように見えるので、ここで止める。 */
  const doc = fs.readFileSync(path.join(QUIZ, 'design-doc.html'), 'utf8');
  const ids = [...doc.matchAll(/<h2 id="(s\d+)"/g)].map(m => m[1]);
  ok(ids.length === 11, '設計書の見出しに id が11個ある: ' + ids.length);

  const src = fs.readFileSync(path.join(QUIZ, 'index.html'), 'utf8');
  const url = (src.match(/var DOC_URL = '([^']*)'/) || [])[1];
  ok(url === 'design-doc.html', "index.html の DOC_URL は隣の設計書: " + url);

  /* METHOD_DOC の節番号と、実データの section が指す先が全部あるか */
  const secs = [...src.matchAll(/sec:'(§[^']+)'/g)].map(m => m[1]);
  const raw = JSON.parse(fs.readFileSync(path.join(QUIZ, 'quiz-data.json'), 'utf8'));
  const qs = Array.isArray(raw) ? raw : raw.questions;
  const refs = secs.concat(qs.map(q => q.section).filter(Boolean));
  const dead = [...new Set(refs)].filter(r => {
    const m = /^§(\d+)/.exec(r);
    return !m || !ids.includes('s' + m[1]);
  });
  ok(dead.length === 0, '指し先の節がすべて設計書にある: 行き先なし ' + (dead.join(' / ') || 'なし'));

  /* アーティファクト版は隣を読めないので、ビルドで絶対 URL に差し替わっていること。
     差し替えが抜けると、節のチップが sandbox 内の 404 を指す。 */
  const art = fs.readFileSync(path.join(QUIZ, 'artifact.html'), 'utf8');
  const aUrl = (art.match(/var DOC_URL = '([^']*)'/) || [])[1];
  ok(/^https:\/\/claude\.ai\/code\/artifact\//.test(aUrl || ''),
     'artifact.html の DOC_URL は絶対 URL: ' + String(aUrl).slice(0, 46));
  ok(!art.includes("var DOC_URL = 'design-doc.html'"), '相対のまま焼き込まれていない');
}

await b.close();
console.log('\n' + (f.length ? `FAILURES (${f.length}):\n - ` + f.join('\n - ') : 'ALL PASS'));
process.exit(f.length ? 1 : 0);
