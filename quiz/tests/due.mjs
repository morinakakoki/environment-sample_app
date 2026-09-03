/* 間隔反復（そろそろ復習）。

   間違い優先だけだと、一度正解した問題は次に間違えるまで永久に「済み」になる。
   3週間前に1回当てただけの問題と、今日3回続けて当てた問題が同じ扱いになり、
   忘れかけの問題が出てこない——というのを直した分の回帰テスト。

   間隔は 3日 → 1週 → 2週 → 1か月 → 2か月 → 4か月（連続正解の回数で伸びる）。 */
import { launchBrowser } from './browser.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
const QUIZ = path.join(__d, '..');

const f = [];
const ok = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) f.push(m); };
const b = await launchBrowser();

const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
const Q = (id, o) => Object.assign({
  id, chapter: 1, tag: '#1', method: '構成・前提',
  q: '問題' + id, options: ['あ' + id, 'い', 'う', 'え'],
  answer: 0, explanation: '解説', source: 'https://example.com/', addedAt: '2026-08-01',
}, o || {});
// 正解済みの記録を作る。days 日前に、streak 回連続正解した状態。
const okStat = (days, streak) => ({
  seen: streak, correct: streak, wrong: 0, streak: streak,
  last: 'correct', lastAt: ago(days),
});

async function open(data, stats, sessions) {
  const c = await b.newContext({ viewport: { width: 375, height: 812 } });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/quiz-data.json', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
  await p.addInitScript(([st, ss]) => {
    localStorage.setItem('gcpQuiz.v1',
      JSON.stringify({ version: 1, stats: st, sessions: ss || [] }));
  }, [stats || {}, sessions || []]);
  await p.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });
  await p.locator('#screenHome:not(.hidden)').waitFor();
  return { c, p, errs };
}

