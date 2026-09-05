/* 段階（level）と前提（premise）。

   このアプリは「作った方式を説明できるか」を試すものだが、説明を試す前に、
   問題文に出てくる用語が分かっている必要がある。maximum_bytes_billed の判定
   タイミングを、課金バイトが何かを知らないまま4択で選ぶのは当てもの以上には
   ならない。そこで問題を3段（1=用語 / 2=仕組み / 3=判断）に分け、章ごとに
   下の段から出す。ここで見るのは主にその「梯子」の効き方と、外れ方。

   梯子は未挑戦にだけ掛ける。間違い・復習には掛けない（もう一度見た問題なので）。
   梯子が掛かりすぎると問題が黙って出てこなくなるので、外れる条件（段階が空の章、
   一度でも正解した問題、出題から外した問題）を1つずつ確かめる。 */
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

/* 一度正解したことにする（everCorrect が真になる最小の記録） */
const done = (n) => ({ seen: n || 1, correct: n || 1, wrong: 0, last: 'correct',
                       streak: n || 1, lastAt: new Date().toISOString() });
/* 一度は正解したが、直近は間違えた */
const mixed = () => ({ seen: 2, correct: 1, wrong: 1, last: 'wrong', streak: 0,
                       lastAt: new Date().toISOString() });

async function open(data, state) {
  const c = await b.newContext({ viewport: { width: 375, height: 812 } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/quiz-data.json', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
  if (state) await p.addInitScript(v => localStorage.setItem('gcpQuiz.v1', v),
    JSON.stringify(Object.assign({ version: 1, stats: {}, sessions: [],
                                   explain: {}, hidden: {}, notes: {} }, state)));
  await p.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });
  await p.locator('#screenHome:not(.hidden)').waitFor();
  return { c, p, errs };
}
const answerOne = async (p) => {
  await p.locator('#qOpts .opt').nth(0).click();
  await p.locator('#qNextWrap:not(.hidden)').waitFor();
};
/* 1セッションぶんの出題を、段階チップの文字で拾う */
async function levels(p) {
  const out = [];
  const total = Number((await p.locator('#qCount').textContent()).split('/')[1]);
  for (let i = 0; i < total; i++) {
    out.push((await p.locator('#qLevel').textContent()).trim());
    await answerOne(p);
    await p.locator('#nextBtn').click();
  }
  return out;
}

