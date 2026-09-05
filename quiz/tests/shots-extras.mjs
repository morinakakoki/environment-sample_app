/* 追加機能の見た目を 375px で撮る。数字ではなく目で見る用。 */
import { launchBrowser } from './browser.mjs';
const b = await launchBrowser();
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
const Q = (id, o) => Object.assign({
  id, chapter: 1, tag: '#1', method: 'データ方式',
  q: 'BigQuery のパーティションを日付で切ると、何が減るか',
  options: ['スキャンするバイト数', 'スロットの数', 'ストレージ単価', 'テーブルの数'],
  answer: 0,
  explanation: '日付でパーティションを切ると、WHERE で日付を絞ったときに読むブロックが減る。'
    + '課金はスキャンしたバイト数なので、そのまま料金に効く。',
  source: 'https://cloud.google.com/bigquery/docs/partitioned-tables', addedAt: '2026-08-01',
}, o || {});

const ls = JSON.stringify({
  version: 1,
  sessions: [{ at: ago(1), label: '全範囲', total: 3, correct: 2, detail: '@' + ago(1) + '|1:1,2:0,3:1' }],
  stats: { 2: { seen: 1, correct: 0, wrong: 1, last: 'wrong', lastAt: ago(1) } },
  explain: { 1: { seen: 1, ok: 0, last: 'ng', lastAt: ago(1) } },
  hidden: { 4: true },
  notes: { 1: 'パーティションを日付で切ると、WHERE で絞ったぶんだけ読むブロックが減る。\n'
    + '課金はスキャン量なので、そのまま安くなる。クラスタリングは並び替えで、これとは別。' }
});

const c = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
const p = await c.newPage();
await p.route('**/quiz-data.json', r => r.fulfill({ contentType: 'application/json',
  body: JSON.stringify([Q(1), Q(2, { q: '問題2：Dataform と Dataflow の役割の違いは' }),
                        Q(3, { q: '問題3：Cloud Run のコールドスタートを減らすには' }),
                        Q(4, { q: '問題4：これは出題から外した問題' })]) }));
await p.addInitScript(v => localStorage.setItem('gcpQuiz.v1', v), ls);
await p.goto('http://localhost:8777/index.html', { waitUntil: 'networkidle' });
await p.locator('#screenHome:not(.hidden)').waitFor();

await p.locator('#hiddenToggle').click();
await p.waitForTimeout(200);
await p.locator('#screenHome').screenshot({ path: '20-home-extras.png' });

await p.locator('#prepBtn').click();
await p.locator('#screenPrep:not(.hidden)').waitFor();
await p.screenshot({ path: '21-prep.png', fullPage: true });

await p.locator('#prepBackBtn').click();
await p.locator('#backupBtn').click();
await p.locator('#screenBackup:not(.hidden)').waitFor();
await p.screenshot({ path: '22-backup.png' });

await p.locator('#bkBackBtn').click();
await p.locator('.modesw').click();
await p.locator('#modeAll').click();
await p.locator('#screenQuiz:not(.hidden)').waitFor();
await p.locator('#qNote').fill('日付でパーティションを切ると読むブロックが減る。課金はスキャン量。');
await p.screenshot({ path: '23-note.png' });

await p.locator('#revealBtn').click();
await p.locator('#qVerdict:not(.hidden)').waitFor();
await p.locator('#selfNgBtn').click();
await p.locator('#qNextWrap:not(.hidden)').waitFor();
await p.screenshot({ path: '24-reveal-hide.png', fullPage: true });

await c.close();
await b.close();
console.log('20-home-extras.png / 21-prep.png / 22-backup.png / 23-note.png / 24-reveal-hide.png');
