/* 中断カードと並べ替え後のホームを 375px で撮る */
import { launchBrowser } from './browser.mjs';
const b = await launchBrowser();
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
const Q = (id, ch, m, q) => ({ id, chapter: ch, tag: '#' + id, method: m, q,
  options: ['スキャンするバイト数', 'スロットの数', 'ストレージ単価', 'テーブルの数'],
  answer: 0, explanation: '日付でパーティションを切ると、WHERE で絞ったときに読むブロックが減る。',
  source: 'https://cloud.google.com/x', addedAt: '2026-08-01' });
const data = [
  Q(1,1,'構成・前提','プロジェクトが単位になるものは'),
  Q(2,1,'コスト方式','請求先アカウントとの関係は'),
  Q(3,2,'データ方式','BigQuery のパーティションを日付で切ると何が減るか'),
  Q(4,2,'IaC方式','スキーマのドリフトはなぜ起きるか'),
  Q(5,3,'処理方式','Cloud Run の Service と Job の違いは'),
  Q(6,4,'IaC方式','terraform plan の -/+ は何を意味するか'),
  Q(7,5,'運用・監視方式','ログベースのアラートの上限は'),
];
const stats = {
  1:{seen:2,correct:2,wrong:0,last:'correct',lastAt:ago(1),streak:2},
  2:{seen:1,correct:0,wrong:1,last:'wrong',lastAt:ago(1),streak:0},
  3:{seen:3,correct:2,wrong:1,last:'correct',lastAt:ago(9),streak:1},
};
const c = await b.newContext({ viewport:{width:375,height:812}, deviceScaleFactor:2 });
const p = await c.newPage();
await p.route('**/quiz-data.json', r => r.fulfill({ contentType:'application/json', body: JSON.stringify(data) }));
await p.addInitScript(v => localStorage.setItem('gcpQuiz.v1', v),
  JSON.stringify({version:1, sessions:[{at:ago(1),label:'第1章',total:2,correct:1,detail:'@'+ago(1)+'|1:1,2:0'}], stats, explain:{}, hidden:{}, notes:{}}));
await p.goto('http://localhost:8777/index.html', { waitUntil:'networkidle' });
await p.locator('#screenHome:not(.hidden)').waitFor();

// 中断を作る
await p.locator('#modeAll').click();
await p.locator('#screenQuiz:not(.hidden)').waitFor();
await p.locator('#qOpts .opt').nth(0).click();
await p.locator('#qNextWrap:not(.hidden)').waitFor();
await p.locator('#nextBtn').click();
await p.locator('#qOpts .opt').nth(1).click();
await p.locator('#qNextWrap:not(.hidden)').waitFor();
await p.locator('#homeBtn').click();
await p.locator('#screenHome:not(.hidden)').waitFor();

await p.screenshot({ path:'30-home-resume-top.png' });
await p.locator('#screenHome').screenshot({ path:'31-home-full.png' });
await c.close(); await b.close();
console.log('30-home-resume-top.png / 31-home-full.png');
