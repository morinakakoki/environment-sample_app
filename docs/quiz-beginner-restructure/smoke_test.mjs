// 発行前の動作確認。Playwright（Chromium）でローカルの HTML を開いて、
// 「全範囲 10問」の1問目が段階1で、前提欄が見えることを確かめる。
//   node smoke_test.mjs <quiz.html>
// 発行前の HTML は器（doctype/html/head/body）を持たない断片なので、ここで包む。
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const src = process.argv[2];
if (!src) { console.error('usage: node smoke_test.mjs <quiz.html>'); process.exit(2); }
let body = fs.readFileSync(src, 'utf8');
if (!/^\s*<!doctype/i.test(body)) {
  body = '<!doctype html><html><head><meta charset="utf-8"></head><body>' + body + '</body></html>';
}
const tmp = path.join(os.tmpdir(), 'quiz-smoke.html');
fs.writeFileSync(tmp, body);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto('file://' + tmp);
await page.waitForSelector('#screenHome:not(.hidden)', { timeout: 10000 });

const total = await page.textContent('#stTotal');
await page.click('#modeAll');
await page.waitForSelector('#screenQuiz:not(.hidden)');

const level   = await page.textContent('#qLevel');
const premise = await page.evaluate(() => {
  const p = document.getElementById('qPremise');
  return p && !p.classList.contains('hidden') ? p.textContent : '';
});
const chapter = await page.textContent('#qChapter');

// 1問答えて、解説の「戻る先」の章チップがノートへのリンクになっていること
await page.click('.opt');
await page.waitForSelector('#qVerdict:not(.hidden)');
const noteHref = await page.evaluate(() => {
  const a = document.querySelector('#qVerdict .backto a.chip-link');
  return a ? a.getAttribute('href') : '';
});

console.log(JSON.stringify({ total, chapter, level, premiseShown: !!premise, noteHref, pageErrors: errors }, null, 2));
await browser.close();

let bad = 0;
if (errors.length) { console.error('✗ JS エラー'); bad++; }
if (Number(total) !== 71) { console.error('✗ 総問題数が 71 ではない'); bad++; }
// 履歴の無いブラウザで開くので、1問目は必ず段階1（用語）になる
if (!/段階1/.test(level || '')) { console.error('✗ 1問目が段階1ではない: ' + level); bad++; }
if (!/39af473a/.test(noteHref)) { console.error('✗ 章チップがノートへのリンクではない'); bad++; }
process.exit(bad ? 1 : 0);