console.log('\n【1】間隔を過ぎた問題だけが「そろそろ復習」に出る');
{
  const data = [Q(1), Q(2), Q(3), Q(4)];
  const { c, p, errs } = await open(data, {
    1: okStat(1, 1),    // 1日前に初正解 → 間隔3日 → まだ
    2: okStat(5, 1),    // 5日前に初正解 → 3日を過ぎた → 期限切れ
    3: okStat(5, 2),    // 5日前・2連続 → 間隔7日 → まだ
    4: okStat(30, 2),   // 30日前・2連続 → 7日を過ぎた → 期限切れ
  });
  ok(await p.locator('#cntDue').textContent() === '2問',
     '期限切れは2問（連続正解が多いほど間隔が伸びる）: ' + await p.locator('#cntDue').textContent());
  ok(!(await p.locator('#modeDue').isDisabled()), 'ボタンが押せる');

  await p.locator('#modeDue').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const seen = [];
  const n = Number((await p.locator('#qCount').textContent()).split('/')[1].trim());
  ok(n === 2, '2問だけ出題される: ' + n);
  for (let i = 0; i < n; i++) {
    seen.push(await p.locator('#qText').textContent());
    await p.locator('#qOpts .opt').nth(0).click();
    await p.locator('#qVerdict:not(.hidden)').waitFor();
    await p.locator('#nextBtn').click();
  }
  ok(seen.includes('問題2') && seen.includes('問題4'),
     '期限切れの2問が出る: ' + seen.join(' / '));
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【2】期限切れが無いときはボタンが無効');
{
  const { c, p } = await open([Q(1), Q(2)], { 1: okStat(0, 1), 2: okStat(1, 1) });
  ok(await p.locator('#modeDue').isDisabled(), '押せない');
  ok(/いまはありません/.test(await p.locator('#cntDue').textContent()), '「いまはありません」と出る');
  await c.close();
}

console.log('\n【3】出題順：間違い → 期限切れ → 未挑戦 → 済み');
{
  const data = [Q(1, { q: '済み' }), Q(2, { q: '期限切れ' }), Q(3, { q: '未挑戦' }), Q(4, { q: '間違い' })];
  const { c, p } = await open(data, {
    1: okStat(0, 3),                         // 済み（間隔内）
    2: okStat(60, 1),                        // 期限切れ
    4: { seen: 1, correct: 0, wrong: 1, streak: 0, last: 'wrong', lastAt: ago(1) },
  });
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const order = [];
  for (let i = 0; i < 4; i++) {
    order.push(await p.locator('#qText').textContent());
    await p.locator('#qOpts .opt').nth(0).click();
    await p.locator('#qVerdict:not(.hidden)').waitFor();
    await p.locator('#nextBtn').click();
  }
  ok(order.join(',') === '間違い,期限切れ,未挑戦,済み', '順番どおり: ' + order.join(' → '));
  await c.close();
}

console.log('\n【4】正解するたびに間隔が伸び、間違えると戻る');
{
  const { c, p } = await open([Q(1)], {});
  // 1問正解 → streak 1
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const pickCorrect = async () => {
    const txt = await p.locator('#qOpts .opt .txt').allTextContents();
    const i = txt.findIndex(t => t.startsWith('あ'));
    await p.locator('#qOpts .opt').nth(i < 0 ? 0 : i).click();
    await p.locator('#qVerdict:not(.hidden)').waitFor();
    await p.locator('#nextBtn').click();
  };
  await pickCorrect();
  await p.locator('#screenResult:not(.hidden)').waitFor();
  let st = await p.evaluate(() => JSON.parse(localStorage.getItem('gcpQuiz.v1')).stats['1']);
  ok(st.streak === 1, '1回正解で streak=1: ' + st.streak);

  await p.locator('#toHomeBtn').click();
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  await pickCorrect();
  await p.locator('#screenResult:not(.hidden)').waitFor();
  st = await p.evaluate(() => JSON.parse(localStorage.getItem('gcpQuiz.v1')).stats['1']);
  ok(st.streak === 2, '2回続けて正解で streak=2: ' + st.streak);

  // わざと間違える
  await p.locator('#toHomeBtn').click();
  await p.locator('#screenHome:not(.hidden)').waitFor();
  await p.locator('#modeAll').click();
  await p.locator('#screenQuiz:not(.hidden)').waitFor();
  const txt = await p.locator('#qOpts .opt .txt').allTextContents();
  const bad = txt.findIndex(t => !t.startsWith('あ'));
  await p.locator('#qOpts .opt').nth(bad < 0 ? 1 : bad).click();
  await p.locator('#qVerdict:not(.hidden)').waitFor();
  await p.locator('#nextBtn').click();
  await p.locator('#screenResult:not(.hidden)').waitFor();
  st = await p.evaluate(() => JSON.parse(localStorage.getItem('gcpQuiz.v1')).stats['1']);
  ok(st.streak === 0, '間違えると streak=0 に戻る: ' + st.streak);
  await c.close();
}

console.log('\n【5】定着率が時間で下がる（これが直したかったこと）');
{
  // 4問すべて「正解済み」。ただし2問は間隔を過ぎている。
  const data = [Q(1), Q(2), Q(3), Q(4)];
  const { c, p } = await open(data, {
    1: okStat(0, 1), 2: okStat(1, 1),      // 間隔内
    3: okStat(90, 1), 4: okStat(90, 1),    // 過ぎた
  });
  await p.locator('#progBtn').click();
  await p.locator('#screenProgress:not(.hidden)').waitFor();
  ok(await p.locator('#pgCover').textContent() === '100%',
     'カバー率は 100%（一度は全部正解しているので下がらない）');
  ok(await p.locator('#pgRetain').textContent() === '50%',
     '定着率は 50%（2問は間隔を過ぎたので外れる）: ' + await p.locator('#pgRetain').textContent());
  const t = await p.locator('#screenProgress').innerText();
  ok(/間隔/.test(t) && /そろそろ復習/.test(t), '画面に「間隔を過ぎると外れる」と書いてある');
  await c.close();
}

console.log('\n【6】古い記録（streak が無い）でも壊れない');
{
  // streak を持たない、以前のバージョンで書かれた記録
  const { c, p, errs } = await open([Q(1), Q(2)], {
    1: { seen: 3, correct: 3, wrong: 0, last: 'correct', lastAt: ago(1) },   // 間隔内とみなす
    2: { seen: 3, correct: 3, wrong: 0, last: 'correct', lastAt: ago(30) },  // 過ぎている
  });
  ok(await p.locator('#cntDue').textContent() === '1問',
     'streak 無しは1回正解とみなして判定: ' + await p.locator('#cntDue').textContent());
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【7】lastAt が壊れていても期限切れにしない（誤爆させない）');
{
  const { c, p, errs } = await open([Q(1), Q(2)], {
    1: { seen: 1, correct: 1, wrong: 0, streak: 1, last: 'correct', lastAt: 'こわれた日付' },
    2: { seen: 1, correct: 1, wrong: 0, streak: 1, last: 'correct', lastAt: null },
  });
  ok(await p.locator('#modeDue').isDisabled(), '期限切れ扱いにしない');
  ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  await c.close();
}

console.log('\n【7b】Notion 同期で streak が消えない（同期のたびに間隔が3日に戻っていた）');
{
  const LOGVIEW = 'c68a3cb4';
  const row = (at, pairs) => ({
    '記録': 'x', '日時': at.slice(0, 10), 'モード': '全範囲', '出題数': pairs.length,
    '正解数': pairs.filter(x => x[1]).length, '正答率': 1,
    '明細': '@' + at + '|' + pairs.map(x => x[0] + ':' + (x[1] ? 1 : 0)).join(','),
  });
  const openWithRemote = async (stats, rows) => {
    const c = await b.newContext({ viewport: { width: 375, height: 812 } });
    const p = await c.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(([view, rs, st]) => {
      localStorage.setItem('gcpQuiz.v1', JSON.stringify({ version: 1, stats: st, sessions: [] }));
      window.claude = { use: n => Promise.resolve(
        n === 'artifact' ? { publish: () => Promise.resolve() } :
        n === 'mcp' ? {
          callTool: (s, t, i) => {
            if (t === 'notion-create-pages') return Promise.resolve({ payload: { pages: [] } });
            if (i && i.data && i.data.view_url && i.data.view_url.indexOf(view) >= 0)
              return Promise.resolve({ payload: { has_more: false, results: rs } });
            return Promise.resolve({ payload: { results: [], has_more: false } });
          }, watchTool: () => () => {}, listTools: () => Promise.resolve([]) } : null) };
    }, [LOGVIEW, rows, stats]);
    await p.route('**/quiz-data.json', r =>
      r.fulfill({ contentType: 'application/json', body: JSON.stringify([Q(1)]) }));
    await p.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });
    await p.locator('#screenHome:not(.hidden)').waitFor();
    await p.locator('#syncLine.ok').waitFor({ timeout: 5000 }).catch(() => {});
    const st = await p.evaluate(() => JSON.parse(localStorage.getItem('gcpQuiz.v1')).stats['1']);
    await c.close();
    return { st, errs };
  };

  // (a) 手元が新しい: リモートは自分が送った古い分だけ → streak は手元の値のまま
  {
    const { st, errs } = await openWithRemote({ 1: okStat(0.1, 4) }, [row(ago(1), [[1, true]])]);
    ok(st && st.streak === 4, '手元が新しければ手元の streak を保つ: ' + (st && st.streak));
    ok(errs.length === 0, '例外なし' + (errs.length ? ': ' + errs[0] : ''));
  }
  // (b) リモートが新しい（別端末で解いた）: リモート明細から数え直す。
  //     自分が送った分も明細に含まれるので二重には数えない
  {
    const { st } = await openWithRemote({ 1: okStat(1, 2) },
      [row(ago(2), [[1, true]]), row(ago(1), [[1, true]]), row(ago(0.5), [[1, true]])]);
    ok(st && st.streak === 3, '別端末の正解を足して 3: ' + (st && st.streak));
  }
  // (c) リモートの直近が間違い → 0 に戻る
  {
    const { st } = await openWithRemote({ 1: okStat(1, 4) },
      [row(ago(1), [[1, true]]), row(ago(0.5), [[1, false]])]);
    ok(st && st.streak === 0 && st.last === 'wrong', '直近が間違いなら 0: ' + JSON.stringify(st));
  }
  // (d) リモートにしか無い id: 明細から数えた値になる
  {
    const { st } = await openWithRemote({},
      [row(ago(3), [[1, false]]), row(ago(2), [[1, true]]), row(ago(1), [[1, true]])]);
    ok(st && st.streak === 2, 'リモートだけの記録は明細から数えて 2: ' + (st && st.streak));
  }
}

console.log('\n【8】間隔の定義（実装の見張り）');
{
  const src = fs.readFileSync(path.join(QUIZ, 'index.html'), 'utf8');
  const m = src.match(/var DUE_DAYS = \[([^\]]+)\]/);
  ok(!!m, 'DUE_DAYS が定義されている');
  if (m) {
    const days = m[1].split(',').map(x => Number(x.trim()));
    ok(days.length >= 4, '段階が4つ以上ある: ' + days.join(','));
    ok(days.every((d, i) => i === 0 || d > days[i - 1]), '間隔が単調に伸びる: ' + days.join(' → '));
    ok(days[0] >= 1, '最短でも1日は空ける: ' + days[0]);
  }
  ok(/wrong\.concat\(due,/.test(src.replace(/\s+/g, ' ')) || /concat\(due/.test(src),
     'prioritize が間違い→期限切れ→… の順に並べている');
}

await b.close();
console.log('\n' + (f.length ? `FAILURES (${f.length}):\n - ` + f.join('\n - ') : 'ALL PASS'));
process.exit(f.length ? 1 : 0);