console.log('\n【1】段階チップと前提の欄');
{
  const { c, p, errs } = await open([
    Q(1, { level: 1, premise: '課金バイト＝クエリが読んだデータ量。' }),
    Q(2, { level: 1 }),
  ]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();

  /* 段階1（用語）が2問あるので、どちらが先でも段階1。前提の有無だけが違う */
  const seen = [];
  for (let i = 0; i < 2; i++) {
    const lv = (await p.locator('#qLevel').textContent()).trim();
    const shown = await p.locator('#qPremise').isVisible();
    const txt = shown ? (await p.locator('#qPremiseTxt').textContent()) : '';
    seen.push({ lv, shown, txt });
    await answerOne(p);
    await p.locator('#nextBtn').click();
  }
  ok(seen.every(s => s.lv === '段階1 用語'), '段階チップに段階と名前が出る: ' + seen.map(s => s.lv).join(','));
  const withP = seen.find(s => s.shown), without = seen.find(s => !s.shown);
  ok(!!withP && /課金バイト/.test(withP.txt), '前提のある問題では前提が出る: ' + (withP && withP.txt));
  ok(!!without, '前提の無い問題では欄ごと出ない');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【2】段階1が残っている間は、その章の段階2は未挑戦として出ない');
{
  const { c, p, errs } = await open([
    Q(1, { level: 1 }), Q(2, { level: 1 }),
    Q(3, { level: 2 }), Q(4, { level: 2 }),
  ]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const lv = await levels(p);
  ok(lv.length === 2, '出たのは段階1の2問だけ（段階2は待たされる）: ' + lv.length + '問');
  ok(lv.every(x => x === '段階1 用語'), 'すべて段階1: ' + lv.join(','));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【3】段階1を全部正解すると、次から段階2が出る');
{
  const { c, p, errs } = await open([
    Q(1, { level: 1 }), Q(2, { level: 1 }),
    Q(3, { level: 2 }), Q(4, { level: 2 }),
  ], { stats: { 1: done(), 2: done() } });
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const lv = await levels(p);
  ok(lv.filter(x => x === '段階2 仕組み').length === 2, '段階2が2問出る: ' + lv.join(','));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【4】その段階の問題が無い章では止まらない');
{
  /* 実データの第7章（このポートフォリオに当てはめると）は用語を持たない。
     空の段階で止めると、その章が丸ごと永久に出なくなる。
     ここでは段階1・2の両方が空という、いちばん極端な形で見る。 */
  const { c, p, errs } = await open([Q(1, { chapter: 7, level: 3 })]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  ok((await p.locator('#qLevel').textContent()).trim() === '段階3 判断',
     '段階1・2が空でも段階3が出る');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【5】一度でも正解していれば、あとで間違えても上の段階は引っ込まない');
{
  /* 直近の正誤で見ると、1問間違えた瞬間に上の段階の未挑戦がまとめて消える。
     「昨日は出ていた新しい問題が今日は出ない」になるので、通算で数える。 */
  const { c, p, errs } = await open([
    Q(1, { level: 1 }), Q(2, { level: 2 }),
  ], { stats: { 1: mixed() } });
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const lv = await levels(p);
  ok(lv.indexOf('段階2 仕組み') >= 0, '段階2が出る（間違いの1問も一緒に出る）: ' + lv.join(','));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【6】出題から外した問題は、梯子を止めない');
{
  /* 外した問題は解けないので、それが「段階1が残っている」の理由になると
     その章から先に進めなくなる。 */
  const { c, p, errs } = await open([
    Q(1, { level: 1 }), Q(2, { level: 2 }),
  ], { hidden: { 1: true } });
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  ok((await p.locator('#qLevel').textContent()).trim() === '段階2 仕組み',
     '外した段階1に止められず段階2が出る');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【7】ホームの件数は、出題と同じ数え方をする');
{
  const { c, p } = await open([
    Q(1, { level: 1 }), Q(2, { level: 2 }), Q(3, { level: 2 }), Q(4, { level: 3 }),
  ]);
  const cnt = await p.locator('#cntAll').textContent();
  ok(/未挑戦 1（次は第1章）/.test(cnt), '出せる未挑戦だけを数える: ' + cnt);
  ok(/段階待ち 3/.test(cnt), '待たされている数も出す（黙って減らさない）: ' + cnt);
  await c.close();
}
{
  const { c, p } = await open([Q(1, { level: 1 }), Q(2, { level: 1 })]);
  const cnt = await p.locator('#cntAll').textContent();
  ok(!/段階待ち/.test(cnt), '待ちが無ければ「段階待ち」は出さない: ' + cnt);
  await c.close();
}

console.log('\n【8】段階を書いていない問題は「仕組み」として扱う');
{
  /* 1（用語）に倒すと、段階を書いていない既存の問題が全部いちばん下の段に来て、
     それが全部正解になるまで上が出ない、という止まり方をする。 */
  const { c, p } = await open([Q(1, {}), Q(2, { level: 'あ' })]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const lv = await levels(p);
  ok(lv.length === 2 && lv.every(x => x === '段階2 仕組み'),
     '未記入・範囲外はどちらも段階2: ' + lv.join(','));
  await c.close();
}

console.log('\n【9】解説の章チップは基礎知識ノートへのリンク');
{
  const { c, p, errs } = await open([Q(1, { chapter: 2, level: 1 })]);
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await answerOne(p);
  const href = await p.locator('#qVerdict .backto a.chip-note').getAttribute('href');
  ok(href === 'note.html#c2', '章チップが note.html#c2 を指す: ' + href);
  const txt = await p.locator('#qVerdict .backto a.chip-note').textContent();
  ok(/第2章/.test(txt), 'チップの文字は章のまま: ' + txt);
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【10】実装の見張り');
{
  const src = fs.readFileSync(path.join(QUIZ, 'index.html'), 'utf8');
  const art = fs.readFileSync(path.join(QUIZ, 'artifact.html'), 'utf8');
  const data = JSON.parse(fs.readFileSync(path.join(QUIZ, 'quiz-data.json'), 'utf8'));

  ok(/function normLevel/.test(src), '段階の正規化が1か所にまとまっている');
  ok(/level     : normLevel\(r\.level\)/.test(src), '埋め込みデータの段階を正規化している');
  ok(/level     : normLevel\(row\[c\.level\]\)/.test(src), 'Notion 経路も同じ正規化を通る');
  ok(/'addedAt','level','premise'\]/.test(src),
     '貼り付けで足した問題の段階・前提が捨てられない（KEEP に入っている）');
  ok(/level:q\.level, premise:q\.premise/.test(src),
     '出題用のコピーが段階と前提を持ち回る（無いと画面に出ない）');
  ok(/var NOTE_URL = 'note\.html';/.test(src), 'ノートの置き場が相対（Pages とローカル用）');
  ok(/var NOTE_URL = 'https:\/\/claude\.ai\/code\/artifact\//.test(art),
     'アーティファクト版はノートの絶対 URL に差し替わっている');

  /* データ側の約束。前提が長いと問題文の前に壁ができる。 */
  const long = data.filter(q => (q.premise || '').length > 140);
  ok(long.length === 0, '前提は140字以内: 超過 ' + long.length + '問'
     + (long.length ? ' → ' + long.map(q => 'id' + q.id).join(' ') : ''));
  const badLv = data.filter(q => ![1, 2, 3].includes(q.level));
  ok(badLv.length === 0, '全問に段階が入っている: 例外 ' + badLv.length + '問');

  /* 章ごとに、段階1がまったく無い章はどこか（第7章は設計どおり）。
     1〜6章から用語が消えたら、初見の人がその章に入れなくなる。 */
  const noL1 = [1, 2, 3, 4, 5, 6].filter(ch => !data.some(q => q.chapter === ch && q.level === 1));
  ok(noL1.length === 0, '第1〜6章にはそれぞれ段階1がある: 欠け ' + (noL1.join(',') || 'なし'));
}

console.log('\n【11】基礎知識ノート（章チップの行き先）');
{
  const note = fs.readFileSync(path.join(QUIZ, 'note.html'), 'utf8');

  /* 読み物のページは生のまま開かれる（ローカルサーバは Content-Type に charset を
     付けない）。宣言が無いと日本語が化ける。章チップから飛べるようになったぶん、
     化けたページに着く経路が増えた。 */
  for (const f of ['note.html', 'design-doc.html']) {
    const s = fs.readFileSync(path.join(QUIZ, f), 'utf8');
    ok(/^<meta charset=/i.test(s), f + ' の先頭で charset を宣言している');
  }
  const site = fs.readFileSync(path.join(QUIZ, '_site', 'note.html'), 'utf8');
  ok((site.match(/<meta charset=/gi) || []).length === 1, '_site のノートの charset は1つだけ');

  /* 章の id は章番号と対応している（#c2 で第2章に着く）。 */
  const ids = [...note.matchAll(/<details id="c(\d+)"/g)].map(m => Number(m[1]));
  ok(JSON.stringify(ids) === JSON.stringify([1, 2, 3, 4, 5, 6, 7]),
     '章の id が 1〜7 の順に並んでいる: ' + ids.join(','));

  /* 用語カード。本文は「AWS を知っている前提で違うところだけ」なので、
     これが無いと初見の人は本文の比喩から先に躓く。第7章は表だけの章なので除く。 */
  const cards = (note.match(/class="terms"/g) || []).length;
  ok(cards === 6, '第1〜6章に用語カードがある: ' + cards + '章');
  for (const term of ['課金バイト', 'サービスアカウント', 'state（tfstate）', '冪等']) {
    ok(note.includes(term), '用語カードに「' + term + '」がある');
  }
}

await b.close();
console.log('\n' + (f.length ? `FAILURES (${f.length}):\n - ` + f.join('\n - ') : 'ALL PASS'));
process.exit(f.length ? 1 : 0);
